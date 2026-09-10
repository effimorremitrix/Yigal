import { NavLink } from 'react-router-dom'
import {
  Anchor,
  BarChart3,
  BookOpen,
  CalendarPlus,
  FileText,
  LayoutDashboard,
  Map,
  Receipt,
  Settings,
  Ship,
  Wand2,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

// write: admin/ops only. internalWrite: admin/ops of the internal org only (finance data stays in-house).
const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/shipments', label: 'Shipments', icon: Ship },
  { to: '/booking', label: 'New Booking', icon: CalendarPlus, write: true },
  { to: '/tracking', label: 'Track & Trace', icon: Map },
  { to: '/documents', label: 'Documents', icon: FileText },
  { to: '/invoices', label: 'Invoices', icon: Receipt, internalWrite: true },
  { to: '/deckhand', label: 'Deckhand', icon: Wand2, internalWrite: true },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/guide', label: 'User Guide', icon: BookOpen },
]

export default function Sidebar() {
  const { user, canWrite, isInternal } = useAuth()
  const items = NAV.filter((item) => (!item.write || canWrite) && (!item.internalWrite || (canWrite && isInternal)))

  return (
    <aside className="fixed inset-y-0 left-0 z-20 flex w-60 flex-col bg-navy-900 text-slate-300">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
          <Anchor size={20} />
        </span>
        <div>
          <div className="text-[15px] font-semibold tracking-wide text-white">Tidelane</div>
          <div className="text-[10px] uppercase tracking-widest text-slate-400">Ocean freight OS</div>
        </div>
      </div>
      <nav className="mt-2 flex-1 space-y-1 px-3">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors ${
                isActive ? 'bg-navy-700 text-white' : 'hover:bg-navy-800 hover:text-white'
              }`
            }
          >
            <Icon size={17} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-navy-700 px-5 py-4 text-[11px] text-slate-400">
        <div className="font-medium text-slate-300">{user?.orgName ?? 'Demo workspace'}</div>
        {user && user.orgType !== 'internal' ? `Partner view — ${user.orgType}` : 'Data is simulated — no live connections.'}
      </div>
    </aside>
  )
}
