import type { IntegrationConfig, IntegrationHealth, IntegrationMode, IntegrationProvider, SecretSource } from '../../src/types'
import type { Env } from '../env'
import { PROVIDER_LABEL } from './provider'
import { hasStorageKey, loadStored } from './secrets'

export interface SettingsRow {
  provider: IntegrationProvider
  enabled: number
  mode: IntegrationMode
  base_url: string | null
  last_check_at: string | null
  last_check_ok: number | null
  last_check_mode: IntegrationMode | null
  last_check_latency_ms: number | null
  last_check_message: string | null
  updated_by: number | null
  updated_at: string
}

export const SECRET_NAMES: Record<IntegrationProvider, readonly string[]> = {
  ace: ['ACE_API_KEY'],
  inttra: ['INTTRA_CLIENT_ID', 'INTTRA_API_KEY'],
}
const BASE_URL_VAR: Record<IntegrationProvider, string> = { ace: 'ACE_BASE_URL', inttra: 'INTTRA_BASE_URL' }

export interface SecretState {
  name: string
  present: boolean
  source: SecretSource // where the value in use comes from; 'db' with present:false = stored but unreadable
  hint: string | null
  updatedAt: string | null
}

export interface Credentials {
  baseUrl: string | null
  baseUrlVar: string
  baseUrlSource: SecretSource
  secrets: SecretState[]
  complete: boolean
  missing: string[] // names of the vars/secrets still needed for live mode
  editable: boolean // credential storage is configured (CREDENTIALS_KEY set)
  values: Record<string, string> // plaintext, for registry.ts only; never reaches a DTO
}

// Database values override the deployment env vars, which stay as the bootstrap/fallback.
// Secret values are consumed exclusively in registry.ts.
export async function credentials(env: Env, provider: IntegrationProvider, row?: SettingsRow): Promise<Credentials> {
  const bag = env as unknown as Record<string, string | undefined>
  const settings = row ?? (await loadRow(env, provider))
  const stored = await loadStored(env, provider)

  const baseUrlVar = BASE_URL_VAR[provider]
  const envBaseUrl = bag[baseUrlVar]?.trim() || null
  const baseUrl = settings.base_url?.trim() || envBaseUrl
  const baseUrlSource = settings.base_url?.trim() ? 'db' : envBaseUrl ? 'env' : null

  const values: Record<string, string> = {}
  const secrets = SECRET_NAMES[provider].map<SecretState>((name) => {
    const entry = stored[name]
    // A stored-but-undecryptable credential is reported missing rather than silently falling back
    // to the env value: the admin needs to know their saved key is not the one in use.
    const value = entry ? entry.value : bag[name]?.trim() || null
    if (value) values[name] = value
    return {
      name,
      present: Boolean(value),
      source: entry ? 'db' : value ? 'env' : null,
      hint: entry?.hint ?? null,
      updatedAt: entry?.updatedAt ?? null,
    }
  })

  const missing = [...(baseUrl ? [] : [baseUrlVar]), ...secrets.filter((s) => !s.present).map((s) => s.name)]
  return {
    baseUrl,
    baseUrlVar,
    baseUrlSource,
    secrets,
    complete: missing.length === 0,
    missing,
    editable: hasStorageKey(env),
    values,
  }
}

const defaultRow = (provider: IntegrationProvider): SettingsRow => ({
  provider,
  enabled: 1,
  mode: 'mock',
  base_url: null,
  last_check_at: null,
  last_check_ok: null,
  last_check_mode: null,
  last_check_latency_ms: null,
  last_check_message: null,
  updated_by: null,
  updated_at: '',
})

export async function loadRow(env: Env, provider: IntegrationProvider): Promise<SettingsRow> {
  try {
    const row = await env.DB.prepare('SELECT * FROM integration_settings WHERE provider = ?').bind(provider).first<SettingsRow>()
    return row ? { ...defaultRow(provider), ...row } : defaultRow(provider)
  } catch (err) {
    // Table not migrated yet (CI does not run migrations): keep read paths alive in mock mode.
    console.error('integration_settings unavailable, using defaults', err)
    return defaultRow(provider)
  }
}

export async function saveToggle(
  env: Env,
  provider: IntegrationProvider,
  patch: { enabled?: boolean; mode?: IntegrationMode },
  userId: number,
): Promise<void> {
  const current = await loadRow(env, provider)
  const enabled = patch.enabled ?? current.enabled === 1
  const mode = patch.mode ?? current.mode
  await env.DB.prepare(
    `INSERT INTO integration_settings (provider, enabled, mode, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(provider) DO UPDATE SET enabled = excluded.enabled, mode = excluded.mode,
       updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
  )
    .bind(provider, enabled ? 1 : 0, mode, userId, new Date().toISOString())
    .run()
}

// null clears the override so the *_BASE_URL var applies again.
export async function saveBaseUrl(env: Env, provider: IntegrationProvider, baseUrl: string | null, userId: number): Promise<void> {
  const current = await loadRow(env, provider)
  await env.DB.prepare(
    `INSERT INTO integration_settings (provider, enabled, mode, base_url, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(provider) DO UPDATE SET base_url = excluded.base_url, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
  )
    .bind(provider, current.enabled, current.mode, baseUrl, userId, new Date().toISOString())
    .run()
}

export async function saveCheck(env: Env, provider: IntegrationProvider, health: IntegrationHealth): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO integration_settings (provider, last_check_at, last_check_ok, last_check_mode, last_check_latency_ms, last_check_message, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(provider) DO UPDATE SET last_check_at = excluded.last_check_at, last_check_ok = excluded.last_check_ok,
       last_check_mode = excluded.last_check_mode, last_check_latency_ms = excluded.last_check_latency_ms,
       last_check_message = excluded.last_check_message`,
  )
    .bind(provider, health.checkedAt, health.ok ? 1 : 0, health.mode, health.latencyMs ?? null, health.message, health.checkedAt)
    .run()
}

export function toConfig(row: SettingsRow, creds: Credentials, effectiveMode: IntegrationMode): IntegrationConfig {
  const lastCheck: IntegrationHealth | null =
    row.last_check_at && row.last_check_mode
      ? {
          ok: row.last_check_ok === 1,
          mode: row.last_check_mode,
          message: row.last_check_message ?? '',
          checkedAt: row.last_check_at,
          latencyMs: row.last_check_latency_ms ?? undefined,
        }
      : null
  return {
    provider: row.provider,
    label: PROVIDER_LABEL[row.provider],
    enabled: row.enabled === 1,
    mode: row.mode,
    effectiveMode,
    baseUrl: creds.baseUrl,
    baseUrlVar: creds.baseUrlVar,
    baseUrlSource: creds.baseUrlSource,
    secrets: creds.secrets, // presence, source and hint only: creds.values is never spread in here
    liveAvailable: creds.complete,
    credentialsEditable: creds.editable,
    lastCheck,
    updatedAt: row.updated_at,
  }
}
