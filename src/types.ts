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
