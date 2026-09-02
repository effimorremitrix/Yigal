import type { BookingAck, SailingSchedule, TrackingEvent } from '../../../src/types'
import { IntegrationError } from '../errors'
import { createHttpClient } from '../http'
import type { InttraAdapter } from '../provider'

// INTTRA (E2open) APIs use OAuth2 client-credentials. Paths and payload mappers below are placeholders
// until the vendor spec is in hand; every live call ends in an explicit 'unmapped' error until then.
const TOKEN_PATH = '/oauth/token'
const HEALTH_PATH = '/ping'
const SCHEDULES_PATH = '/schedules'
const TRACKING_PATH = '/tracking/events'
const BOOKINGS_PATH = '/bookings'

// Per-isolate token cache (Workers isolates do not share memory; best effort only).
const tokenCache = new Map<string, { token: string; expiresAt: number }>()

export interface InttraLiveOptions {
  baseUrl: string
  clientId: string
  apiKey: string
  timeoutMs?: number
}

export function createInttraLiveAdapter(opts: InttraLiveOptions): InttraAdapter {
  const anon = createHttpClient({ provider: 'inttra', baseUrl: opts.baseUrl, headers: () => ({}), timeoutMs: opts.timeoutMs })

  async function getToken(): Promise<string> {
    const cached = tokenCache.get(opts.clientId)
    if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token
    const res = await anon.post<{ access_token?: string; expires_in?: number }>(TOKEN_PATH, {
      grant_type: 'client_credentials',
      client_id: opts.clientId,
      client_secret: opts.apiKey,
    })
    if (!res.access_token) throw new IntegrationError('inttra', 'auth', 'INTTRA token response did not include an access token')
    tokenCache.set(opts.clientId, { token: res.access_token, expiresAt: Date.now() + (res.expires_in ?? 300) * 1000 })
    return res.access_token
  }

  const http = createHttpClient({
    provider: 'inttra',
    baseUrl: opts.baseUrl,
    headers: async () => ({ authorization: `Bearer ${await getToken()}` }),
    timeoutMs: opts.timeoutMs,
  })

  return {
    provider: 'inttra',
    mode: 'live',
    async healthCheck() {
      const t0 = Date.now()
      try {
        await http.get<unknown>(HEALTH_PATH)
        return { ok: true, mode: 'live', message: `Authenticated and reached ${HEALTH_PATH}`, checkedAt: new Date().toISOString(), latencyMs: Date.now() - t0 }
      } catch (err) {
        return { ok: false, mode: 'live', message: err instanceof Error ? err.message : 'Health check failed', checkedAt: new Date().toISOString(), latencyMs: Date.now() - t0 }
      }
    },
    async searchSchedules(query) {
      const raw = await http.get<unknown>(SCHEDULES_PATH, { origin: query.origin, destination: query.destination, readyDate: query.readyDate })
      return mapSchedules(raw)
    },
    async getTrackingEvents(lookup) {
      const raw = await http.get<unknown>(TRACKING_PATH, { bookingRef: lookup.bookingRef, scac: lookup.carrierScac })
      return mapTrackingEvents(raw)
    },
    async submitBooking(request) {
      const raw = await http.post<unknown>(BOOKINGS_PATH, request)
      return mapBookingAck(raw)
    },
  }
}

function mapSchedules(_raw: unknown): SailingSchedule[] {
  throw new IntegrationError('inttra', 'unmapped', 'INTTRA schedule mapping is not implemented yet; keep the provider in mock mode')
}
function mapTrackingEvents(_raw: unknown): TrackingEvent[] {
  throw new IntegrationError('inttra', 'unmapped', 'INTTRA tracking mapping is not implemented yet; keep the provider in mock mode')
}
function mapBookingAck(_raw: unknown): BookingAck {
  throw new IntegrationError('inttra', 'unmapped', 'INTTRA booking mapping is not implemented yet; keep the provider in mock mode')
}
