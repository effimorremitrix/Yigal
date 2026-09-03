import type { IntegrationConfig, IntegrationMode, IntegrationProvider } from '../../src/types'
import type { Env } from '../env'
import { createAceLiveAdapter } from './ace/client'
import { createAceMockAdapter } from './ace/mock'
import { credentials, loadRow, toConfig, type Credentials, type SettingsRow } from './config'
import { IntegrationError } from './errors'
import { createHttpClient } from './http'
import { createInttraLiveAdapter } from './inttra/client'
import { createInttraMockAdapter } from './inttra/mock'
import type { AceAdapter, IntegrationAdapter, InttraAdapter } from './provider'

// The only module that consumes secret VALUES (resolved in config.ts, decrypted in secrets.ts).
// Invariant: a live adapter is never built without complete credentials, whatever the database says,
// so removing a secret — or losing the key that decrypts it — degrades to mock instead of failing.

export interface Resolved<A extends IntegrationAdapter> {
  adapter: A
  config: IntegrationConfig
  row: SettingsRow
}

export const effectiveMode = (row: SettingsRow, creds: Credentials): IntegrationMode =>
  row.mode === 'live' && creds.complete ? 'live' : 'mock'

export async function resolveAce(env: Env): Promise<Resolved<AceAdapter>> {
  const row = await loadRow(env, 'ace')
  const creds = await credentials(env, 'ace', row)
  const mode = effectiveMode(row, creds)
  const adapter =
    mode === 'live'
      ? createAceLiveAdapter(
          createHttpClient({ provider: 'ace', baseUrl: creds.baseUrl!, headers: () => ({ 'x-api-key': creds.values.ACE_API_KEY }) }),
        )
      : createAceMockAdapter()
  return { adapter, config: toConfig(row, creds, mode), row }
}

export async function resolveInttra(env: Env): Promise<Resolved<InttraAdapter>> {
  const row = await loadRow(env, 'inttra')
  const creds = await credentials(env, 'inttra', row)
  const mode = effectiveMode(row, creds)
  const adapter =
    mode === 'live'
      ? createInttraLiveAdapter({ baseUrl: creds.baseUrl!, clientId: creds.values.INTTRA_CLIENT_ID, apiKey: creds.values.INTTRA_API_KEY })
      : createInttraMockAdapter()
  return { adapter, config: toConfig(row, creds, mode), row }
}

export const resolve = (env: Env, provider: IntegrationProvider): Promise<Resolved<IntegrationAdapter>> =>
  provider === 'ace' ? resolveAce(env) : resolveInttra(env)

export function requireEnabled(r: Resolved<IntegrationAdapter>): void {
  if (!r.config.enabled) throw new IntegrationError(r.config.provider, 'disabled', `${r.config.label} integration is disabled`)
}
