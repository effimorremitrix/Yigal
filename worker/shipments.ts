import { HttpError, json, type Env, type SessionUser } from './env'
import { LANES, PORTS } from '../src/data/constants'
import type { Milestone, Shipment } from '../src/types'

interface ShipmentRow {
  id: string
  booking_ref: string
  origin_code: string
  destination_code: string
  via_code: string | null
  lane_id: string
  carrier_name: string
  carrier_scac: string
  vessel_name: string
  vessel_imo: string
  vessel_voyage: string
  status: string
  etd: string
  eta: string
  atd: string | null
  incoterm: string
  commodity: string
  co2_tons: number
  freight_cost_usd: number
  on_time: number
  progress: number
  delay_reason: string | null
}

// Internal-org users see everything; partner users only shipments where their org is a party.
const scopeClause = (user: SessionUser): { where: string; binds: unknown[] } =>
  user.orgType === 'internal'
    ? { where: '', binds: [] }
    : { where: 'WHERE EXISTS (SELECT 1 FROM shipment_parties sp WHERE sp.shipment_id = s.id AND sp.org_id = ?)', binds: [user.orgId] }

async function assemble(env: Env, rows: ShipmentRow[]): Promise<Shipment[]> {
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)
  const ph = ids.map(() => '?').join(',')
  const [containers, milestones, documents, comments, parties] = await Promise.all([
    env.DB.prepare(`SELECT * FROM containers WHERE shipment_id IN (${ph}) ORDER BY position`).bind(...ids).all(),
    env.DB.prepare(`SELECT * FROM milestones WHERE shipment_id IN (${ph}) ORDER BY position`).bind(...ids).all(),
    env.DB.prepare(`SELECT * FROM documents WHERE shipment_id IN (${ph}) ORDER BY id`).bind(...ids).all(),
    env.DB.prepare(`SELECT * FROM comments WHERE shipment_id IN (${ph}) ORDER BY at`).bind(...ids).all(),
    env.DB.prepare(`SELECT * FROM shipment_parties WHERE shipment_id IN (${ph}) ORDER BY id`).bind(...ids).all(),
  ])

  const group = <T extends { shipment_id: string }>(res: { results: unknown[] }): Map<string, T[]> => {
    const map = new Map<string, T[]>()
    for (const row of res.results as T[]) {
      const list = map.get(row.shipment_id) ?? []
      list.push(row)
      map.set(row.shipment_id, list)
    }
    return map
  }

  const cByS = group<{ shipment_id: string; number: string; type: string; seal_number: string; weight_kg: number; status: string; dd_risk_usd: number }>(containers)
  const mByS = group<{ shipment_id: string; key: string; label: string; location: string; planned: string; actual: string | null; status: string }>(milestones)
  const dByS = group<{ shipment_id: string; id: string; type: string; name: string; status: string; uploaded_by: string; updated_at: string }>(documents)
  const comByS = group<{ shipment_id: string; id: string; author: string; role: string; text: string; at: string }>(comments)
  const pByS = group<{ shipment_id: string; id: string; name: string; role: string; contact: string }>(parties)

  return rows.map((r) => ({
    id: r.id,
    bookingRef: r.booking_ref,
    origin: PORTS[r.origin_code],
    destination: PORTS[r.destination_code],
    via: r.via_code ? PORTS[r.via_code] : undefined,
    laneId: r.lane_id,
    carrier: { name: r.carrier_name, scac: r.carrier_scac },
    vessel: { name: r.vessel_name, imo: r.vessel_imo, voyage: r.vessel_voyage },
    status: r.status as Shipment['status'],
    etd: r.etd,
    eta: r.eta,
    atd: r.atd ?? undefined,
    incoterm: r.incoterm as Shipment['incoterm'],
    commodity: r.commodity,
    co2Tons: r.co2_tons,
    freightCostUsd: r.freight_cost_usd,
    onTime: r.on_time === 1,
    progress: r.progress,
    delayReason: r.delay_reason ?? undefined,
    containers: (cByS.get(r.id) ?? []).map((c) => ({
      number: c.number,
      type: c.type as Shipment['containers'][number]['type'],
      sealNumber: c.seal_number,
      weightKg: c.weight_kg,
      status: c.status,
      ddRiskUsd: c.dd_risk_usd,
    })),
    milestones: (mByS.get(r.id) ?? []).map((m) => ({
      key: m.key as Milestone['key'],
      label: m.label,
      location: m.location,
      planned: m.planned,
      actual: m.actual ?? undefined,
      status: m.status as Milestone['status'],
    })),
    documents: (dByS.get(r.id) ?? []).map((d) => ({
      id: d.id,
      type: d.type as Shipment['documents'][number]['type'],
      name: d.name,
      status: d.status as Shipment['documents'][number]['status'],
      uploadedBy: d.uploaded_by,
      updatedAt: d.updated_at,
    })),
    comments: (comByS.get(r.id) ?? []).map((c) => ({ id: c.id, author: c.author, role: c.role, text: c.text, at: c.at })),
    parties: (pByS.get(r.id) ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role as Shipment['parties'][number]['role'],
      contact: p.contact,
    })),
  }))
}

export async function listShipments(env: Env, user: SessionUser): Promise<Response> {
  const scope = scopeClause(user)
  const rows = await env.DB.prepare(`SELECT s.* FROM shipments s ${scope.where} ORDER BY s.etd DESC, s.id`)
    .bind(...scope.binds)
    .all<ShipmentRow>()
  return json(await assemble(env, rows.results))
}

async function fetchVisible(env: Env, user: SessionUser, id: string): Promise<ShipmentRow> {
  const scope = scopeClause(user)
  const where = scope.where ? `${scope.where} AND s.id = ?` : 'WHERE s.id = ?'
  const row = await env.DB.prepare(`SELECT s.* FROM shipments s ${where}`)
    .bind(...scope.binds, id)
    .first<ShipmentRow>()
  if (!row) throw new HttpError(404, 'Shipment not found')
  return row
}

export async function getShipment(env: Env, user: SessionUser, id: string): Promise<Response> {
  const row = await fetchVisible(env, user, id)
  const [shipment] = await assemble(env, [row])
  return json(shipment)
}

interface BookingPayload {
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

const addDays = (baseIso: string, days: number): string => new Date(new Date(baseIso).getTime() + days * 86400000).toISOString()

export async function createShipment(env: Env, user: SessionUser, payload: BookingPayload): Promise<Response> {
  const lane = LANES.find((l) => l.origin === payload.originCode && l.destination === payload.destinationCode)
  if (!lane) throw new HttpError(400, 'Unknown trade lane')
  const origin = PORTS[payload.originCode]
  const destination = PORTS[payload.destinationCode]
  const sched = payload.schedule
  const totalContainers = Object.values(payload.containers).reduce((a: number, b) => a + (b ?? 0), 0)
  if (totalContainers < 1 || totalContainers > 50) throw new HttpError(400, 'Invalid container count')
  const totalTeu = Object.entries(payload.containers).reduce((a, [t, count]) => a + (count ?? 0) * (t === '20DV' ? 1 : 2), 0)

  const maxRef = await env.DB.prepare(
    `SELECT MAX(CAST(substr(booking_ref, 9) AS INTEGER)) AS m FROM shipments WHERE booking_ref LIKE 'TL-2026-%'`,
  ).first<{ m: number | null }>()
  const refNum = (maxRef?.m ?? 100) + 1
  const bookingRef = `TL-2026-${String(refNum).padStart(4, '0')}`
  const id = `b-${refNum}`
  const now = new Date().toISOString()

  const milestonesPlan: { key: string; label: string; location: string; offset: number }[] = [
    { key: 'booking_confirmed', label: 'Booking confirmed', location: origin.name, offset: -7 },
    { key: 'container_gate_in', label: 'Container gate in', location: `${origin.name} terminal`, offset: -3 },
    { key: 'loaded_on_vessel', label: 'Loaded on vessel', location: `${origin.name} terminal`, offset: -1 },
    { key: 'vessel_departed', label: 'Vessel departed', location: origin.name, offset: 0 },
    ...(lane.via
      ? [{ key: 'transshipment', label: 'Transshipment', location: PORTS[lane.via].name, offset: Math.round(sched.transitDays * 0.45) }]
      : []),
    { key: 'vessel_arrived', label: 'Vessel arrived', location: destination.name, offset: sched.transitDays },
    { key: 'gate_out', label: 'Container gate out', location: `${destination.name} terminal`, offset: sched.transitDays + 2 },
    { key: 'delivered', label: 'Delivered', location: `${destination.name} area`, offset: sched.transitDays + 4 },
  ]

  // Default demo parties; a partner user's own org always appears in its role slot
  // so the shipment is visible to them afterwards.
  const parties = [
    { name: 'Atlas Polymers Ltd', role: 'shipper', contact: 'Dana Weiss' },
    { name: 'Northline Imports BV', role: 'consignee', contact: 'Pieter van Dam' },
    { name: 'GlobalFreight Partners', role: 'forwarder', contact: 'Amit Shalev' },
    { name: sched.carrier, role: 'carrier', contact: 'Operations desk' },
  ]
  if (user.orgType !== 'internal') {
    const slot = parties.find((p) => p.role === user.orgType)
    if (slot) {
      slot.name = user.orgName
      slot.contact = user.name
    }
  }
  const orgRows = await env.DB.prepare('SELECT id, name FROM organizations').all<{ id: number; name: string }>()
  const orgByName = new Map(orgRows.results.map((o) => [o.name, o.id]))

  const stmts: D1PreparedStatement[] = []
  stmts.push(
    env.DB.prepare(
      `INSERT INTO shipments (id, booking_ref, origin_code, destination_code, via_code, lane_id, carrier_name, carrier_scac, vessel_name, vessel_imo, vessel_voyage, status, etd, eta, atd, incoterm, commodity, co2_tons, freight_cost_usd, on_time, progress, delay_reason, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'booking_confirmed', ?, ?, NULL, ?, ?, ?, ?, 1, 0, NULL, ?, ?)`,
    ).bind(
      id,
      bookingRef,
      origin.code,
      destination.code,
      lane.via ?? null,
      lane.id,
      sched.carrier,
      sched.scac,
      sched.vesselName,
      `9${500000 + refNum}`,
      sched.voyage,
      sched.etd,
      sched.eta,
      payload.incoterm,
      payload.commodity,
      Math.round(totalTeu * sched.co2PerTeuTons * 10) / 10,
      totalTeu * sched.costPerTeuUsd,
      user.id,
      now,
    ),
  )

  let pos = 0
  for (const [type, count] of Object.entries(payload.containers)) {
    for (let i = 0; i < (count ?? 0); i++) {
      stmts.push(
        env.DB.prepare(
          'INSERT INTO containers (shipment_id, position, number, type, seal_number, weight_kg, status, dd_risk_usd) VALUES (?, ?, ?, ?, ?, ?, ?, 0)',
        ).bind(id, pos, `TLNU${7000000 + refNum * 137 + pos}`, type, `SL${400000 + refNum * 61 + pos}`, payload.weightKg, 'FCL'),
      )
      pos++
    }
  }

  milestonesPlan.forEach((m, i) => {
    stmts.push(
      env.DB.prepare(
        'INSERT INTO milestones (shipment_id, position, key, label, location, planned, actual, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(id, i, m.key, m.label, m.location, addDays(sched.etd, m.offset), i === 0 ? now : null, i === 0 ? 'completed' : i === 1 ? 'current' : 'pending'),
    )
  })

  for (const doc of [
    { docId: `${id}-si`, type: 'SI', name: 'Shipping Instructions' },
    { docId: `${id}-vgm`, type: 'VGM', name: 'VGM Declaration' },
  ]) {
    stmts.push(
      env.DB.prepare("INSERT INTO documents (id, shipment_id, type, name, status, uploaded_by, updated_at) VALUES (?, ?, ?, ?, 'draft', ?, ?)").bind(
        doc.docId,
        id,
        doc.type,
        doc.name,
        user.name,
        now,
      ),
    )
  }

  parties.forEach((p, i) => {
    stmts.push(
      env.DB.prepare('INSERT INTO shipment_parties (id, shipment_id, org_id, name, role, contact) VALUES (?, ?, ?, ?, ?, ?)').bind(
        `${id}-p${i}`,
        id,
        orgByName.get(p.name) ?? null,
        p.name,
        p.role,
        p.contact,
      ),
    )
  })

  stmts.push(
    env.DB.prepare('INSERT INTO comments (id, shipment_id, author, role, text, at) VALUES (?, ?, ?, ?, ?, ?)').bind(
      `${id}-c0`,
      id,
      'Operations desk',
      'carrier',
      'Booking confirmed on requested sailing. Cut-off is 48h before ETD.',
      now,
    ),
  )

  await env.DB.batch(stmts)
  return getShipment(env, user, id)
}

export async function approveDocument(env: Env, user: SessionUser, shipmentId: string, docId: string): Promise<Response> {
  await fetchVisible(env, user, shipmentId)
  const now = new Date().toISOString()
  const result = await env.DB.prepare(
    "UPDATE documents SET status = 'approved', updated_at = ? WHERE id = ? AND shipment_id = ? AND status = 'pending_approval'",
  )
    .bind(now, docId, shipmentId)
    .run()
  if (result.meta.changes === 0) throw new HttpError(404, 'Document not found or not pending approval')
  const doc = await env.DB.prepare('SELECT * FROM documents WHERE id = ?').bind(docId).first<{
    id: string
    type: string
    name: string
    status: string
    uploaded_by: string
    updated_at: string
  }>()
  return json({ id: doc!.id, type: doc!.type, name: doc!.name, status: doc!.status, uploadedBy: doc!.uploaded_by, updatedAt: doc!.updated_at })
}

export async function addComment(env: Env, user: SessionUser, shipmentId: string, text: string): Promise<Response> {
  if (!text || text.length > 2000) throw new HttpError(400, 'Comment text required (max 2000 chars)')
  await fetchVisible(env, user, shipmentId)
  const id = `c-${crypto.randomUUID()}`
  const at = new Date().toISOString()
  const role = user.orgType === 'internal' ? user.role : user.orgType
  await env.DB.prepare('INSERT INTO comments (id, shipment_id, author, role, text, at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, shipmentId, user.name, role, text, at)
    .run()
  return json({ id, author: user.name, role, text, at })
}
