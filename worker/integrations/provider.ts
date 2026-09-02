import type {
  BookingAck,
  CustomsStatus,
  IntegrationHealth,
  IntegrationMode,
  IntegrationProvider,
  SailingSchedule,
  ScheduleQuery,
  TrackingEvent,
} from '../../src/types'

export const PROVIDERS: readonly IntegrationProvider[] = ['ace', 'inttra']
export const isProvider = (s: string): s is IntegrationProvider => (PROVIDERS as readonly string[]).includes(s)
export const PROVIDER_LABEL: Record<IntegrationProvider, string> = { ace: 'CBP ACE', inttra: 'E2open INTTRA' }

// The subset of a shipment row an adapter needs to talk to a vendor about it.
export interface ShipmentLookup {
  shipmentId: string
  bookingRef: string
  carrierScac: string
  originCode: string
  destinationCode: string
  status: string
  etd: string
  eta: string
}

export interface IntegrationAdapter {
  readonly provider: IntegrationProvider
  readonly mode: IntegrationMode
  healthCheck(): Promise<IntegrationHealth>
}

export interface AceAdapter extends IntegrationAdapter {
  readonly provider: 'ace'
  getCustomsStatus(lookup: ShipmentLookup): Promise<CustomsStatus>
}

export interface BookingRequest {
  bookingRef: string
  scac: string
  voyage: string
  etd: string
}

export interface InttraAdapter extends IntegrationAdapter {
  readonly provider: 'inttra'
  searchSchedules(query: ScheduleQuery): Promise<SailingSchedule[]>
  getTrackingEvents(lookup: ShipmentLookup): Promise<TrackingEvent[]>
  // Defined and mocked, but not routed yet: writes to a real vendor need idempotency and retry design first.
  submitBooking(request: BookingRequest): Promise<BookingAck>
}
