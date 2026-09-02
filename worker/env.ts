export interface Env {
  DB: D1Database
  ASSETS: Fetcher
  // Non-secret integration config from wrangler.jsonc "vars" (override locally in .dev.vars). Empty = not configured.
  ACE_BASE_URL?: string
  INTTRA_BASE_URL?: string
  // Secrets: `wrangler secret put <NAME>` in production, `.dev.vars` locally.
  // Values are read only in worker/integrations/registry.ts; everything else sees presence booleans.
  ACE_API_KEY?: string
  INTTRA_CLIENT_ID?: string
  INTTRA_API_KEY?: string
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
