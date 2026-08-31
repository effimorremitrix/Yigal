import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { useData } from '../context/DataContext'
import { Card, CardHeader } from '../components/ui/Card'
import WorldMap from '../components/map/WorldMap'
import { ShipmentStatusBadge } from '../components/ui/StatusBadge'
import { fmtDateShort } from '../data/random'

export default function TrackTracePage() {
  const { shipments } = useData()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const sailing = shipments.filter((s) => ['in_transit', 'transshipment', 'delayed'].includes(s.status))

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardHeader
          title="Live vessel positions"
          subtitle={`${sailing.length} shipments currently on the water — click a vessel to highlight its route`}
        />
        <div className="p-4">
          <WorldMap shipments={sailing} selectedId={selectedId} onSelect={setSelectedId} />
          <div className="mt-3 flex items-center gap-5 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#1D6FE0]" /> In transit
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#8B5CF6]" /> Transshipment
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#EF4444]" /> Delayed
            </span>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="On the water" subtitle="Select to highlight on the map" />
        <div className="max-h-[540px] divide-y divide-slate-50 overflow-y-auto">
          {sailing
            .sort((a, b) => new Date(a.eta).getTime() - new Date(b.eta).getTime())
            .map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedId(s.id === selectedId ? null : s.id)}
                className={`block w-full px-5 py-3 text-left transition-colors ${s.id === selectedId ? 'bg-brand-50/60' : 'hover:bg-slate-50'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-slate-800">{s.bookingRef}</span>
                  <ShipmentStatusBadge status={s.status} />
                </div>
                <div className="mt-1 text-[12px] text-slate-500">
                  {s.origin.flag} {s.origin.code} → {s.destination.flag} {s.destination.code} · {s.vessel.name}
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  <div className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${s.status === 'delayed' ? 'bg-red-500' : 'bg-brand-600'}`}
                      style={{ width: `${Math.round(s.progress * 100)}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-slate-400">ETA {fmtDateShort(s.eta)}</span>
                </div>
                {s.id === selectedId && (
                  <Link
                    to={`/shipments/${s.id}`}
                    className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-brand-600 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Open shipment
                    <ExternalLink size={12} />
                  </Link>
                )}
              </button>
            ))}
        </div>
      </Card>
    </div>
  )
}
