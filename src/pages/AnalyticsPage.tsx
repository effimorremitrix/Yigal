import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { Card, CardHeader } from '../components/ui/Card'
import { TODAY } from '../data/random'

const COLORS = ['#1D6FE0', '#0EA5A4', '#8B5CF6', '#F59E0B', '#64748B']

const teuOf = (type: string) => (type === '20DV' ? 1 : 2)

export default function AnalyticsPage() {
  const { shipments } = useData()
  const { vocabulary } = useAuth()

  // Last 6 calendar months (including the anchor month).
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(TODAY.getUTCFullYear(), TODAY.getUTCMonth() - 5 + i, 1))
    return { key: `${d.getUTCFullYear()}-${d.getUTCMonth()}`, label: d.toLocaleDateString('en-GB', { month: 'short' }) }
  })

  const monthly = months.map((m) => {
    const inMonth = shipments.filter((s) => {
      const d = new Date(s.etd)
      return `${d.getUTCFullYear()}-${d.getUTCMonth()}` === m.key
    })
    const teu = inMonth.reduce((n, s) => n + s.containers.reduce((t, c) => t + teuOf(c.type), 0), 0)
    const done = inMonth.filter((s) => ['arrived', 'delivered', 'in_transit', 'transshipment', 'delayed'].includes(s.status))
    const onTime = done.length ? Math.round((done.filter((s) => s.onTime).length / done.length) * 100) : null
    return { month: m.label, teu, onTime }
  })

  const byCarrier = Object.values(
    shipments.reduce<Record<string, { name: string; value: number }>>((acc, s) => {
      const teu = s.containers.reduce((t, c) => t + teuOf(c.type), 0)
      acc[s.carrier.scac] = acc[s.carrier.scac] ?? { name: s.carrier.name, value: 0 }
      acc[s.carrier.scac].value += teu
      return acc
    }, {}),
  ).sort((a, b) => b.value - a.value)

  const byLane = Object.values(
    shipments.reduce<Record<string, { lane: string; co2: number }>>((acc, s) => {
      const key = `${s.origin.code}→${s.destination.code}`
      acc[key] = acc[key] ?? { lane: key, co2: 0 }
      acc[key].co2 += s.co2Tons
      return acc
    }, {}),
  )
    .map((r) => ({ ...r, co2: Math.round(r.co2 * 10) / 10 }))
    .sort((a, b) => b.co2 - a.co2)

  const totalTeu = shipments.reduce((n, s) => n + s.containers.reduce((t, c) => t + teuOf(c.type), 0), 0)
  const totalCost = shipments.reduce((n, s) => n + s.freightCostUsd, 0)
  const totalCo2 = Math.round(shipments.reduce((n, s) => n + s.co2Tons, 0))
  const avgCostPerTeu = Math.round(totalCost / totalTeu)

  // Trader mode reports the book it earns on: what was invoiced, what was kept, and the rate that
  // produced it. The effective rate is commission over deal value rather than the house rate, so a
  // shipment carrying its own rate moves it and the tile stays honest.
  const totalDeal = shipments.reduce((n, s) => n + (s.dealValueUsd ?? 0), 0)
  const totalCommission = shipments.reduce((n, s) => n + (s.commissionUsd ?? 0), 0)
  const effectiveRate = totalDeal > 0 ? (totalCommission / totalDeal) * 100 : 0
  const tradingTiles = vocabulary.showsCommission && totalDeal > 0

  const tiles = tradingTiles
    ? [
        { label: 'Total volume (TEU)', value: totalTeu.toLocaleString() },
        { label: 'Deal value invoiced', value: `$${(totalDeal / 1e6).toFixed(2)}M` },
        { label: 'Commission earned', value: `$${(totalCommission / 1e3).toFixed(0)}K` },
        { label: 'Effective rate', value: `${effectiveRate.toFixed(2)}%` },
      ]
    : [
        { label: 'Total volume (TEU)', value: totalTeu.toLocaleString() },
        { label: 'Freight spend', value: `$${(totalCost / 1e6).toFixed(2)}M` },
        { label: 'Avg cost / TEU', value: `$${avgCostPerTeu.toLocaleString()}` },
        { label: 'CO₂ emitted', value: `${totalCo2.toLocaleString()} t` },
      ]

  const tooltipStyle = { fontSize: 12, borderRadius: 8 }
  const axisTick = { fontSize: 11, fill: '#94a3b8' }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {tiles.map((k) => (
          <Card key={k.label} className="p-4">
            <div className="text-[12px] text-slate-500">{k.label}</div>
            <div className="mt-1 text-[22px] font-semibold text-slate-900">{k.value}</div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Volume by month" subtitle="TEU booked, last 6 months" />
          <div className="h-64 px-3 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={axisTick} />
                <YAxis tickLine={false} axisLine={false} tick={axisTick} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#f8fafc' }} />
                <Bar dataKey="teu" name="TEU" fill="#1D6FE0" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Carrier allocation" subtitle="Share of booked TEU by carrier" />
          <div className="h-64 px-3 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={byCarrier} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2} isAnimationActive={false}>
                  {byCarrier.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="On-time performance" subtitle="Monthly on-time % vs 90% target" />
          <div className="h-64 px-3 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthly} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={axisTick} />
                <YAxis domain={[50, 100]} tickLine={false} axisLine={false} tick={axisTick} unit="%" />
                <Tooltip contentStyle={tooltipStyle} />
                <ReferenceLine y={90} stroke="#F59E0B" strokeDasharray="6 4" label={{ value: 'target', fontSize: 11, fill: '#F59E0B', position: 'insideTopRight' }} />
                <Line type="monotone" dataKey="onTime" name="On-time %" stroke="#0EA5A4" strokeWidth={2.5} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="CO₂ by trade lane" subtitle="Estimated tonnes, all shipments" />
          <div className="h-64 px-3 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byLane} layout="vertical" margin={{ top: 4, right: 16, left: 30, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tickLine={false} axisLine={false} tick={axisTick} />
                <YAxis type="category" dataKey="lane" width={100} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#f8fafc' }} />
                <Bar dataKey="co2" name="CO₂ (t)" fill="#8B5CF6" radius={[0, 4, 4, 0]} barSize={14} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  )
}
