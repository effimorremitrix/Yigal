import type { CustomsStatus } from '../../../src/types'
import { IntegrationError } from '../errors'
import type { HttpClient } from '../http'
import type { AceAdapter } from '../provider'

// CBP ACE exposes no public REST API to filers; production access goes through an ABI-certified
// broker/vendor gateway. Only the paths below, the auth header in registry.ts, and mapEntry() change
// once the gateway is chosen. Until then every live call ends in an explicit 'unmapped' error.
const HEALTH_PATH = '/ping'
const ENTRY_PATH = '/entries'

export function createAceLiveAdapter(http: HttpClient): AceAdapter {
  return {
    provider: 'ace',
    mode: 'live',
    async healthCheck() {
      const t0 = Date.now()
      try {
        await http.get<unknown>(HEALTH_PATH)
        return { ok: true, mode: 'live', message: `Reached ${HEALTH_PATH}`, checkedAt: new Date().toISOString(), latencyMs: Date.now() - t0 }
      } catch (err) {
        return { ok: false, mode: 'live', message: err instanceof Error ? err.message : 'Health check failed', checkedAt: new Date().toISOString(), latencyMs: Date.now() - t0 }
      }
    },
    async getCustomsStatus(lookup) {
      const raw = await http.get<unknown>(ENTRY_PATH, { bookingRef: lookup.bookingRef, scac: lookup.carrierScac })
      return mapEntry(raw)
    },
  }
}

// Single place where the vendor payload becomes the vendor-neutral CustomsStatus DTO.
function mapEntry(_raw: unknown): CustomsStatus {
  throw new IntegrationError('ace', 'unmapped', 'ACE payload mapping is not implemented yet; keep the provider in mock mode')
}
