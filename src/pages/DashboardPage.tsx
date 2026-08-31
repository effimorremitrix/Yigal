import { Link } from 'react-router-dom'
import { AlertTriangle, Clock, Container, DollarSign, Ship } from 'lucide-react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { useData } from '../context/DataContext'
import KpiCard from '../components/ui/KpiCard'
import { Card, CardHeader } from '../components/ui/Card'
import { ShipmentStatusBadge } from '../components/ui/StatusBadge'
import { daysBetween, fmtDateShort, TODAY } from '../data/random'

const ACTIVE = new Set(['booking_confirmed', 'awaiting_departure', 'in_transit', 'transshipment', 'delayed', 'arrived'])

export default function DashboardPage() {
  const { shipments } = useData()

  const active = shipments.filter((s) => ACTIVE.has(s.status))
  const sailing = shipments.filter((s) => ['in_transit', 'transshipment', 'delayed'].includes(s.status))
  const containersInTransit = sailing.reduce((n, s) => n + s.containers.length, 0)
  const closed = shipments.filter((s) => ['arrived', 'delivered'].includes(s.status))
  const onTimePct = closed.length ? Math.round((closed.filter((s) => s.onTime).length / closed.length) * 100) : 100
  const ddRisk = shipments.reduce((n, s) => n + s.containers.reduce((m, c) => m + c.ddRiskUsd, 0), 0)

  const delayedShipments = shipments.filter((s) => s.status === 'delayed')
  const arrivingSoon = sailing
    .filter((s) => daysBetween(TODAY, s.eta) >= 0 && daysBetween(TODAY, s.eta) <= 7)
    .sort((a, b) => new Date(a.eta).getTime() - new Date(b.eta).getTime())
    .slice(0, 6)

  const activity = shipments
    .flatMap((s) =>
      s.milestones
        .filter((m) => m.actual)
        .map((m) => ({ shipment: s, milestone: m, at: new Date(m.actual!).getTime() })),
    )
    .sort((a, b) => b.at - a.at)
    .slice(0, 7)

  // Weekly departed-container volume, trailing 8 weeks.
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = new Date(TODAY.getTime() - (7 - i) * 7 * 86400000)
    const end = new Date(start.getTime() + 7 * 86400000)
    const vol = shipments
      .filter((s) => s.atd && new Date(s.atd) >= start && new Date(s.atd) < end)
      .reduce((n, s) => n + s.containers.length, 0)
    return { week: `W${i + 1}`, containers: vol }
  })

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Active shipments" value={String(active.length)} delta="+8% vs last month" deltaGood icon={Ship} />
        <KpiCard label="Containers in transit" value={String(containersInTransit)} delta="+12 this week" deltaGood icon={Container} />
        <KpiCard
          label="On-time performance"
          value={`${onTimePct}%`}
          delta={onTimePct >= 90 ? 'On target' : 'Below 90% target'}
          deltaGood={onTimePct >= 90}
          icon={Clock}
        />
        <KpiCard
          label="D&D cost at risk"
          value={`$${(ddRisk / 1000).toFixed(1)}k`}
          delta="-5% vs last month"
          deltaGood
          icon={DollarSign}
          hint="detention & demurrage"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Exceptions"
            subtitle="Shipments with a revised ETA that need attention"
            action={
              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-600">
                <AlertTriangle size={12} />
                {delayedShipments.length} delayed
              </span>
            }
          />
          <div className="divide-y divide-slate-100">
            {delayedShipments.slice(0, 5).map((s) => (
              <Link
                key={s.id}
                to={`/shipments/${s.id}`}
                className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-slate-50"
              >
                <div>
                  <div className="text-[13px] font-medium text-slate-800">
                    {s.bookingRef} · {s.origin.name} → {s.destination.name}
                  </div>
                  <div className="mt-0.5 text-[12px] text-red-600">{s.delayReason}</div>
                </div>
                <div className="text-right">
                  <ShipmentStatusBadge status={s.status} />
                  <div className="mt-1 text-[11px] text-slate-400">new ETA {fmtDateShort(s.eta)}</div>
                </div>
              </Link>
            ))}
            {delayedShipments.length === 0 && (
              <div className="px-5 py-8 text-center text-[13px] text-slate-400">No exceptions — smooth sailing.</div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Weekly volume" subtitle="Containers departed, trailing 8 weeks" />
          <div className="h-48 px-3 pb-3 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={weeks} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="vol" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1D6FE0" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#1D6FE0" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="week" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Area type="monotone" dataKey="containers" stroke="#1D6FE0" strokeWidth={2} fill="url(#vol)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Arriving this week" subtitle="Plan gate-out and final delivery slots" />
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-5 py-2.5 font-medium">Ref</th>
                <th className="px-3 py-2.5 font-medium">Route</th>
                <th className="px-3 py-2.5 font-medium">Vessel</th>
                <th className="px-3 py-2.5 font-medium">ETA</th>
                <th className="px-5 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {arrivingSoon.map((s) => (
                <tr key={s.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-2.5">
                    <Link to={`/shipments/${s.id}`} className="font-medium text-brand-600 hover:underline">
                      {s.bookingRef}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">
                    {s.origin.code} → {s.destination.code}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">{s.vessel.name}</td>
                  <td className="px-3 py-2.5 font-medium text-slate-800">{fmtDateShort(s.eta)}</td>
                  <td className="px-5 py-2.5">
                    <ShipmentStatusBadge status={s.status} />
                  </td>
                </tr>
              ))}
              {arrivingSoon.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                    No arrivals in the next 7 days.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>

        <Card>
          <CardHeader title="Recent activity" subtitle="Latest confirmed milestones" />
          <div className="divide-y divide-slate-50">
            {activity.map(({ shipment, milestone }) => (
              <Link
                key={`${shipment.id}-${milestone.key}`}
                to={`/shipments/${shipment.id}`}
                className="block px-5 py-2.5 transition-colors hover:bg-slate-50"
              >
                <div className="text-[12px] font-medium text-slate-800">
                  {milestone.label} · <span className="text-slate-500">{milestone.location}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-slate-400">
                  {shipment.bookingRef} · {fmtDateShort(milestone.actual!)}
                </div>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
