export interface Env {
  DB: D1Database
  ASSETS: Fetcher
  // Non-secret integration config from wrangler.jsonc "vars" (override locally in .dev.vars). Empty = not configured.
  ACE_BASE_URL?: string
  INTTRA_BASE_URL?: string
  QUICKBOOKS_BASE_URL?: string // https://sandbox-quickbooks.api.intuit.com or https://quickbooks.api.intuit.com
  // Master key for the credentials an admin saves in Settings > Integrations (AES-GCM, see
  // worker/integrations/secrets.ts). `wrangler secret put CREDENTIALS_KEY`; without it the UI
  // cannot store credentials and only the vendor secrets below apply.
  CREDENTIALS_KEY?: string
  // Vendor credentials, bootstrap/fallback only: a value stored through the admin UI wins.
  // `wrangler secret put <NAME>` in production, `.dev.vars` locally.
  // Values are consumed only in worker/integrations/registry.ts; everything else sees presence booleans.
  ACE_API_KEY?: string
  INTTRA_CLIENT_ID?: string
  INTTRA_API_KEY?: string
  // QuickBooks Online is OAuth 2.0 only. Realm ID and refresh token normally arrive through the
  // "Connect to QuickBooks" flow (or Intuit's OAuth Playground) and are stored encrypted; env values
  // are for local trials, since a vendor-rotated refresh token cannot be written back to env.
  QUICKBOOKS_CLIENT_ID?: string
  QUICKBOOKS_CLIENT_SECRET?: string
  QUICKBOOKS_REALM_ID?: string
  QUICKBOOKS_REFRESH_TOKEN?: string
}

export type Role = 'admin' | 'ops' | 'viewer'

export interface SessionUser {
  id: number
  email: string
  name: string
  title: string
  role: Role
  orgId: number
  orgName: string
  orgType: string
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  })
