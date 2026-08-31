import { Search } from 'lucide-react'
import type { ChangeEvent } from 'react'

export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="relative">
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        placeholder={placeholder ?? 'Search…'}
        className="w-64 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-[13px] text-slate-800 placeholder:text-slate-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15"
      />
    </div>
  )
}

export function Select({
  value,
  onChange,
  options,
  label,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  label?: string
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div className="text-[14px] font-medium text-slate-600">{title}</div>
      {subtitle && <div className="mt-1 text-[12px] text-slate-400">{subtitle}</div>}
    </div>
  )
}
