import { Navigate, Outlet } from 'react-router-dom'
import { Anchor } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

export default function RequireAuth() {
  const { status } = useAuth()
  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-3 text-slate-400">
          <Anchor size={22} className="animate-pulse text-brand-600" />
          <span className="text-[13px]">Loading Tidelane…</span>
        </div>
      </div>
    )
  }
  if (status === 'anon') return <Navigate to="/login" replace />
  return <Outlet />
}
