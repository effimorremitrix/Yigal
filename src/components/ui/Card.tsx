import type { ReactNode } from 'react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {children}
    </div>
  )
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
      <div>
        <h2 className="text-[14px] font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[12px] text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
