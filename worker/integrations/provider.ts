import type {
  BookingAck,
  CustomsStatus,
  IntegrationHealth,
  IntegrationMode,
  IntegrationProvider,
  InvoiceQuery,
  SailingSchedule,
  ScheduleQuery,
  TrackingEvent,
  VendorInvoice,
} from '../../src/types'

// The single source of truth for valid providers: the database no longer constrains the column.
export const PROVIDERS: readonly IntegrationProvider[] = ['ace', 'inttra', 'quickbooks']
export const isProvider = (s: string): s is IntegrationProvider => (PROVIDERS as readonly string[]).includes(s)
export const PROVIDER_LABEL: Record<IntegrationProvider, string> = { ace: 'CBP ACE', inttra: 'E2open INTTRA', quickbooks: 'Intuit QuickBooks' }

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

export interface QuickBooksAdapter extends IntegrationAdapter {
  readonly provider: 'quickbooks'
  listInvoices(query: InvoiceQuery): Promise<VendorInvoice[]>
}
