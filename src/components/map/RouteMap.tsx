import { useMemo, useState } from 'react'
import { Anchor, Check, Ship, X } from 'lucide-react'
import type { Shipment } from '../../types'
import { LANES } from '../../data/constants'
import {
  CONTINENTS,
  frameArea,
  nearestX,
  positionAlong,
  projectRaw,
  toContinuousPath,
  worldTiles,
} from '../../data/worldMap'
import { fmtDate, fmtDateShort } from '../../data/random'
import { portsOfCall, relativeDays, type CallRole, type PortCall } from '../../data/portsOfCall'

const CALL_COLOR: Record<PortCall['status'], string> = {
  called: '#0F9B75',
  next: '#1D6FE0',
  planned: '#64748B',
}

const CALL_BADGE: Record<PortCall['status'], { label: string; cls: string }> = {
  called: { label: 'Called', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  next: { label: 'Next call', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  planned: { label: 'Planned', cls: 'bg-slate-50 text-slate-600 border-slate-200' },
}

interface Marker extends PortCall {
  x: number
  y: number
}

/** Whether the call has already happened; the date label changes with it. */
const dateLabelFor = (c: PortCall) =>
  c.actual ? (c.dateLabel === 'ETD' ? 'Departed' : 'Arrived') : c.dateLabel

export default function RouteMap({ shipment }: { shipment: Shipment }) {
  const [openId, setOpenId] = useState<CallRole | null>(null)

  const lane = LANES.find((l) => l.id === shipment.laneId)
  const calls = useMemo(() => portsOfCall(shipment), [shipment])

  const { view, markers, routePath, vessel } = useMemo(() => {
    // Routes are drawn unwrapped, so a transpacific lane stays one line instead
    // of two pieces at opposite edges. Ports snap to the tile the route runs in.
    const waypoints = lane?.waypoints
    const framed = waypoints
      ? waypoints.map(([lat, lon]) => projectRaw(lat, lon))
      : calls.map((c) => projectRaw(c.port.lat, c.port.lon))
    const view = frameArea(framed)
    const centerX = view.x + view.w / 2

    const markers: Marker[] = calls.map((c) => {
      const [x, y] = projectRaw(c.port.lat, c.port.lon)
      return { ...c, x: nearestX(x, centerX), y }
    })

    // The vessel only has a place on the map while it is actually sailing; a
    // finished voyage keeps its solid track with no pin on it.
    const sailing = waypoints && shipment.progress > 0 && shipment.progress < 1
    return {
      view,
      markers,
      routePath: waypoints ? toContinuousPath(waypoints) : null,
      vessel: sailing ? projectRaw(...positionAlong(waypoints, shipment.progress)) : null,
    }
  }, [lane, calls, shipment.progress])

  const open = markers.find((m) => m.id === openId) ?? null
  const k = view.k
  const fx = (x: number) => ((x - view.x) / view.w) * 100
  const fy = (y: number) => ((y - view.y) / view.h) * 100
  // Anchor the widget below the marker when there is no room for it above.
  const below = open ? fy(open.y) < 45 : false

  return (
    <div>
      <div className="relative">
        <svg
          viewBox={`${view.x.toFixed(1)} ${view.y.toFixed(1)} ${view.w.toFixed(1)} ${view.h.toFixed(1)}`}
          className="w-full rounded-lg bg-[#EAF2F8]"
          role="img"
          aria-label={`Route map: ${calls.map((c) => c.port.name).join(' to ')}`}
          onClick={() => setOpenId(null)}
        >
          {worldTiles(view).map((dx) => (
            <g key={dx} transform={`translate(${dx} 0)`}>
              {CONTINENTS.map((poly, i) => (
                <polygon
                  key={i}
                  points={poly.map(([lon, lat]) => projectRaw(lat, lon).map((v) => v.toFixed(1)).join(',')).join(' ')}
                  fill="#D8E3ED"
                  stroke="#BACBDA"
                  strokeWidth={0.7 * k}
                />
              ))}
            </g>
          ))}

          {/* The whole route is dashed; the sailed portion is overlaid solid. */}
          {routePath && (
            <>
              <path
                d={routePath}
                fill="none"
                stroke="#94A8BC"
                strokeWidth={1.6 * k}
                strokeDasharray={`${5 * k} ${4 * k}`}
              />
              {shipment.progress > 0 && (
                <path
                  d={routePath}
                  fill="none"
                  stroke="#1D6FE0"
                  strokeWidth={2.2 * k}
                  pathLength={1}
                  strokeDasharray={`${shipment.progress} 1`}
                />
              )}
            </>
          )}

          {vessel && (
            <circle cx={vessel[0]} cy={vessel[1]} r={4 * k} fill="#1D6FE0" stroke="white" strokeWidth={1.4 * k} />
          )}

          {markers.map((m) => {
            const color = CALL_COLOR[m.status]
            const isOpen = m.id === openId
            return (
              <g
                key={m.id}
                className="cursor-pointer"
                role="button"
                tabIndex={0}
                aria-label={`${m.port.name} — ${m.roleLabel}, ${dateLabelFor(m)} ${fmtDate(m.actual ?? m.planned)}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setOpenId(isOpen ? null : m.id)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setOpenId(isOpen ? null : m.id)
                  }
                }}
              >
                {isOpen && <circle cx={m.x} cy={m.y} r={12 * k} fill={color} opacity={0.18} />}
                {/* Comfortably clickable target around a marker only a few pixels wide */}
                <circle cx={m.x} cy={m.y} r={14 * k} fill="transparent" />
                <circle cx={m.x} cy={m.y} r={(isOpen ? 6.5 : 5) * k} fill={color} stroke="white" strokeWidth={1.8 * k} />
                <text
                  x={m.x}
                  y={m.y - 10 * k}
                  fontSize={9 * k}
                  fontWeight={700}
                  fill="#243B53"
                  textAnchor="middle"
                  className="pointer-events-none"
                >
                  {m.port.code}
                </text>
              </g>
            )
          })}
        </svg>

        {open && (
          <div
            data-testid="port-call-widget"
            className="absolute z-10 hidden w-64 rounded-xl border border-slate-200 bg-white p-3.5 shadow-xl sm:block"
            style={{
              left: `min(max(${fx(open.x)}%, 14%), 86%)`,
              top: `${fy(open.y)}%`,
              transform: below ? 'translate(-50%, 14px)' : 'translate(-50%, calc(-100% - 14px))',
            }}
          >
            <CallDetails call={open} onClose={() => setOpenId(null)} />
          </div>
        )}
      </div>

      {/* On phones the widget goes under the map instead of floating over it. */}
      {open && (
        <div data-testid="port-call-widget" className="mt-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm sm:hidden">
          <CallDetails call={open} onClose={() => setOpenId(null)} />
        </div>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {markers.map((m) => (
          <button
            key={m.id}
            onClick={() => setOpenId(m.id === openId ? null : m.id)}
            aria-pressed={m.id === openId}
            className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
              m.id === openId ? 'border-brand-600 bg-brand-50/60' : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <span
              className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-white"
              style={{ backgroundColor: CALL_COLOR[m.status] }}
            >
              {m.id === 'transshipment' ? <Ship size={14} /> : <Anchor size={14} />}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[12px] font-semibold text-slate-800">
                {m.port.flag} {m.port.name}
              </span>
              <span className="block text-[11px] text-slate-500">
                {dateLabelFor(m)} {fmtDateShort(m.actual ?? m.planned)} · {relativeDays(m.daysAway)}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function CallDetails({ call, onClose }: { call: PortCall; onClose: () => void }) {
  const rescheduled = call.actual && call.actual.slice(0, 10) !== call.planned.slice(0, 10)
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[13px] font-semibold text-slate-900">
            {call.port.flag} {call.port.name}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            {call.port.code} · {call.port.country} · {call.roleLabel}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close port details"
          className="-mr-1 -mt-1 rounded p-1 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
        >
          <X size={13} />
        </button>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-2">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{dateLabelFor(call)}</div>
          <div className="text-[13px] font-semibold text-slate-800">{fmtDate(call.actual ?? call.planned)}</div>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${CALL_BADGE[call.status].cls}`}>
          {CALL_BADGE[call.status].label}
        </span>
      </div>
      <div className="mt-1.5 text-[11px] text-slate-500">
        {relativeDays(call.daysAway)}
        {rescheduled && <> · planned {fmtDateShort(call.planned)}</>}
      </div>

      <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-2.5">
        {call.milestones.map((m) => (
          <div key={m.key} className="flex items-center justify-between gap-2 text-[11px]">
            <span className="flex items-center gap-1.5 text-slate-600">
              {m.actual ? (
                <Check size={11} className="flex-none text-emerald-600" />
              ) : (
                <span className="h-1.5 w-1.5 flex-none rounded-full border border-slate-300" />
              )}
              {m.label}
            </span>
            <span className={m.actual ? 'font-medium text-emerald-600' : 'text-slate-400'}>
              {fmtDateShort(m.actual ?? m.planned)}
            </span>
          </div>
        ))}
      </div>
    </>
  )
}
