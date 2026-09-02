import { LANES } from '../../src/data/constants'
import type { IntegrationMode, ScheduleResult } from '../../src/types'
import { HttpError, json, type Env, type SessionUser } from '../env'
import { fetchVisible, type ShipmentRow } from '../shipments'
import { credentials, saveCheck, saveToggle } from './config'
import { toHttpError } from './errors'
import { isProvider, PROVIDERS, type ShipmentLookup } from './provider'
import { requireEnabled, resolve, resolveAce, resolveInttra } from './registry'

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
    const creds = credentials(env, provider)
    if (!creds.complete) throw new HttpError(400, `Cannot enable live mode: ${creds.missing.join(', ')} not configured`)
  }
  await saveToggle(env, provider, { enabled: body.enabled as boolean | undefined, mode: body.mode as IntegrationMode | undefined }, user.id)
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
