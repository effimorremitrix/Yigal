import { HttpError } from './env'
import { CONTAINER_TYPES, INCOTERMS, LANES, PORTS } from '../src/data/constants'
import type { ContainerType, Incoterm, Port } from '../src/types'
import type { TradeLane } from '../src/data/constants'

/**
 * A booking as it arrives over the wire. Every field is validated in this module
 * before anything reaches the database: until now `incoterm`, `commodity`,
 * `weightKg` and the whole `schedule` object were written verbatim, which was
 * tolerable only while the sole caller was the wizard's controlled UI.
 */
export interface BookingPayload {
  originCode: string
  destinationCode: string
  incoterm: string
  commodity: string
  weightKg: number
  containers: Partial<Record<string, number>>
  schedule: {
    carrier: string
    scac: string
    vesselName: string
    voyage: string
    etd: string
    eta: string
    transitDays: number
    co2PerTeuTons: number
    costPerTeuUsd: number
  }
}

/** A payload that has been through `validateBooking`: the types are now the narrow ones. */
export interface ValidatedBooking {
  lane: TradeLane
  origin: Port
  destination: Port
  incoterm: Incoterm
  commodity: string
  weightKg: number
  containers: { type: ContainerType; count: number }[]
  totalContainers: number
  totalTeu: number
  schedule: {
    carrier: string
    scac: string
    vesselName: string
    voyage: string
    etd: string
    eta: string
    transitDays: number
    co2PerTeuTons: number
    costPerTeuUsd: number
  }
}

const MAX_CONTAINERS = 50
// A 40ft box tops out around 30.5 t of payload; the ceiling is a sanity bound, not a rule.
const MAX_WEIGHT_KG = 45_000
const MAX_TRANSIT_DAYS = 120

// A function declaration, not an arrow: TypeScript only narrows control flow past a
// `never`-returning call when the callee is declared this way.
function bad(message: string): never {
  throw new HttpError(400, message)
}

const text = (value: unknown, field: string, maxLength: number): string => {
  if (typeof value !== 'string') bad(`${field} must be a string`)
  const trimmed = (value as string).trim()
  if (trimmed.length === 0) bad(`${field} is required`)
  if (trimmed.length > maxLength) bad(`${field} must be ${maxLength} characters or fewer`)
  return trimmed
}

const number = (value: unknown, field: string, min: number, max: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) bad(`${field} must be a number`)
  const n = value as number
  if (n < min || n > max) bad(`${field} must be between ${min} and ${max}`)
  return n
}

/** An ISO timestamp we can actually do date arithmetic on, normalized so both ends agree. */
const timestamp = (value: unknown, field: string): string => {
  const raw = text(value, field, 40)
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) bad(`${field} must be an ISO date`)
  return parsed.toISOString()
}

export function validateBooking(payload: BookingPayload): ValidatedBooking {
  if (!payload || typeof payload !== 'object') bad('Booking payload is required')

  const lane = LANES.find((l) => l.origin === payload.originCode && l.destination === payload.destinationCode)
  if (!lane) bad('Unknown trade lane')

  const incoterm = text(payload.incoterm, 'Incoterm', 8) as Incoterm
  if (!(INCOTERMS as readonly string[]).includes(incoterm)) bad(`Unknown incoterm: ${incoterm}`)

  const containers: { type: ContainerType; count: number }[] = []
  for (const [type, raw] of Object.entries(payload.containers ?? {})) {
    if (!(CONTAINER_TYPES as readonly string[]).includes(type)) bad(`Unknown container type: ${type}`)
    const count = raw ?? 0
    if (!Number.isInteger(count) || count < 0) bad(`Container count for ${type} must be a whole number`)
    if (count > 0) containers.push({ type: type as ContainerType, count })
  }
  const totalContainers = containers.reduce((a, c) => a + c.count, 0)
  if (totalContainers < 1 || totalContainers > MAX_CONTAINERS) bad('Invalid container count')

  const s = payload.schedule
  if (!s || typeof s !== 'object') bad('A sailing schedule is required')
  const etd = timestamp(s.etd, 'ETD')
  const eta = timestamp(s.eta, 'ETA')
  if (new Date(eta).getTime() <= new Date(etd).getTime()) bad('ETA must be after ETD')

  const scac = text(s.scac, 'Carrier SCAC', 4).toUpperCase()
  if (!/^[A-Z]{2,4}$/.test(scac)) bad('Carrier SCAC must be 2-4 letters')

  return {
    lane,
    origin: PORTS[lane.origin],
    destination: PORTS[lane.destination],
    incoterm,
    commodity: text(payload.commodity, 'Commodity', 120),
    weightKg: number(payload.weightKg, 'Container weight', 1, MAX_WEIGHT_KG),
    containers,
    totalContainers,
    // 20ft boxes are 1 TEU, everything larger counts as 2.
    totalTeu: containers.reduce((a, c) => a + c.count * (c.type === '20DV' ? 1 : 2), 0),
    schedule: {
      carrier: text(s.carrier, 'Carrier', 120),
      scac,
      vesselName: text(s.vesselName, 'Vessel name', 120),
      voyage: text(s.voyage, 'Voyage', 40),
      etd,
      eta,
      transitDays: number(s.transitDays, 'Transit days', 1, MAX_TRANSIT_DAYS),
      co2PerTeuTons: number(s.co2PerTeuTons, 'CO₂ per TEU', 0, 100),
      costPerTeuUsd: number(s.costPerTeuUsd, 'Cost per TEU', 0, 100_000),
    },
  }
}
