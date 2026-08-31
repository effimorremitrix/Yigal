import { Check } from 'lucide-react'
import type { Milestone } from '../../types'
import { fmtDateShort } from '../../data/random'

export default function MilestoneTimeline({ milestones }: { milestones: Milestone[] }) {
  return (
    <div className="overflow-x-auto px-2 py-4">
      <div className="flex min-w-[760px]">
        {milestones.map((m, i) => {
          const isLast = i === milestones.length - 1
          return (
            <div key={m.key} className={`relative ${isLast ? 'flex-none' : 'flex-1'} min-w-[104px]`}>
              <div className="flex items-center">
                <span
                  className={`z-10 flex h-6 w-6 flex-none items-center justify-center rounded-full border-2 ${
                    m.status === 'completed'
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : m.status === 'current'
                        ? 'border-brand-600 bg-white ring-4 ring-brand-600/20'
                        : 'border-slate-300 bg-white'
                  }`}
                >
                  {m.status === 'completed' && <Check size={13} />}
                  {m.status === 'current' && <span className="h-2 w-2 animate-pulse rounded-full bg-brand-600" />}
                </span>
                {!isLast && (
                  <span
                    className={`h-0.5 flex-1 ${m.status === 'completed' ? 'bg-brand-600' : 'bg-slate-200'}`}
                  />
                )}
              </div>
              <div className="mt-2 pr-3">
                <div className={`text-[12px] font-medium ${m.status === 'pending' ? 'text-slate-400' : 'text-slate-800'}`}>
                  {m.label}
                </div>
                <div className="text-[11px] text-slate-400">{m.location}</div>
                <div className="mt-0.5 text-[11px]">
                  {m.actual ? (
                    <span className="font-medium text-emerald-600">{fmtDateShort(m.actual)}</span>
                  ) : (
                    <span className="text-slate-400">plan {fmtDateShort(m.planned)}</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
