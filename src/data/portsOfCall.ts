import type { Milestone, MilestoneKey, Port, Shipment } from '../types'
import { TODAY, daysBetween } from './random'

export type CallRole = 'load' | 'transshipment' | 'discharge'

export interface PortCall {
  /** Stable within a shipment: a port can only take one role on a lane. */
  id: CallRole
  port: Port
  /** Human label for the role, e.g. "Load port". */
  roleLabel: string
  /** "ETD" at the load port, "ETA" everywhere else. */
  dateLabel: 'ETD' | 'ETA'
  /** Scheduled date of the call, from the milestone that defines it. */
  planned: string
  /** Recorded date, once the call has happened. */
  actual?: string
  /** Whole days from today to the call; negative once it is in the past. */
  daysAway: number
  /** `called` = already happened, `next` = the upcoming call, `planned` = later. */
  status: 'called' | 'next' | 'planned'
  /** Every milestone that takes place at this port, in schedule order. */
  milestones: Milestone[]
}

// Which port each milestone happens at. Ports of call are derived from the
// milestones rather than stored, so the map can never drift from the timeline.
const CALL_OF_MILESTONE: Record<MilestoneKey, CallRole> = {
  booking_confirmed: 'load',
  container_gate_in: 'load',
  loaded_on_vessel: 'load',
  vessel_departed: 'load',
  transshipment: 'transshipment',
  vessel_arrived: 'discharge',
  gate_out: 'discharge',
  delivered: 'discharge',
}

// The milestone whose date is the call's headline ETD/ETA.
const KEY_MILESTONE: Record<CallRole, MilestoneKey> = {
  load: 'vessel_departed',
  transshipment: 'transshipment',
  discharge: 'vessel_arrived',
}

const ROLE_LABEL: Record<CallRole, string> = {
  load: 'Load port',
  transshipment: 'Transshipment',
  discharge: 'Discharge port',
}

/**
 * The ports this shipment is scheduled to call at, in sailing order, each with
 * the milestones that happen there and the date the vessel is due.
 */
export function portsOfCall(shipment: Shipment): PortCall[] {
  const ports: { id: CallRole; port: Port | undefined }[] = [
    { id: 'load', port: shipment.origin },
    { id: 'transshipment', port: shipment.via },
    { id: 'discharge', port: shipment.destination },
  ]

  const calls: PortCall[] = []
  for (const { id, port } of ports) {
    if (!port) continue
    const milestones = shipment.milestones.filter((m) => CALL_OF_MILESTONE[m.key] === id)
    const key = milestones.find((m) => m.key === KEY_MILESTONE[id])
    if (!key) continue
    calls.push({
      id,
      port,
      roleLabel: ROLE_LABEL[id],
      dateLabel: id === 'load' ? 'ETD' : 'ETA',
      planned: key.planned,
      actual: key.actual,
      daysAway: daysBetween(TODAY, key.actual ?? key.planned),
      status: key.actual ? 'called' : 'planned',
      milestones,
    })
  }

  const next = calls.find((c) => c.status === 'planned')
  if (next) next.status = 'next'
  return calls
}

/** "in 6 days" / "6 days ago" / "today", for a call's headline date. */
export function relativeDays(days: number): string {
  if (days === 0) return 'today'
  if (days > 0) return `in ${days} day${days === 1 ? '' : 's'}`
  return `${-days} day${days === -1 ? '' : 's'} ago`
}
