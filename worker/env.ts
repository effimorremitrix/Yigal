export interface Env {
  DB: D1Database
  ASSETS: Fetcher
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
