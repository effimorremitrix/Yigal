import type { IntegrationProvider } from '../../src/types'
import { b64, fromB64 } from '../auth'
import type { Env } from '../env'

// Encrypted credential storage. The only module that touches ciphertext; plaintext leaves here
// exclusively through loadStored() and is consumed only in registry.ts.

const enc = new TextEncoder()
const dec = new TextDecoder()
const SCHEME = 'v1'

export const MAX_SECRET_LENGTH = 512

export const hasStorageKey = (env: Env): boolean => Boolean(env.CREDENTIALS_KEY?.trim())

// Last four characters, so an admin can tell which key is stored; never enough to reconstruct one.
export const hintOf = (value: string): string => (value.length > 4 ? value.slice(-4) : '••••')

async function aesKey(env: Env): Promise<CryptoKey> {
  const material = await crypto.subtle.digest('SHA-256', enc.encode(env.CREDENTIALS_KEY!.trim()))
  return crypto.subtle.importKey('raw', material, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function encryptSecret(env: Env, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(env), enc.encode(plaintext))
  return `${SCHEME}$${b64(iv)}$${b64(ct)}`
}

// Never throws: a rotated or missing CREDENTIALS_KEY must degrade the provider to mock,
// exactly like a missing credential, rather than break every read path.
export async function decryptSecret(env: Env, stored: string): Promise<string | null> {
  if (!hasStorageKey(env)) return null
  const [scheme, ivB64, ctB64] = stored.split('$')
  if (scheme !== SCHEME || !ivB64 || !ctB64) return null
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(ivB64) as BufferSource },
      await aesKey(env),
      fromB64(ctB64) as BufferSource,
    )
    return dec.decode(plain)
  } catch {
    console.error('integration credential could not be decrypted (CREDENTIALS_KEY changed?)')
    return null
  }
}

export interface StoredSecret {
  value: string | null // null when decryption failed: the credential is stored but unusable
  hint: string
  updatedAt: string
}

interface CredentialRow {
  name: string
  ciphertext: string
  hint: string
  updated_at: string
}

export async function loadStored(env: Env, provider: IntegrationProvider): Promise<Record<string, StoredSecret>> {
  let rows: CredentialRow[] = []
  try {
    const result = await env.DB.prepare('SELECT name, ciphertext, hint, updated_at FROM integration_credentials WHERE provider = ?')
      .bind(provider)
      .all<CredentialRow>()
    rows = result.results ?? []
  } catch (err) {
    // Table not migrated yet (CI does not run migrations): fall back to env-only credentials.
    console.error('integration_credentials unavailable, using env credentials', err)
    return {}
  }
  const out: Record<string, StoredSecret> = {}
  for (const row of rows) {
    out[row.name] = { value: await decryptSecret(env, row.ciphertext), hint: row.hint, updatedAt: row.updated_at }
  }
  return out
}

export async function saveSecret(env: Env, provider: IntegrationProvider, name: string, value: string, userId: number): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO integration_credentials (provider, name, ciphertext, hint, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(provider, name) DO UPDATE SET ciphertext = excluded.ciphertext, hint = excluded.hint,
       updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
  )
    .bind(provider, name, await encryptSecret(env, value), hintOf(value), userId, new Date().toISOString())
    .run()
}

export async function deleteSecret(env: Env, provider: IntegrationProvider, name: string): Promise<void> {
  await env.DB.prepare('DELETE FROM integration_credentials WHERE provider = ? AND name = ?').bind(provider, name).run()
}
