import type { LucideIcon } from 'lucide-react'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { Card } from './Card'

export default function KpiCard({
  label,
  value,
  delta,
  deltaGood,
  icon: Icon,
  hint,
}: {
  label: string
  value: string
  delta?: string
  deltaGood?: boolean
  icon: LucideIcon
  hint?: string
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[12px] font-medium text-slate-500">{label}</div>
          <div className="mt-1.5 text-[26px] font-semibold leading-none text-slate-900">{value}</div>
        </div>
        <span className="rounded-lg bg-brand-50 p-2 text-brand-600">
          <Icon size={18} />
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11px]">
        {delta && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium ${
              deltaGood ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
            }`}
          >
            {deltaGood ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {delta}
          </span>
        )}
        {hint && <span className="text-slate-400">{hint}</span>}
      </div>
    </Card>
  )
}
