import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Bell, LogOut, Settings } from 'lucide-react'
import Sidebar from './Sidebar'
import { useAuth } from '../../context/AuthContext'

const TITLES: Record<string, string> = {
  '/': 'Control Tower',
  '/shipments': 'Shipments',
  '/booking': 'New Booking',
  '/tracking': 'Track & Trace',
  '/documents': 'Documents',
  '/invoices': 'Invoices',
  '/deckhand': 'Deckhand',
  '/analytics': 'Analytics & Reporting',
  '/settings': 'Settings',
}

const initials = (name: string): string =>
  name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

export default function AppLayout() {
  const { pathname } = useLocation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const title = TITLES[pathname] ?? (pathname.startsWith('/shipments/') ? 'Shipment Detail' : 'Tidelane')

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className="pl-60">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 px-6 backdrop-blur">
          <h1 className="text-[15px] font-semibold text-slate-900">{title}</h1>
          <div className="flex items-center gap-4">
            <button className="relative rounded-full p-1.5 text-slate-500 hover:bg-slate-100" title="Notifications">
              <Bell size={18} />
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />
            </button>
            <div className="relative" ref={menuRef}>
              <button className="flex items-center gap-2" onClick={() => setMenuOpen((v) => !v)} data-testid="user-menu">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-[12px] font-semibold text-white">
                  {user ? initials(user.name) : '–'}
                </span>
                <div className="text-left leading-tight">
                  <div className="text-[12px] font-medium text-slate-800">{user?.name}</div>
                  <div className="text-[10px] text-slate-500">{user?.title || user?.orgName}</div>
                </div>
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-11 z-30 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                  <div className="border-b border-slate-100 px-3 py-2">
                    <div className="text-[12px] font-medium text-slate-800">{user?.email}</div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">
                      {user?.role} · {user?.orgName}
                    </div>
                  </div>
                  <Link
                    to="/settings"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-[12px] text-slate-700 hover:bg-slate-50"
                  >
                    <Settings size={14} />
                    Settings
                  </Link>
                  <button
                    onClick={async () => {
                      setMenuOpen(false)
                      await logout()
                      navigate('/login')
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-red-600 hover:bg-red-50"
                  >
                    <LogOut size={14} />
                    Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
