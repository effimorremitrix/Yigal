export default function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string; count?: number }[]
  active: string
  onChange: (id: string) => void
}) {
  return (
    <div className="flex gap-1 border-b border-slate-200">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-[13px] font-medium transition-colors ${
            active === t.id
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          {t.label}
          {t.count !== undefined && (
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
