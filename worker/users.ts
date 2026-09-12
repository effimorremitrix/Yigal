import { hashPassword } from './auth'
import { readBusinessProfile } from './business'
import { HttpError, json, type Env, type SessionUser } from './env'

// The business profile rides along here so every page has the model on first paint and no screen
// has to flicker between the two vocabularies. It is not authorization: counterparty isolation is
// decided server-side in worker/shipments.ts and never from what the client was told.
export async function getMe(env: Env, user: SessionUser): Promise<Response> {
  const [settings, business] = await Promise.all([
    env.DB.prepare('SELECT * FROM user_settings WHERE user_id = ?').bind(user.id).first(),
    readBusinessProfile(env),
  ])
  return json({ user, settings, business })
}

export async function updateProfile(env: Env, user: SessionUser, body: { name?: string; title?: string }): Promise<Response> {
  const name = (body.name ?? user.name).trim()
  const title = (body.title ?? user.title).trim()
  if (!name || name.length > 80 || title.length > 80) throw new HttpError(400, 'Invalid profile fields')
  await env.DB.prepare('UPDATE users SET name = ?, title = ? WHERE id = ?').bind(name, title, user.id).run()
  return json({ ...user, name, title })
}

export async function listUsers(env: Env): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.title, u.role, u.active, u.org_id, o.name AS org_name, o.type AS org_type
     FROM users u JOIN organizations o ON o.id = u.org_id ORDER BY u.id`,
  ).all()
  const orgs = await env.DB.prepare('SELECT id, name, type FROM organizations ORDER BY id').all()
  return json({ users: rows.results, organizations: orgs.results })
}

export async function createUser(
  env: Env,
  body: { email?: string; name?: string; title?: string; role?: string; orgId?: number; password?: string },
): Promise<Response> {
  const { email, name, role, orgId, password } = body
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Valid email required')
  if (!name?.trim()) throw new HttpError(400, 'Name required')
  if (!role || !['admin', 'ops', 'viewer'].includes(role)) throw new HttpError(400, 'Role must be admin, ops, or viewer')
  if (!orgId) throw new HttpError(400, 'Organization required')
  if (!password || password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters')
  const org = await env.DB.prepare('SELECT id FROM organizations WHERE id = ?').bind(orgId).first()
  if (!org) throw new HttpError(400, 'Unknown organization')
  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()
  if (existing) throw new HttpError(409, 'A user with this email already exists')

  const now = new Date().toISOString()
  const result = await env.DB.prepare(
    'INSERT INTO users (email, name, title, role, org_id, password_hash, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
  )
    .bind(email, name.trim(), (body.title ?? '').trim(), role, orgId, await hashPassword(password), now)
    .run()
  const id = result.meta.last_row_id
  await env.DB.prepare('INSERT INTO user_settings (user_id, updated_at) VALUES (?, ?)').bind(id, now).run()
  return json({ id }, 201)
}

export async function patchUser(
  env: Env,
  actor: SessionUser,
  id: number,
  body: { role?: string; orgId?: number; active?: boolean },
): Promise<Response> {
  const target = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(id).first()
  if (!target) throw new HttpError(404, 'User not found')
  if (body.active === false && id === actor.id) throw new HttpError(400, 'You cannot deactivate your own account')
  if (body.role !== undefined && !['admin', 'ops', 'viewer'].includes(body.role)) throw new HttpError(400, 'Invalid role')
  if (body.orgId !== undefined) {
    const org = await env.DB.prepare('SELECT id FROM organizations WHERE id = ?').bind(body.orgId).first()
    if (!org) throw new HttpError(400, 'Unknown organization')
  }

  const sets: string[] = []
  const binds: unknown[] = []
  if (body.role !== undefined) {
    sets.push('role = ?')
    binds.push(body.role)
  }
  if (body.orgId !== undefined) {
    sets.push('org_id = ?')
    binds.push(body.orgId)
  }
  if (body.active !== undefined) {
    sets.push('active = ?')
    binds.push(body.active ? 1 : 0)
    if (body.active === false) {
      await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run()
    }
  }
  if (sets.length === 0) throw new HttpError(400, 'Nothing to update')
  await env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...binds, id).run()
  return json({ ok: true })
}
