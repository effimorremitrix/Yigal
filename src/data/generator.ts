import type {
  Container,
  ContainerType,
  Milestone,
  Party,
  Shipment,
  ShipmentComment,
  ShipmentDocument,
  ShipmentStatus,
} from '../types'
import {
  CARRIERS,
  COMMODITIES,
  CONSIGNEES,
  CONTAINER_TYPES,
  DELAY_REASONS,
  FORWARDERS,
  LANES,
  PORTS,
  SHIPPERS,
} from './constants'
import { addDays, int, iso, mulberry32, pick, TODAY, type Rng } from './random'

const SCAC_TO_PREFIX: Record<string, string> = {
  MERL: 'MERU',
  PCRN: 'PCRU',
  NBRG: 'NBRU',
  AZWV: 'AZWU',
  HBLK: 'HBLU',
}

function makeContainers(rng: Rng, scac: string, count: number, commodity: string): Container[] {
  const containers: Container[] = []
  for (let i = 0; i < count; i++) {
    const type: ContainerType = commodity === 'Frozen foods' ? '40RF' : pick(rng, CONTAINER_TYPES.filter((t) => t !== '40RF'))
    containers.push({
      number: `${SCAC_TO_PREFIX[scac]}${int(rng, 1000000, 9999999)}`,
      type,
      sealNumber: `SL${int(rng, 100000, 999999)}`,
      weightKg: int(rng, 8, 27) * 1000 + int(rng, 0, 999),
      status: 'FCL',
      ddRiskUsd: rng() < 0.25 ? int(rng, 300, 4200) : 0,
    })
  }
  return containers
}

interface MilestonePlan {
  key: Milestone['key']
  label: string
  location: string
  offsetDays: number // relative to ETD
}

function milestonePlan(originName: string, viaName: string | undefined, destName: string, transitDays: number): MilestonePlan[] {
  const plan: MilestonePlan[] = [
    { key: 'booking_confirmed', label: 'Booking confirmed', location: originName, offsetDays: -10 },
    { key: 'container_gate_in', label: 'Container gate in', location: `${originName} terminal`, offsetDays: -3 },
    { key: 'loaded_on_vessel', label: 'Loaded on vessel', location: `${originName} terminal`, offsetDays: -1 },
    { key: 'vessel_departed', label: 'Vessel departed', location: originName, offsetDays: 0 },
  ]
  if (viaName) {
    plan.push({ key: 'transshipment', label: 'Transshipment', location: viaName, offsetDays: Math.round(transitDays * 0.45) })
  }
  plan.push(
    { key: 'vessel_arrived', label: 'Vessel arrived', location: destName, offsetDays: transitDays },
    { key: 'gate_out', label: 'Container gate out', location: `${destName} terminal`, offsetDays: transitDays + 2 },
    { key: 'delivered', label: 'Delivered', location: `${destName} area`, offsetDays: transitDays + 4 },
  )
  return plan
}

const DOC_DEFS: { type: ShipmentDocument['type']; name: string }[] = [
  { type: 'SI', name: 'Shipping Instructions' },
  { type: 'VGM', name: 'VGM Declaration' },
  { type: 'BL', name: 'Bill of Lading' },
  { type: 'COMMERCIAL_INVOICE', name: 'Commercial Invoice' },
  { type: 'PACKING_LIST', name: 'Packing List' },
]

const COMMENT_TEMPLATES = [
  { role: 'forwarder', text: 'SI submitted to carrier, awaiting confirmation.' },
  { role: 'shipper', text: 'Cargo ready at warehouse, trucking scheduled for gate-in.' },
  { role: 'carrier', text: 'Booking confirmed on requested sailing. Cut-off is 48h before ETD.' },
  { role: 'forwarder', text: 'Draft B/L shared — please review consignee details.' },
  { role: 'consignee', text: 'Please confirm final ETA so we can plan the delivery slot.' },
  { role: 'shipper', text: 'VGM figures uploaded for all containers.' },
  { role: 'forwarder', text: 'Customs cleared at destination, arranging final delivery.' },
]

export function generateShipments(seed = 42, count = 42): Shipment[] {
  const rng = mulberry32(seed)
  const shipments: Shipment[] = []

  for (let n = 0; n < count; n++) {
    const lane = LANES[n % LANES.length]
    const origin = PORTS[lane.origin]
    const destination = PORTS[lane.destination]
    const via = lane.via ? PORTS[lane.via] : undefined
    const carrier = pick(rng, CARRIERS)
    const vesselName = pick(rng, carrier.vessels)

    // Spread departures from ~5 months back to ~3 weeks ahead.
    const etdOffset = int(rng, -150, 21)
    const etd = addDays(TODAY, etdOffset)
    const transitDays = lane.transitDays + int(rng, -2, 3)
    const plannedEta = addDays(etd, transitDays)

    // Sailing shipments get delayed more often (visible exceptions); finished ones
    // occasionally too, so on-time history isn't a flat 100%.
    const delayed = etdOffset < 0 && rng() < (etdOffset > -transitDays ? 0.35 : 0.2)
    const delayDays = delayed ? int(rng, 3, 8) : 0
    const eta = addDays(plannedEta, delayDays)

    const commodity = pick(rng, COMMODITIES)
    const containers = makeContainers(rng, carrier.scac, int(rng, 1, 5), commodity)

    const plan = milestonePlan(origin.name, via?.name, destination.name, transitDays)
    const milestones: Milestone[] = plan.map((m) => {
      const planned = addDays(etd, m.offsetDays)
      const effective = m.offsetDays >= transitDays ? addDays(planned, delayDays) : planned
      const done = effective.getTime() <= TODAY.getTime()
      return {
        key: m.key,
        label: m.label,
        location: m.location,
        planned: iso(planned),
        actual: done ? iso(addDays(effective, rng() < 0.3 ? -1 : 0)) : undefined,
        status: done ? 'completed' : 'pending',
      }
    })
    const firstPending = milestones.find((m) => m.status === 'pending')
    if (firstPending) firstPending.status = 'current'

    const lastDone = [...milestones].reverse().find((m) => m.status === 'completed')?.key
    let status: ShipmentStatus
    if (!lastDone || lastDone === 'booking_confirmed') status = 'booking_confirmed'
    else if (lastDone === 'container_gate_in' || lastDone === 'loaded_on_vessel') status = 'awaiting_departure'
    else if (lastDone === 'vessel_departed') status = delayed ? 'delayed' : 'in_transit'
    else if (lastDone === 'transshipment') status = delayed ? 'delayed' : 'transshipment'
    else if (lastDone === 'vessel_arrived' || lastDone === 'gate_out') status = 'arrived'
    else status = 'delivered'

    const departed = milestones.find((m) => m.key === 'vessel_departed')?.actual
    const sailing = status === 'in_transit' || status === 'transshipment' || status === 'delayed'
    let progress = 0
    if (departed) {
      const total = new Date(eta).getTime() - new Date(departed).getTime()
      progress = Math.min(0.96, Math.max(0.04, (TODAY.getTime() - new Date(departed).getTime()) / total))
      if (!sailing) progress = 1
    }

    const stageRank = milestones.filter((m) => m.status === 'completed').length
    const documents: ShipmentDocument[] = DOC_DEFS.map((d, i) => {
      let docStatus: ShipmentDocument['status']
      if (stageRank >= 5) docStatus = 'approved'
      else if (stageRank >= 3) docStatus = i < 3 ? 'approved' : 'pending_approval'
      else if (stageRank >= 2) docStatus = i < 2 ? 'pending_approval' : 'draft'
      else docStatus = 'draft'
      return {
        id: `doc-${n}-${i}`,
        type: d.type,
        name: d.name,
        status: docStatus,
        uploadedBy: pick(rng, FORWARDERS).contact,
        updatedAt: iso(addDays(etd, int(rng, -9, Math.max(-1, Math.min(etdOffset === 0 ? 0 : -etdOffset, transitDays))))),
      }
    })

    const shipper = pick(rng, SHIPPERS)
    const consignee = pick(rng, CONSIGNEES)
    const forwarder = pick(rng, FORWARDERS)
    const parties: Party[] = [
      { id: `p-${n}-1`, name: shipper.name, role: 'shipper', contact: shipper.contact },
      { id: `p-${n}-2`, name: consignee.name, role: 'consignee', contact: consignee.contact },
      { id: `p-${n}-3`, name: forwarder.name, role: 'forwarder', contact: forwarder.contact },
      { id: `p-${n}-4`, name: carrier.name, role: 'carrier', contact: 'Operations desk' },
    ]

    const commentCount = int(rng, 2, 4)
    const comments: ShipmentComment[] = []
    for (let c = 0; c < commentCount; c++) {
      const t = COMMENT_TEMPLATES[(n + c * 2) % COMMENT_TEMPLATES.length]
      const author =
        t.role === 'shipper' ? shipper.contact : t.role === 'consignee' ? consignee.contact : t.role === 'carrier' ? 'Operations desk' : forwarder.contact
      comments.push({
        id: `c-${n}-${c}`,
        author,
        role: t.role,
        text: t.text,
        at: iso(addDays(etd, -9 + c * 3)),
      })
    }
    if (delayed) {
      comments.push({
        id: `c-${n}-delay`,
        author: 'Operations desk',
        role: 'carrier',
        text: `Revised ETA advised (+${delayDays} days): ${pick(rng, DELAY_REASONS).toLowerCase()}.`,
        at: iso(addDays(TODAY, -int(rng, 1, 4))),
      })
    }

    const teu = containers.reduce((s, c) => s + (c.type === '20DV' ? 1 : 2), 0)
    shipments.push({
      id: `s${n + 1}`,
      bookingRef: `TL-2026-${String(n + 101).padStart(4, '0')}`,
      origin,
      destination,
      via,
      laneId: lane.id,
      carrier: { name: carrier.name, scac: carrier.scac },
      vessel: { name: vesselName, imo: `9${int(rng, 100000, 999999)}`, voyage: `${int(rng, 1, 52)}${pick(rng, ['E', 'W', 'N', 'S'])}` },
      status,
      etd: iso(etd),
      eta: iso(eta),
      atd: departed,
      containers,
      milestones,
      documents,
      parties,
      comments,
      incoterm: pick(rng, ['FOB', 'CIF', 'EXW', 'DDP'] as const),
      commodity,
      co2Tons: Math.round(teu * transitDays * 0.055 * 10) / 10,
      freightCostUsd: teu * int(rng, 1100, 2600),
      onTime: !delayed,
      progress,
      delayReason: delayed ? pick(rng, DELAY_REASONS) : undefined,
    })
  }

  return shipments.sort((a, b) => new Date(b.etd).getTime() - new Date(a.etd).getTime())
}
