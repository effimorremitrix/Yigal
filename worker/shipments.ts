import { HttpError, json, type Env, type SessionUser } from './env'
import { PORTS } from '../src/data/constants'
import type { Milestone, Shipment } from '../src/types'
import type { InvoiceSeed } from './integrations/quickbooks/mock'
import { validateBooking, type BookingPayload } from './booking'

export interface ShipmentRow {
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

// Counterparty isolation. Yigal trades as a principal: he buys from producers and sells to
// importers, so on one physical shipment the supplier and the customer are both parties and
// neither is supposed to learn the other exists. The supplier list and the customer list are
// the business; handing one to the other is how a trader gets cut out of his own deal. It is
// the same reason the trade uses a switch bill of lading and a neutral packing list.
//
// So a partner user sees their own organization's party rows plus the service providers, and
// never another commercial counterparty. Carrier and forwarder stay visible on purpose: the
// carrier and vessel are already on the shipment record and on the bill of lading, and a
// forwarder cannot do the job blind.
//
// 'shipper' and 'consignee' are transport roles off the bill of lading, which is all the model
// carries today, and they are the two that can hold a commercial counterparty. The separate
// supplier/customer axis is a session 4 decision; see docs/trader-model.md.
const SERVICE_ROLES = new Set(['forwarder', 'carrier'])

interface PartyRow {
  shipment_id: string
  id: string
  org_id: number
  name: string
  role: string
  contact: string
}

const seesParty = (user: SessionUser, p: PartyRow): boolean =>
  user.orgType === 'internal' || p.org_id === user.orgId || SERVICE_ROLES.has(p.role)

// Internal-org users see everything; partner users only shipments where their org is a party.
const scopeClause = (user: SessionUser): { where: string; binds: unknown[] } =>
  user.orgType === 'internal'
    ? { where: '', binds: [] }
    : { where: 'WHERE EXISTS (SELECT 1 FROM shipment_parties sp WHERE sp.shipment_id = s.id AND sp.org_id = ?)', binds: [user.orgId] }

async function assemble(env: Env, user: SessionUser, rows: ShipmentRow[]): Promise<Shipment[]> {
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
  const pByS = group<PartyRow>(parties)

  return rows.map((r) => {
    const allParties = pByS.get(r.id) ?? []
    const visibleParties = allParties.filter((p) => seesParty(user, p))
    // Comments and documents carry a plain author name, not an organization, so a withheld
    // counterparty is recognised by the contact name on the party row we just withheld. This is
    // a name match because the schema gives nothing better; making the link structural is a
    // session 4 item. It closes the structured doors only: comment text is free prose and a
    // sentence naming the other side cannot be filtered, which is why the exception register
    // has to say whether the collaboration thread is used across counterparties at all.
    const hidden = new Set(
      allParties.filter((p) => !seesParty(user, p)).flatMap((p) => [p.contact, p.name]),
    )

    return {
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
    documents: (dByS.get(r.id) ?? [])
      .filter((d) => !hidden.has(d.uploaded_by))
      .map((d) => ({
        id: d.id,
        type: d.type as Shipment['documents'][number]['type'],
        name: d.name,
        status: d.status as Shipment['documents'][number]['status'],
        uploadedBy: d.uploaded_by,
        updatedAt: d.updated_at,
      })),
    comments: (comByS.get(r.id) ?? [])
      .filter((c) => !hidden.has(c.author))
      .map((c) => ({ id: c.id, author: c.author, role: c.role, text: c.text, at: c.at })),
    parties: visibleParties.map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role as Shipment['parties'][number]['role'],
      contact: p.contact,
    })),
    }
  })
}

export async function listShipments(env: Env, user: SessionUser): Promise<Response> {
  const scope = scopeClause(user)
  const rows = await env.DB.prepare(`SELECT s.* FROM shipments s ${scope.where} ORDER BY s.etd DESC, s.id`)
    .bind(...scope.binds)
    .all<ShipmentRow>()
  return json(await assemble(env, user, rows.results))
}

// Seed rows for the QuickBooks mock ledger: every shipment plus the party it is billed to (the shipper).
// No org scoping: the invoices endpoints are internal-only and gate before calling this.
export async function loadInvoiceSeeds(env: Env): Promise<InvoiceSeed[]> {
  const rows = await env.DB.prepare(
    `SELECT s.id, s.booking_ref, s.status, s.etd, s.eta, s.origin_code, s.destination_code, s.incoterm, s.freight_cost_usd,
            (SELECT p.name FROM shipment_parties p WHERE p.shipment_id = s.id AND p.role = 'shipper' ORDER BY p.id LIMIT 1) AS shipper_name
     FROM shipments s ORDER BY s.etd DESC, s.id`,
  ).all<{
    id: string
    booking_ref: string
    status: string
    etd: string
    eta: string
    origin_code: string
    destination_code: string
    incoterm: string
    freight_cost_usd: number
    shipper_name: string | null
  }>()
  return rows.results.map((r) => ({
    shipmentId: r.id,
    bookingRef: r.booking_ref,
    status: r.status,
    etd: r.etd,
    eta: r.eta,
    originCode: r.origin_code,
    destinationCode: r.destination_code,
    incoterm: r.incoterm,
    freightCostUsd: r.freight_cost_usd,
    shipperName: r.shipper_name,
  }))
}

export async function fetchVisible(env: Env, user: SessionUser, id: string): Promise<ShipmentRow> {
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
  const [shipment] = await assemble(env, user, [row])
  return json(shipment)
}

const addDays = (baseIso: string, days: number): string => new Date(new Date(baseIso).getTime() + days * 86400000).toISOString()

// booking_ref (and the id derived from it) carry a UNIQUE constraint, so a lost race between
// two concurrent bookings fails the write rather than duplicating a reference. Re-reading the
// high-water mark and retrying turns that failure into the next free reference.
const REF_ATTEMPTS = 5
const isUniqueConflict = (err: unknown): boolean =>
  err instanceof Error && /UNIQUE constraint failed|SQLITE_CONSTRAINT/i.test(err.message)

async function nextRefNum(env: Env): Promise<number> {
  const maxRef = await env.DB.prepare(
    `SELECT MAX(CAST(substr(booking_ref, 9) AS INTEGER)) AS m FROM shipments WHERE booking_ref LIKE 'TL-2026-%'`,
  ).first<{ m: number | null }>()
  return (maxRef?.m ?? 100) + 1
}

interface PartySlot {
  name: string
  role: string
  contact: string
  orgId: number
}

/**
 * Every party must resolve to an organization. org_id is what partner visibility is scoped by
 * (see scopeClause), so a party stored without one produces a shipment its own partner can
 * never see — silently. An unmatched name is a caller error and is refused here rather than
 * written as NULL; migration 0006 makes the database enforce the same invariant.
 */
async function resolveParties(env: Env, wanted: { name: string; role: string; contact: string }[]): Promise<PartySlot[]> {
  const orgRows = await env.DB.prepare('SELECT id, name FROM organizations').all<{ id: number; name: string }>()
  const orgByName = new Map(orgRows.results.map((o) => [o.name, o.id]))
  const unmatched = wanted.filter((p) => !orgByName.has(p.name))
  if (unmatched.length > 0) {
    const names = unmatched.map((p) => `"${p.name}" (${p.role})`).join(', ')
    throw new HttpError(400, `No organization matches ${names}. Party names must match an existing organization exactly.`)
  }
  return wanted.map((p) => ({ ...p, orgId: orgByName.get(p.name)! }))
}

export async function createShipment(env: Env, user: SessionUser, payload: BookingPayload): Promise<Response> {
  const booking = validateBooking(payload)
  const { lane, origin, destination, schedule: sched } = booking

  // Default demo parties; a partner user's own org always appears in its role slot
  // so the shipment is visible to them afterwards.
  const wantedParties = [
    { name: 'Atlas Polymers Ltd', role: 'shipper', contact: 'Dana Weiss' },
    { name: 'Northline Imports BV', role: 'consignee', contact: 'Pieter van Dam' },
    { name: 'GlobalFreight Partners', role: 'forwarder', contact: 'Amit Shalev' },
    { name: sched.carrier, role: 'carrier', contact: 'Operations desk' },
  ]
  if (user.orgType !== 'internal') {
    const slot = wantedParties.find((p) => p.role === user.orgType)
    if (slot) {
      slot.name = user.orgName
      slot.contact = user.name
    }
  }
  const parties = await resolveParties(env, wantedParties)

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

  const buildStatements = (id: string, bookingRef: string, refNum: number, now: string): D1PreparedStatement[] => {
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
        booking.incoterm,
        booking.commodity,
        Math.round(booking.totalTeu * sched.co2PerTeuTons * 10) / 10,
        booking.totalTeu * sched.costPerTeuUsd,
        user.id,
        now,
      ),
    )

    let pos = 0
    for (const { type, count } of booking.containers) {
      for (let i = 0; i < count; i++) {
        stmts.push(
          env.DB.prepare(
            'INSERT INTO containers (shipment_id, position, number, type, seal_number, weight_kg, status, dd_risk_usd) VALUES (?, ?, ?, ?, ?, ?, ?, 0)',
          ).bind(id, pos, `TLNU${7000000 + refNum * 137 + pos}`, type, `SL${400000 + refNum * 61 + pos}`, booking.weightKg, 'FCL'),
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
          p.orgId,
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
    return stmts
  }

  for (let attempt = 1; attempt <= REF_ATTEMPTS; attempt++) {
    const refNum = await nextRefNum(env)
    const bookingRef = `TL-2026-${String(refNum).padStart(4, '0')}`
    const id = `b-${refNum}`
    try {
      await env.DB.batch(buildStatements(id, bookingRef, refNum, new Date().toISOString()))
      return getShipment(env, user, id)
    } catch (err) {
      // Someone else took this reference between the read and the write: take the next one.
      if (isUniqueConflict(err) && attempt < REF_ATTEMPTS) continue
      throw err
    }
  }
  throw new HttpError(409, 'Could not allocate a booking reference — too many concurrent bookings. Please retry.')
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
