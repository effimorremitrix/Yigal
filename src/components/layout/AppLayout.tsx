import { Outlet, useLocation } from 'react-router-dom'
import { Bell } from 'lucide-react'
import Sidebar from './Sidebar'

const TITLES: Record<string, string> = {
  '/': 'Control Tower',
  '/shipments': 'Shipments',
  '/booking': 'New Booking',
  '/tracking': 'Track & Trace',
  '/documents': 'Documents',
  '/analytics': 'Analytics & Reporting',
}

export default function AppLayout() {
  const { pathname } = useLocation()
  const title = TITLES[pathname] ?? (pathname.startsWith('/shipments/') ? 'Shipment Detail' : 'Tidelane')

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
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-[12px] font-semibold text-white">
                EM
              </span>
              <div className="leading-tight">
                <div className="text-[12px] font-medium text-slate-800">Effi Mor</div>
                <div className="text-[10px] text-slate-500">Logistics Manager</div>
              </div>
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
