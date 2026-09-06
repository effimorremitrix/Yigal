import { LANES } from '../../src/data/constants'
import type { IntegrationMode, ScheduleResult } from '../../src/types'
import { HttpError, json, type Env, type SessionUser } from '../env'
import { fetchVisible, type ShipmentRow } from '../shipments'
import { credentials, loadRow, saveBaseUrl, saveCheck, saveOauthState, saveToggle, SECRET_NAMES } from './config'
import { IntegrationError, toHttpError } from './errors'
import { isProvider, PROVIDERS, type ShipmentLookup } from './provider'
import { authorizeUrl, exchangeCode, primeTokenCache } from './quickbooks/oauth'
import { requireEnabled, resolve, resolveAce, resolveInttra } from './registry'
import { deleteSecret, hasStorageKey, MAX_SECRET_LENGTH, saveSecret } from './secrets'

const MODES: IntegrationMode[] = ['mock', 'live']

const toLookup = (row: ShipmentRow): ShipmentLookup => ({
  shipmentId: row.id,
  bookingRef: row.booking_ref,
  carrierScac: row.carrier_scac,
  originCode: row.origin_code,
  destinationCode: row.destination_code,
  status: row.status,
  etd: row.etd,
  eta: row.eta,
})

function requireProvider(provider: string) {
  if (!isProvider(provider)) throw new HttpError(404, 'Unknown integration provider')
  return provider
}

// Credentials must not travel in clear text, so a stored base URL is https except against a local stub.
function requireHttpsUrl(raw: string): void {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new HttpError(400, 'baseUrl must be an absolute URL')
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new HttpError(400, 'baseUrl must use https')
  }
}

export async function listIntegrations(env: Env): Promise<Response> {
  const configs = await Promise.all(PROVIDERS.map((p) => resolve(env, p).then((r) => r.config)))
  return json(configs)
}

export async function putIntegration(
  env: Env,
  user: SessionUser,
  providerParam: string,
  body: { enabled?: unknown; mode?: unknown },
): Promise<Response> {
  const provider = requireProvider(providerParam)
  if (body.enabled !== undefined && typeof body.enabled !== 'boolean') throw new HttpError(400, 'enabled must be a boolean')
  if (body.mode !== undefined && !MODES.includes(body.mode as IntegrationMode)) throw new HttpError(400, 'mode must be "mock" or "live"')
  if (body.mode === 'live') {
    const creds = await credentials(env, provider)
    if (!creds.complete) throw new HttpError(400, `Cannot enable live mode: ${creds.missing.join(', ')} not configured`)
  }
  await saveToggle(env, provider, { enabled: body.enabled as boolean | undefined, mode: body.mode as IntegrationMode | undefined }, user.id)
  return json((await resolve(env, provider)).config)
}

// Credential values arrive here and are handed straight to secrets.ts for encryption: they are never
// logged, echoed in the response, or quoted in an error message — only the variable name is.
export async function putCredentials(
  env: Env,
  user: SessionUser,
  providerParam: string,
  body: { baseUrl?: unknown; secrets?: unknown },
): Promise<Response> {
  const provider = requireProvider(providerParam)

  if (body.baseUrl !== undefined) {
    if (body.baseUrl !== null && typeof body.baseUrl !== 'string') throw new HttpError(400, 'baseUrl must be a string or null')
    const url = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : ''
    if (url) requireHttpsUrl(url)
    await saveBaseUrl(env, provider, url.replace(/\/+$/, '') || null, user.id)
  }

  if (body.secrets !== undefined) {
    if (typeof body.secrets !== 'object' || body.secrets === null || Array.isArray(body.secrets)) {
      throw new HttpError(400, 'secrets must be an object of name to value')
    }
    const entries = Object.entries(body.secrets as Record<string, unknown>)
    for (const [name, value] of entries) {
      if (!SECRET_NAMES[provider].includes(name)) throw new HttpError(400, `Unknown credential ${name} for this provider`)
      if (value !== null && typeof value !== 'string') throw new HttpError(400, `${name} must be a string or null`)
      if (typeof value === 'string' && value.trim().length > MAX_SECRET_LENGTH) {
        throw new HttpError(400, `${name} is longer than ${MAX_SECRET_LENGTH} characters`)
      }
    }
    // An empty field means "leave unchanged"; null clears. Clearing needs no key, so it stays available
    // as the recovery path when CREDENTIALS_KEY is gone and the stored values can no longer be read.
    const writes = entries.filter(([, v]) => v === null || (v as string).trim() !== '')
    if (writes.some(([, v]) => v !== null) && !hasStorageKey(env)) {
      throw new HttpError(400, 'Credential storage is not configured: set the CREDENTIALS_KEY secret')
    }
    for (const [name, value] of writes) {
      if (value === null) await deleteSecret(env, provider, name)
      else await saveSecret(env, provider, name, (value as string).trim(), user.id)
    }
  }

  return json((await resolve(env, provider)).config)
}

// Runs even when the provider is disabled: testing credentials before switching on is the point.
export async function testIntegration(env: Env, providerParam: string): Promise<Response> {
  const provider = requireProvider(providerParam)
  const r = await resolve(env, provider)
  const t0 = Date.now()
  const health = await r.adapter.healthCheck()
  await saveCheck(env, provider, { ...health, latencyMs: health.latencyMs ?? Date.now() - t0 })
  return json((await resolve(env, provider)).config)
}

export async function getCustomsStatus(env: Env, user: SessionUser, shipmentId: string): Promise<Response> {
  const row = await fetchVisible(env, user, shipmentId) // org scoping, 404 if invisible
  const r = await resolveAce(env)
  try {
    requireEnabled(r)
    return json(await r.adapter.getCustomsStatus(toLookup(row)))
  } catch (err) {
    throw toHttpError(err)
  }
}

// ---- QuickBooks OAuth 2.0 connect flow ----
// The admin saves client ID + secret (+ base URL) first; this round-trip only adds the realm id and the
// refresh token, into the same encrypted rows the paste flow writes. State lives on the provider row:
// one pending flow per provider, 10 minutes, single use.

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000
const CALLBACK_PATH = '/api/integrations/quickbooks/oauth/callback'
const SETTINGS_PATH = '/settings?tab=integrations'

// Intuit requires the exact registered URI; derive it from the worker's own origin so dev (8787) and
// production each register their own. Must be run against the worker origin, not the Vite proxy.
export const redirectUriFor = (request: Request): string => new URL(CALLBACK_PATH, request.url).toString()

const randomState = (): string =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

export async function startQuickBooksOAuth(env: Env, _user: SessionUser, request: Request): Promise<Response> {
  if (!hasStorageKey(env)) throw new HttpError(400, 'Credential storage is not configured: set the CREDENTIALS_KEY secret')
  const creds = await credentials(env, 'quickbooks')
  const clientId = creds.values.QUICKBOOKS_CLIENT_ID
  if (!creds.baseUrl || !clientId || !creds.values.QUICKBOOKS_CLIENT_SECRET) {
    throw new HttpError(400, 'Save the base URL, QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET before connecting')
  }
  const state = randomState()
  await saveOauthState(env, 'quickbooks', state, new Date(Date.now() + OAUTH_STATE_TTL_MS).toISOString())
  const redirectUri = redirectUriFor(request)
  return json({ url: authorizeUrl({ clientId, redirectUri, state }), redirectUri })
}

// A browser navigation from Intuit, so every outcome is a redirect back to the Settings page.
export async function quickBooksOAuthCallback(env: Env, user: SessionUser | null, request: Request): Promise<Response> {
  const back = (outcome: string) => Response.redirect(new URL(`${SETTINGS_PATH}&quickbooks=${outcome}`, request.url).toString(), 302)
  if (!user) return Response.redirect(new URL('/login', request.url).toString(), 302)
  if (user.role !== 'admin') return back('error&reason=forbidden')

  const q = new URL(request.url).searchParams
  const row = await loadRow(env, 'quickbooks')
  const stateOk = Boolean(row.oauth_state) && q.get('state') === row.oauth_state && (row.oauth_state_expires_at ?? '') > new Date().toISOString()

  if (q.get('error')) {
    // The admin cancelled at Intuit's consent screen (or Intuit refused). Only the pending flow may clear its state.
    if (stateOk) await saveOauthState(env, 'quickbooks', null, null)
    return back(`error&reason=${q.get('error') === 'access_denied' ? 'access_denied' : 'vendor_error'}`)
  }
  // A mismatch never clears the stored state: a stranger hitting the URL must not cancel the admin's flow.
  if (!stateOk) return back('error&reason=invalid_state')
  await saveOauthState(env, 'quickbooks', null, null) // single use, consumed before any network call

  const code = q.get('code')
  const realmId = q.get('realmId')
  if (!code || !realmId || !/^\d+$/.test(realmId)) return back('error&reason=missing_code')

  const creds = await credentials(env, 'quickbooks', row)
  const clientId = creds.values.QUICKBOOKS_CLIENT_ID
  const clientSecret = creds.values.QUICKBOOKS_CLIENT_SECRET
  if (!clientId || !clientSecret || !hasStorageKey(env)) return back('error&reason=not_configured')

  try {
    const tokens = await exchangeCode({ clientId, clientSecret, code, redirectUri: redirectUriFor(request) })
    if (!tokens.refreshToken) throw new IntegrationError('quickbooks', 'auth', 'QuickBooks did not return a refresh token')
    await saveSecret(env, 'quickbooks', 'QUICKBOOKS_REALM_ID', realmId, user.id)
    await saveSecret(env, 'quickbooks', 'QUICKBOOKS_REFRESH_TOKEN', tokens.refreshToken, user.id)
    primeTokenCache(clientId, realmId, tokens)
  } catch (err) {
    console.error('quickbooks oauth exchange failed', err instanceof Error ? err.message : err)
    return back('error&reason=token_exchange')
  }
  return back('connected')
}

export async function searchSchedules(env: Env, request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams
  const origin = q.get('origin') ?? ''
  const destination = q.get('destination') ?? ''
  const ready = new Date(q.get('ready') ?? '')
  if (!LANES.some((l) => l.origin === origin && l.destination === destination)) throw new HttpError(400, 'Unknown trade lane')
  if (Number.isNaN(ready.getTime())) throw new HttpError(400, 'Invalid ready date')
  const r = await resolveInttra(env)
  try {
    requireEnabled(r)
    const schedules = await r.adapter.searchSchedules({ origin, destination, readyDate: ready.toISOString() })
    const result: ScheduleResult = { source: r.config.effectiveMode, schedules }
    return json(result)
  } catch (err) {
    throw toHttpError(err)
  }
}
