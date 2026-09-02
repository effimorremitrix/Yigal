import { PORTS } from '../../../src/data/constants'
import { int, mulberry32, pick } from '../../../src/data/random'
import type { CustomsStatus, IsfStatus, ReleaseStatus } from '../../../src/types'
import type { AceAdapter, ShipmentLookup } from '../provider'

const seedOf = (s: string) => [...s].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
const shiftDays = (isoStr: string, days: number) => new Date(new Date(isoStr).getTime() + days * 86400000).toISOString()

export function createAceMockAdapter(): AceAdapter {
  return {
    provider: 'ace',
    mode: 'mock',
    async healthCheck() {
      return { ok: true, mode: 'mock', message: 'Mock adapter responding; no external call was made', checkedAt: new Date().toISOString() }
    },
    async getCustomsStatus(lookup) {
      return mockCustomsStatus(lookup)
    },
  }
}

// Deterministic per shipment, and consistent with where the shipment is on its journey.
export function mockCustomsStatus(lookup: ShipmentLookup): CustomsStatus {
  const applicable = PORTS[lookup.destinationCode]?.country === 'United States'
  const base = { shipmentId: lookup.shipmentId, applicable, source: 'mock' as const, retrievedAt: new Date().toISOString() }
  if (!applicable) {
    return { ...base, entryNumber: null, isfTransactionNumber: null, isfStatus: 'not_required', entryStatus: 'not_filed', releaseStatus: 'pending', lastEvent: null }
  }
  const rng = mulberry32(seedOf(lookup.shipmentId))
  const entryNumber = `TLD-${int(rng, 1000000, 9999999)}-${int(rng, 0, 9)}`
  const isfTransactionNumber = Array.from({ length: 15 }, () => int(rng, 0, 9)).join('')
  const filed = { ...base, entryNumber, isfTransactionNumber, isfStatus: 'accepted' as IsfStatus }

  switch (lookup.status) {
    case 'booking_confirmed':
    case 'awaiting_departure': {
      const isfStatus = pick<IsfStatus>(rng, ['filed', 'accepted'])
      return {
        ...base,
        entryNumber: null,
        isfTransactionNumber,
        isfStatus,
        entryStatus: 'not_filed',
        releaseStatus: 'pending',
        lastEvent: { code: isfStatus === 'accepted' ? 'ISF-ACCEPT' : 'ISF-FILED', description: isfStatus === 'accepted' ? 'ISF 10+2 accepted by CBP' : 'ISF 10+2 transmitted', at: shiftDays(lookup.etd, -2) },
      }
    }
    case 'in_transit':
    case 'transshipment':
      return { ...filed, entryStatus: 'filed', releaseStatus: 'pending', lastEvent: { code: 'ENTRY-FILED', description: 'Entry summary (type 01) filed', at: shiftDays(lookup.eta, -5) } }
    case 'arrived': {
      const releaseStatus = pick<ReleaseStatus>(rng, ['released', 'released', 'released', 'hold', 'exam'])
      const event =
        releaseStatus === 'released'
          ? { code: 'REL-1C', description: 'Cargo released by CBP', at: shiftDays(lookup.eta, 0) }
          : releaseStatus === 'hold'
            ? { code: 'HOLD-CBP', description: 'CBP hold placed pending document review', at: shiftDays(lookup.eta, 0) }
            : { code: 'EXAM-VACIS', description: 'Container selected for non-intrusive exam', at: shiftDays(lookup.eta, 0) }
      return { ...filed, entryStatus: 'accepted', releaseStatus, lastEvent: event }
    }
    case 'delivered':
      return { ...filed, entryStatus: 'accepted', releaseStatus: 'released', lastEvent: { code: 'REL-1C', description: 'Cargo released, entry liquidation pending', at: shiftDays(lookup.eta, 0) } }
    case 'delayed':
      return { ...filed, entryStatus: 'filed', releaseStatus: 'hold', lastEvent: { code: 'HOLD-CBP', description: 'CBP hold placed pending document review', at: shiftDays(lookup.eta, -1) } }
    default:
      return { ...base, entryNumber: null, isfTransactionNumber: null, isfStatus: 'not_filed', entryStatus: 'not_filed', releaseStatus: 'pending', lastEvent: null }
  }
}
