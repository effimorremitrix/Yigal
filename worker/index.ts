import { createSession, destroySession, getSessionUser, requireRole, requireUser, verifyPassword } from './auth'
import { HttpError, json, type Env } from './env'
import { Router, type RequestContext } from './router'
import { addComment, approveDocument, createShipment, getShipment, listShipments } from './shipments'
import { getSettings, putSettings } from './settings'
import { createUser, getMe, listUsers, patchUser, updateProfile } from './users'

const router = new Router()

async function body<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T
  } catch {
    throw new HttpError(400, 'Invalid JSON body')
  }
}

router.add('POST', '/api/auth/login', async ({ request, env }: RequestContext) => {
  const { email, password } = await body<{ email?: string; password?: string }>(request)
  if (!email || !password) throw new HttpError(400, 'Email and password required')
  const row = await env.DB.prepare('SELECT id, password_hash, active FROM users WHERE email = ?')
    .bind(email.trim())
    .first<{ id: number; password_hash: string; active: number }>()
  if (!row || row.active !== 1 || !(await verifyPassword(password, row.password_hash))) {
    throw new HttpError(401, 'Invalid email or password')
  }
  const cookie = await createSession(env, request, row.id)
  const user = await getSessionUser(
    env,
    new Request(request.url, { headers: { cookie: cookie.split(';')[0] } }),
  )
  return json({ user }, 200, { 'set-cookie': cookie })
})

router.add('POST', '/api/auth/logout', async ({ request, env }) => {
  const cookie = await destroySession(env, request)
  return json({ ok: true }, 200, { 'set-cookie': cookie })
})

router.add('GET', '/api/auth/me', async ({ env, user }) => getMe(env, requireUser(user)))

router.add('GET', '/api/shipments', async ({ env, user }) => listShipments(env, requireUser(user)))
router.add('GET', '/api/shipments/:id', async ({ env, user, params }) => getShipment(env, requireUser(user), params.id))
router.add('POST', '/api/shipments', async ({ request, env, user }) =>
  createShipment(env, requireRole(user, ['admin', 'ops']), await body(request)),
)
router.add('POST', '/api/shipments/:id/documents/:docId/approve', async ({ env, user, params }) =>
  approveDocument(env, requireRole(user, ['admin', 'ops']), params.id, params.docId),
)
router.add('POST', '/api/shipments/:id/comments', async ({ request, env, user, params }) => {
  const { text } = await body<{ text?: string }>(request)
  return addComment(env, requireRole(user, ['admin', 'ops']), params.id, (text ?? '').trim())
})

router.add('GET', '/api/settings', async ({ env, user }) => getSettings(env, requireUser(user)))
router.add('PUT', '/api/settings', async ({ request, env, user }) => putSettings(env, requireUser(user), await body(request)))
router.add('PUT', '/api/me/profile', async ({ request, env, user }) => updateProfile(env, requireUser(user), await body(request)))

router.add('GET', '/api/users', async ({ env, user }) => {
  requireRole(user, ['admin'])
  return listUsers(env)
})
router.add('POST', '/api/users', async ({ request, env, user }) => {
  requireRole(user, ['admin'])
  return createUser(env, await body(request))
})
router.add('PATCH', '/api/users/:id', async ({ request, env, user, params }) =>
  patchUser(env, requireRole(user, ['admin']), Number(params.id), await body(request)),
)

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request)
    }
    const match = router.match(request.method, url.pathname)
    if (!match) return json({ error: 'Not found' }, 404)
    try {
      const user = await getSessionUser(env, request)
      return await match.handler({ request, env, params: match.params, user })
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status)
      console.error(err)
      return json({ error: 'Internal error' }, 500)
    }
  },
} satisfies ExportedHandler<Env>
