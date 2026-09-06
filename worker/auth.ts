import { HttpError, type Env, type Role, type SessionUser } from './env'

const COOKIE = 'tl_session'
const SESSION_TTL_MS = 7 * 24 * 3600 * 1000

const enc = new TextEncoder()

export const b64 = (buf: ArrayBuffer | Uint8Array): string =>
  btoa(String.fromCharCode(...new Uint8Array(buf instanceof Uint8Array ? buf : new Uint8Array(buf))))

export const fromB64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    256,
  )
  return new Uint8Array(bits)
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iterations = 100000
  const hash = await pbkdf2(password, salt, iterations)
  return `pbkdf2$${iterations}$${b64(salt)}$${b64(hash)}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterStr, saltB64, hashB64] = stored.split('$')
  if (scheme !== 'pbkdf2') return false
  const expected = fromB64(hashB64)
  const actual = await pbkdf2(password, fromB64(saltB64), Number(iterStr))
  if (actual.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i]
  return diff === 0
}

async function sha256hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(input))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function parseCookie(request: Request): string | null {
  const header = request.headers.get('cookie') ?? ''
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === COOKIE) return rest.join('=')
  }
  return null
}

export function sessionCookie(request: Request, token: string, maxAgeSeconds: number): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : ''
  return `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}${secure}`
}

export async function createSession(env: Env, request: Request, userId: number): Promise<string> {
  const raw = crypto.getRandomValues(new Uint8Array(32))
  const token = b64(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const now = new Date()
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256hex(token), userId, now.toISOString(), new Date(now.getTime() + SESSION_TTL_MS).toISOString())
    .run()
  return sessionCookie(request, token, SESSION_TTL_MS / 1000)
}

export async function destroySession(env: Env, request: Request): Promise<string> {
  const token = parseCookie(request)
  if (token) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256hex(token)).run()
  }
  return sessionCookie(request, '', 0)
}

export async function getSessionUser(env: Env, request: Request): Promise<SessionUser | null> {
  const token = parseCookie(request)
  if (!token) return null
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.title, u.role, u.org_id, o.name AS org_name, o.type AS org_type
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     JOIN organizations o ON o.id = u.org_id
     WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`,
  )
    .bind(await sha256hex(token), new Date().toISOString())
    .first<{ id: number; email: string; name: string; title: string; role: Role; org_id: number; org_name: string; org_type: string }>()
  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    title: row.title,
    role: row.role,
    orgId: row.org_id,
    orgName: row.org_name,
    orgType: row.org_type,
  }
}

export function requireUser(user: SessionUser | null): SessionUser {
  if (!user) throw new HttpError(401, 'Not authenticated')
  return user
}

export function requireRole(user: SessionUser | null, roles: Role[]): SessionUser {
  const u = requireUser(user)
  if (!roles.includes(u.role)) throw new HttpError(403, 'Insufficient permissions')
  return u
}

// Finance data (invoices) stays in-house: role check plus membership of the internal organization.
export function requireInternal(user: SessionUser | null, roles: Role[]): SessionUser {
  const u = requireRole(user, roles)
  if (u.orgType !== 'internal') throw new HttpError(403, 'Available to internal operations users only')
  return u
}
