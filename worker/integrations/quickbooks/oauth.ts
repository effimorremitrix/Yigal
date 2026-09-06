import { b64 } from '../../auth'
import { IntegrationError } from '../errors'

// Intuit OAuth 2.0 for QuickBooks Online. There is no API-key mode: every call carries a short-lived
// access token obtained from a refresh token, and Intuit rotates the refresh token itself. The token
// endpoint lives on a fixed host (not the API base URL), speaks form encoding with HTTP Basic auth,
// and reports failures in the 400 body, which is why this module does its own fetch instead of http.ts.

export const INTUIT_AUTHORIZE_URL = 'https://appcenter.intuit.com/connect/oauth2'
export const INTUIT_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'
export const INTUIT_SCOPE = 'com.intuit.quickbooks.accounting'

const DEFAULT_TIMEOUT_MS = 8000
const EXPIRY_MARGIN_MS = 60_000

export interface QuickBooksAuth {
  clientId: string
  clientSecret: string
  realmId: string
  refreshToken: string
  // Invoked only when Intuit hands back a different refresh token. Failures are logged, never thrown:
  // a sync must not fail because the audit write did.
  onRefreshTokenRotated?: (refreshToken: string) => Promise<void>
  timeoutMs?: number
}

export interface TokenSet {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
}

export function authorizeUrl(p: { clientId: string; redirectUri: string; state: string }): string {
  const url = new URL(INTUIT_AUTHORIZE_URL)
  url.searchParams.set('client_id', p.clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', INTUIT_SCOPE)
  url.searchParams.set('redirect_uri', p.redirectUri)
  url.searchParams.set('state', p.state)
  return url.toString()
}

async function tokenRequest(
  creds: { clientId: string; clientSecret: string; timeoutMs?: number },
  form: Record<string, string>,
): Promise<TokenSet> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), creds.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(INTUIT_TOKEN_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
        authorization: `Basic ${b64(new TextEncoder().encode(`${creds.clientId}:${creds.clientSecret}`))}`,
      },
      body: new URLSearchParams(form).toString(),
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new IntegrationError('quickbooks', 'timeout', 'QuickBooks token request timed out')
    }
    throw new IntegrationError('quickbooks', 'network', `QuickBooks token request failed: ${err instanceof Error ? err.message : 'network error'}`)
  } finally {
    clearTimeout(timer)
  }

  // Only the vendor's error code is surfaced; the body is never quoted further.
  let body: TokenResponse = {}
  try {
    body = (await res.json()) as TokenResponse
  } catch {
    body = {}
  }
  if (res.status === 401 || body.error === 'invalid_client') {
    throw new IntegrationError('quickbooks', 'auth', 'QuickBooks rejected the client ID / client secret', res.status)
  }
  if (body.error === 'invalid_grant') {
    throw new IntegrationError(
      'quickbooks',
      'auth',
      'QuickBooks refresh token expired or was revoked: reconnect from Settings > Integrations',
      res.status,
    )
  }
  if (!res.ok) throw new IntegrationError('quickbooks', 'http', `QuickBooks token endpoint responded HTTP ${res.status}`, res.status)
  if (!body.access_token) throw new IntegrationError('quickbooks', 'auth', 'QuickBooks token response did not include an access token')
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? form.refresh_token ?? '',
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  }
}

export function exchangeCode(p: { clientId: string; clientSecret: string; code: string; redirectUri: string; timeoutMs?: number }): Promise<TokenSet> {
  return tokenRequest(p, { grant_type: 'authorization_code', code: p.code, redirect_uri: p.redirectUri })
}

// Per-isolate cache (Workers isolates do not share memory; best effort only). It also carries the
// latest refresh token, so a rotation survives within the isolate even when it cannot be persisted.
const tokenCache = new Map<string, TokenSet>()
const cacheKey = (clientId: string, realmId: string) => `${clientId}:${realmId}`

export function primeTokenCache(clientId: string, realmId: string, tokens: TokenSet): void {
  tokenCache.set(cacheKey(clientId, realmId), tokens)
}

export function dropTokenCache(clientId: string, realmId: string): void {
  tokenCache.delete(cacheKey(clientId, realmId))
}

export async function getAccessToken(auth: QuickBooksAuth): Promise<string> {
  const key = cacheKey(auth.clientId, auth.realmId)
  const cached = tokenCache.get(key)
  if (cached && cached.expiresAt > Date.now() + EXPIRY_MARGIN_MS) return cached.accessToken

  const refreshToken = cached?.refreshToken || auth.refreshToken
  const tokens = await tokenRequest(auth, { grant_type: 'refresh_token', refresh_token: refreshToken })
  tokenCache.set(key, tokens)
  if (tokens.refreshToken && tokens.refreshToken !== refreshToken && auth.onRefreshTokenRotated) {
    try {
      await auth.onRefreshTokenRotated(tokens.refreshToken)
    } catch (err) {
      console.error('quickbooks: could not persist the rotated refresh token', err)
    }
  }
  return tokens.accessToken
}
