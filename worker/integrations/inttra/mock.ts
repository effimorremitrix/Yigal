import { PORTS } from '../../../src/data/constants'
import { int, mulberry32 } from '../../../src/data/random'
import { generateSailingSchedules } from '../../../src/data/schedules'
import type { MilestoneKey, TrackingEvent } from '../../../src/types'
import type { InttraAdapter, ShipmentLookup } from '../provider'

const seedOf = (s: string) => [...s].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
const shiftDays = (isoStr: string, days: number) => new Date(new Date(isoStr).getTime() + days * 86400000).toISOString()

// How far along the INTTRA event stream a shipment is, by status.
const EVENTS_BY_STATUS: Record<string, number> = {
  booking_confirmed: 1,
  awaiting_departure: 2,
  in_transit: 4,
  transshipment: 4,
  delayed: 4,
  arrived: 5,
  delivered: 6,
}

export function createInttraMockAdapter(): InttraAdapter {
  return {
    provider: 'inttra',
    mode: 'mock',
    async healthCheck() {
      return { ok: true, mode: 'mock', message: 'Mock adapter responding; no external call was made', checkedAt: new Date().toISOString() }
    },
    // Same generator the booking wizard used client-side, so the mock is byte-identical to the old behaviour.
    async searchSchedules(query) {
      return generateSailingSchedules(query.origin, query.destination, new Date(query.readyDate))
    },
    async getTrackingEvents(lookup) {
      return mockTrackingEvents(lookup)
    },
    async submitBooking(request) {
      const rng = mulberry32(seedOf(request.bookingRef))
      return {
        bookingRef: request.bookingRef,
        carrierBookingNumber: `${request.scac}${int(rng, 100000, 999999)}`,
        status: 'confirmed',
        message: `Booking confirmed by ${request.scac} for voyage ${request.voyage}`,
        at: new Date().toISOString(),
        source: 'mock',
      }
    },
  }
}

export function mockTrackingEvents(lookup: ShipmentLookup): TrackingEvent[] {
  const origin = PORTS[lookup.originCode]?.name ?? lookup.originCode
  const destination = PORTS[lookup.destinationCode]?.name ?? lookup.destinationCode
  const stream: { code: MilestoneKey; description: string; location: string; at: string }[] = [
    { code: 'booking_confirmed', description: 'Booking confirmed by carrier', location: origin, at: shiftDays(lookup.etd, -10) },
    { code: 'container_gate_in', description: 'Container gated in at terminal', location: origin, at: shiftDays(lookup.etd, -3) },
    { code: 'loaded_on_vessel', description: 'Loaded on vessel', location: origin, at: shiftDays(lookup.etd, -1) },
    { code: 'vessel_departed', description: 'Vessel departed', location: origin, at: lookup.etd },
    { code: 'vessel_arrived', description: 'Vessel arrived', location: destination, at: lookup.eta },
    { code: 'gate_out', description: 'Container gated out', location: destination, at: shiftDays(lookup.eta, 1) },
  ]
  const count = EVENTS_BY_STATUS[lookup.status] ?? 1
  return stream.slice(0, count).map((e, i) => ({ id: `trk-${lookup.shipmentId}-${i}`, shipmentId: lookup.shipmentId, ...e, source: 'mock' }))
}
