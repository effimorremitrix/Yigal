import { HttpError, json, type Env, type SessionUser } from './env'

const LANDING_PAGES = ['/', '/shipments', '/tracking', '/documents', '/analytics']
const DATE_FORMATS = ['dd MMM yyyy', 'dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd']

export async function getSettings(env: Env, user: SessionUser): Promise<Response> {
  const row = await env.DB.prepare('SELECT * FROM user_settings WHERE user_id = ?').bind(user.id).first()
  return json(row)
}

export async function putSettings(
  env: Env,
  user: SessionUser,
  body: {
    timezone?: string
    date_format?: string
    landing_page?: string
    notify_delays?: boolean
    notify_docs?: boolean
    notify_weekly_digest?: boolean
  },
): Promise<Response> {
  const timezone = body.timezone ?? 'UTC'
  const dateFormat = body.date_format ?? 'dd MMM yyyy'
  const landing = body.landing_page ?? '/'
  if (timezone.length > 64) throw new HttpError(400, 'Invalid timezone')
  if (!DATE_FORMATS.includes(dateFormat)) throw new HttpError(400, 'Invalid date format')
  if (!LANDING_PAGES.includes(landing)) throw new HttpError(400, 'Invalid landing page')
  const now = new Date().toISOString()
  await env.DB.prepare(
    `INSERT INTO user_settings (user_id, timezone, date_format, landing_page, notify_delays, notify_docs, notify_weekly_digest, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET timezone = excluded.timezone, date_format = excluded.date_format,
       landing_page = excluded.landing_page, notify_delays = excluded.notify_delays, notify_docs = excluded.notify_docs,
       notify_weekly_digest = excluded.notify_weekly_digest, updated_at = excluded.updated_at`,
  )
    .bind(user.id, timezone, dateFormat, landing, body.notify_delays ? 1 : 0, body.notify_docs ? 1 : 0, body.notify_weekly_digest ? 1 : 0, now)
    .run()
  return getSettings(env, user)
}
