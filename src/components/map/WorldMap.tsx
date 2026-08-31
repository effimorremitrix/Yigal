import { useMemo, useState } from 'react'
import type { Shipment } from '../../types'
import { LANES, PORTS } from '../../data/constants'
import { CONTINENTS, MAP_H, MAP_W, project } from '../../data/worldMap'
import { fmtDateShort } from '../../data/random'

interface VesselPin {
  shipment: Shipment
  x: number
  y: number
}

// Splits a projected polyline wherever it wraps across the antimeridian.
function toPathSegments(waypoints: [number, number][]): string[] {
  const pts = waypoints.map(([lat, lon]) => project(lat, lon))
  const segments: string[] = []
  let current: [number, number][] = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    if (Math.abs(pts[i][0] - pts[i - 1][0]) > MAP_W / 2) {
      segments.push(toPath(current))
      current = [pts[i]]
    } else {
      current.push(pts[i])
    }
  }
  segments.push(toPath(current))
  return segments.filter((s) => s.includes('L'))
}

function toPath(pts: [number, number][]): string {
  return pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
}

// Position along the lane's waypoints at fraction t, in unwrapped lon space.
function positionAlong(waypoints: [number, number][], t: number): [number, number] {
  const dists: number[] = [0]
  for (let i = 1; i < waypoints.length; i++) {
    const [la1, lo1] = waypoints[i - 1]
    const [la2, lo2] = waypoints[i]
    dists.push(dists[i - 1] + Math.hypot(la2 - la1, lo2 - lo1))
  }
  const target = t * dists[dists.length - 1]
  for (let i = 1; i < dists.length; i++) {
    if (dists[i] >= target) {
      const f = (target - dists[i - 1]) / (dists[i] - dists[i - 1] || 1)
      const [la1, lo1] = waypoints[i - 1]
      const [la2, lo2] = waypoints[i]
      return [la1 + (la2 - la1) * f, lo1 + (lo2 - lo1) * f]
    }
  }
  return waypoints[waypoints.length - 1]
}

// Nudge labels of clustered ports (North Sea, East China Sea) apart.
const LABEL_OFFSETS: Record<string, { dx: number; dy: number; anchor?: 'end' }> = {
  NLRTM: { dx: -5, dy: -3, anchor: 'end' },
  BEANR: { dx: -5, dy: 8, anchor: 'end' },
  GBFXT: { dx: -5, dy: -8, anchor: 'end' },
  DEHAM: { dx: 5, dy: -3 },
  CNSHA: { dx: 5, dy: -3 },
  CNNGB: { dx: 5, dy: 9 },
  KRPUS: { dx: 5, dy: -5 },
}

const STATUS_COLOR: Record<string, string> = {
  in_transit: '#1D6FE0',
  transshipment: '#8B5CF6',
  delayed: '#EF4444',
}

export default function WorldMap({
  shipments,
  selectedId,
  onSelect,
}: {
  shipments: Shipment[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}) {
  const [hovered, setHovered] = useState<VesselPin | null>(null)

  const lanePaths = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const lane of LANES) map.set(lane.id, toPathSegments(lane.waypoints))
    return map
  }, [])

  const pins: VesselPin[] = useMemo(
    () =>
      shipments
        .map((s) => {
          const lane = LANES.find((l) => l.id === s.laneId)
          if (!lane) return null
          const [lat, lon] = positionAlong(lane.waypoints, s.progress)
          const [x, y] = project(lat, lon)
          return { shipment: s, x, y }
        })
        .filter((p): p is VesselPin => p !== null),
    [shipments],
  )

  const activeLanes = new Set(shipments.map((s) => s.laneId))
  const selected = shipments.find((s) => s.id === selectedId)

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="w-full rounded-lg bg-[#EAF2F8]" onClick={() => onSelect(null)}>
        {CONTINENTS.map((poly, i) => (
          <polygon
            key={i}
            points={poly.map(([lon, lat]) => project(lat, lon).map((v) => v.toFixed(1)).join(',')).join(' ')}
            fill="#D8E3ED"
            stroke="#BACBDA"
            strokeWidth={0.7}
          />
        ))}

        {/* Route lines for active lanes; the selected shipment's lane is emphasized */}
        {[...activeLanes].map((laneId) =>
          (lanePaths.get(laneId) ?? []).map((d, i) => {
            const isSel = selected?.laneId === laneId
            return (
              <path
                key={`${laneId}-${i}`}
                d={d}
                fill="none"
                stroke={isSel ? '#1D6FE0' : '#94A8BC'}
                strokeWidth={isSel ? 2 : 1}
                strokeDasharray={isSel ? 'none' : '4 4'}
                opacity={selected && !isSel ? 0.35 : 0.9}
              />
            )
          }),
        )}

        {/* Port markers */}
        {Object.values(PORTS).map((port) => {
          const [x, y] = project(port.lat, port.lon)
          const off = LABEL_OFFSETS[port.code] ?? { dx: 5, dy: 3 }
          return (
            <g key={port.code}>
              <circle cx={x} cy={y} r={2.6} fill="#41576D" />
              <text x={x + off.dx} y={y + off.dy} fontSize={8.5} fill="#41576D" fontWeight={600} textAnchor={off.anchor}>
                {port.code}
              </text>
            </g>
          )
        })}

        {/* Vessel pins */}
        {pins.map((p) => {
          const isSel = p.shipment.id === selectedId
          const color = STATUS_COLOR[p.shipment.status] ?? '#1D6FE0'
          return (
            <g
              key={p.shipment.id}
              className="cursor-pointer"
              onClick={(e) => {
                e.stopPropagation()
                onSelect(p.shipment.id)
              }}
              onMouseEnter={() => setHovered(p)}
              onMouseLeave={() => setHovered(null)}
            >
              {isSel && <circle cx={p.x} cy={p.y} r={11} fill={color} opacity={0.18} />}
              <circle cx={p.x} cy={p.y} r={isSel ? 6 : 4.5} fill={color} stroke="white" strokeWidth={1.6} />
            </g>
          )
        })}
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute z-10 w-52 rounded-lg border border-slate-200 bg-white p-3 shadow-lg"
          style={{
            left: `min(max(${(hovered.x / MAP_W) * 100}%, 6%), 78%)`,
            top: `${(hovered.y / MAP_H) * 100}%`,
            transform: 'translate(-50%, -115%)',
          }}
        >
          <div className="text-[12px] font-semibold text-slate-900">{hovered.shipment.bookingRef}</div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            {hovered.shipment.vessel.name} · {hovered.shipment.carrier.name}
          </div>
          <div className="mt-1 text-[11px] text-slate-600">
            {hovered.shipment.origin.code} → {hovered.shipment.destination.code} · ETA {fmtDateShort(hovered.shipment.eta)}
          </div>
        </div>
      )}
    </div>
  )
}
