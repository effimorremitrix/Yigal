import { useNavigate } from 'react-router-dom'
import { ArrowRight, Container } from 'lucide-react'
import type { Shipment } from '../../types'
import { fmtDateShort } from '../../data/random'
import { ShipmentStatusBadge } from '../ui/StatusBadge'
import { EmptyState } from '../ui/inputs'

export default function ShipmentTable({ shipments }: { shipments: Shipment[] }) {
  const navigate = useNavigate()

  if (shipments.length === 0) {
    return <EmptyState title="No shipments match your filters" subtitle="Try clearing the search or filters." />
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400">
            <th className="px-5 py-3 font-medium">Booking ref</th>
            <th className="px-3 py-3 font-medium">Route</th>
            <th className="px-3 py-3 font-medium">Carrier</th>
            <th className="px-3 py-3 font-medium">Vessel / Voyage</th>
            <th className="px-3 py-3 font-medium">Cntrs</th>
            <th className="px-3 py-3 font-medium">ETD</th>
            <th className="px-3 py-3 font-medium">ETA</th>
            <th className="px-3 py-3 font-medium">Status</th>
            <th className="px-5 py-3 font-medium">Progress</th>
          </tr>
        </thead>
        <tbody>
          {shipments.map((s) => (
            <tr
              key={s.id}
              onClick={() => navigate(`/shipments/${s.id}`)}
              className="cursor-pointer border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50"
            >
              <td className="px-5 py-3 font-medium text-brand-600">{s.bookingRef}</td>
              <td className="px-3 py-3">
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  <span>{s.origin.flag}</span>
                  <span className="font-medium text-slate-700">{s.origin.code}</span>
                  <ArrowRight size={12} className="text-slate-400" />
                  <span>{s.destination.flag}</span>
                  <span className="font-medium text-slate-700">{s.destination.code}</span>
                </span>
              </td>
              <td className="px-3 py-3 text-slate-600">{s.carrier.name}</td>
              <td className="px-3 py-3 whitespace-nowrap text-slate-600">
                {s.vessel.name} <span className="text-slate-400">· {s.vessel.voyage}</span>
              </td>
              <td className="px-3 py-3">
                <span className="inline-flex items-center gap-1 text-slate-600">
                  <Container size={13} className="text-slate-400" />
                  {s.containers.length}
                </span>
              </td>
              <td className="px-3 py-3 whitespace-nowrap text-slate-600">{fmtDateShort(s.etd)}</td>
              <td className="px-3 py-3 whitespace-nowrap text-slate-600">{fmtDateShort(s.eta)}</td>
              <td className="px-3 py-3">
                <ShipmentStatusBadge status={s.status} />
              </td>
              <td className="px-5 py-3">
                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${s.status === 'delayed' ? 'bg-red-500' : 'bg-brand-600'}`}
                    style={{ width: `${Math.round(s.progress * 100)}%` }}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
