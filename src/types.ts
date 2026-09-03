export type ShipmentStatus =
  | 'booking_confirmed'
  | 'awaiting_departure'
  | 'in_transit'
  | 'transshipment'
  | 'arrived'
  | 'delivered'
  | 'delayed'

export type ContainerType = '20DV' | '40DV' | '40HC' | '40RF'

export type MilestoneKey =
  | 'booking_confirmed'
  | 'container_gate_in'
  | 'loaded_on_vessel'
  | 'vessel_departed'
  | 'transshipment'
  | 'vessel_arrived'
  | 'gate_out'
  | 'delivered'

export type DocType = 'SI' | 'BL' | 'VGM' | 'COMMERCIAL_INVOICE' | 'PACKING_LIST'
export type DocStatus = 'draft' | 'pending_approval' | 'approved'

export type Incoterm = 'FOB' | 'CIF' | 'EXW' | 'DDP'

export interface Port {
  code: string
  name: string
  country: string
  flag: string
  lat: number
  lon: number
}

export interface Party {
  id: string
  name: string
  role: 'shipper' | 'consignee' | 'forwarder' | 'carrier'
  contact: string
}

export interface Milestone {
  key: MilestoneKey
  label: string
  location: string
  planned: string
  actual?: string
  status: 'completed' | 'current' | 'pending'
}

export interface Container {
  number: string
  type: ContainerType
  sealNumber: string
  weightKg: number
  status: string
  ddRiskUsd: number
}

export interface ShipmentDocument {
  id: string
  type: DocType
  name: string
  status: DocStatus
  uploadedBy: string
  updatedAt: string
}

export interface ShipmentComment {
  id: string
  author: string
  role: string
  text: string
  at: string
}

export interface Shipment {
  id: string
  bookingRef: string
  origin: Port
  destination: Port
  via?: Port
  laneId: string
  carrier: { name: string; scac: string }
  vessel: { name: string; imo: string; voyage: string }
  status: ShipmentStatus
  etd: string
  eta: string
  atd?: string
  containers: Container[]
  milestones: Milestone[]
  documents: ShipmentDocument[]
  parties: Party[]
  comments: ShipmentComment[]
  incoterm: Incoterm
  commodity: string
  co2Tons: number
  freightCostUsd: number
  onTime: boolean
  progress: number
  delayReason?: string
}

export interface SailingSchedule {
  id: string
  carrier: string
  scac: string
  vesselName: string
  voyage: string
  etd: string
  eta: string
  transitDays: number
  transshipments: number
  co2PerTeuTons: number
  costPerTeuUsd: number
}

// ---- Integrations (CBP ACE customs, E2open INTTRA ocean network) ----
// Vendor-neutral DTOs. Real vendor payloads are mapped into these inside the worker adapters.

export type IntegrationProvider = 'ace' | 'inttra'
export type IntegrationMode = 'mock' | 'live'

export interface IntegrationHealth {
  ok: boolean
  mode: IntegrationMode // mode the check actually ran in
  message: string
  checkedAt: string
  latencyMs?: number
}

// Where the value in use comes from: 'db' = saved by an admin in Settings, 'env' = deployment config.
export type SecretSource = 'db' | 'env' | null

export interface IntegrationSecret {
  name: string
  present: boolean
  source: SecretSource // 'db' with present:false means stored but no longer decryptable
  hint: string | null // last four characters of a stored value
  updatedAt: string | null
}

export interface IntegrationConfig {
  provider: IntegrationProvider
  label: string
  enabled: boolean
  mode: IntegrationMode // what the admin requested
  effectiveMode: IntegrationMode // what the worker will actually use (live only with full credentials)
  baseUrl: string | null
  baseUrlVar: string
  baseUrlSource: SecretSource
  secrets: IntegrationSecret[] // presence, source and hint only, never values
  liveAvailable: boolean
  credentialsEditable: boolean // CREDENTIALS_KEY is set, so the admin UI can store credentials
  lastCheck: IntegrationHealth | null
  updatedAt: string
}

// ACE: customs filing status for one shipment (ISF 10+2, entry summary, release)
export type IsfStatus = 'not_required' | 'not_filed' | 'filed' | 'accepted' | 'rejected'
export type EntryStatus = 'not_filed' | 'filed' | 'accepted'
export type ReleaseStatus = 'pending' | 'released' | 'hold' | 'exam'

export interface CustomsEvent {
  code: string
  description: string
  at: string
}

export interface CustomsStatus {
  shipmentId: string
  applicable: boolean // false for non-US-import shipments
  entryNumber: string | null
  isfTransactionNumber: string | null
  isfStatus: IsfStatus
  entryStatus: EntryStatus
  releaseStatus: ReleaseStatus
  lastEvent: CustomsEvent | null
  source: IntegrationMode
  retrievedAt: string
}

// INTTRA: schedules reuse SailingSchedule; plus tracking events and booking acknowledgement
export interface ScheduleQuery {
  origin: string
  destination: string
  readyDate: string
}

export interface ScheduleResult {
  source: IntegrationMode
  schedules: SailingSchedule[]
}

export interface TrackingEvent {
  id: string
  shipmentId: string
  code: MilestoneKey
  description: string
  location: string
  at: string
  source: IntegrationMode
}

export interface BookingAck {
  bookingRef: string
  carrierBookingNumber: string | null
  status: 'pending' | 'confirmed' | 'rejected'
  message: string
  at: string
  source: IntegrationMode
}
