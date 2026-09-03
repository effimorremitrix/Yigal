import { Check, Search } from 'lucide-react'
import type { ChangeEvent } from 'react'

// Shared text-input styling for the settings forms.
export const inputCls =
  'w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15'

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

export function SavedFlash({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-medium text-emerald-600">
      <Check size={13} />
      Saved
    </span>
  )
}

export function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-left hover:bg-slate-50"
    >
      <span>
        <span className="block text-[13px] font-medium text-slate-800">{label}</span>
        <span className="block text-[11px] text-slate-400">{hint}</span>
      </span>
      <span className={`relative h-5 w-9 rounded-full transition-colors ${checked ? 'bg-brand-600' : 'bg-slate-300'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </button>
  )
}
