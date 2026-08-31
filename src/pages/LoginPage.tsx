import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Anchor, BookOpen, LogIn } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { ApiError } from '../lib/api'

const DEMO_ACCOUNTS = [
  { email: 'effi@tidelane.demo', label: 'Admin · Tidelane' },
  { email: 'ops@tidelane.demo', label: 'Operations · Tidelane' },
  { email: 'viewer@tidelane.demo', label: 'Viewer · Tidelane' },
  { email: 'dana@atlaspolymers.demo', label: 'Shipper · Atlas Polymers' },
]

export default function LoginPage() {
  const { status, login, landingPage } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('effi@tidelane.demo')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (status === 'authed') navigate(landingPage, { replace: true })
  }, [status, navigate, landingPage])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(email.trim(), password)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed — please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Brand panel */}
      <div className="hidden w-[42%] flex-col justify-between bg-navy-900 p-10 text-slate-300 lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Anchor size={22} />
          </span>
          <div>
            <div className="text-[17px] font-semibold tracking-wide text-white">Tidelane</div>
            <div className="text-[10px] uppercase tracking-widest text-slate-400">Ocean freight OS</div>
          </div>
        </div>
        <div>
          <h1 className="text-[28px] font-semibold leading-snug text-white">
            Command your
            <br />
            container shipping.
          </h1>
          <p className="mt-3 max-w-sm text-[13px] leading-relaxed text-slate-400">
            Bookings, tracking, documents and analytics for large-volume shippers — connected with your forwarders,
            carriers and consignees on one platform.
          </p>
        </div>
        <div className="text-[11px] text-slate-500">Demo environment · all data simulated</div>
      </div>

      {/* Login form */}
      <div className="flex flex-1 items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-sm">
          <div className="rounded-xl border border-slate-200 bg-white p-7 shadow-sm">
            <h2 className="text-[17px] font-semibold text-slate-900">Sign in</h2>
            <p className="mt-1 text-[12px] text-slate-500">Use one of the demo accounts below.</p>
            <form onSubmit={submit} className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[13px] focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="tidelane-demo"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[13px] focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15"
                />
              </label>
              {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</div>}
              <button
                type="submit"
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
              >
                <LogIn size={15} />
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Demo accounts</div>
            <div className="mt-2 space-y-1">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.email}
                  onClick={() => {
                    setEmail(a.email)
                    setPassword('tidelane-demo')
                  }}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-slate-50"
                >
                  <span className="font-mono text-slate-700">{a.email}</span>
                  <span className="text-slate-400">{a.label}</span>
                </button>
              ))}
            </div>
            <div className="mt-2 text-[11px] text-slate-400">
              Password for all accounts: <span className="font-mono text-slate-600">tidelane-demo</span>
            </div>
          </div>

          <Link
            to="/guide"
            className="mt-4 flex items-center justify-center gap-1.5 text-[12px] font-medium text-brand-600 hover:underline"
          >
            <BookOpen size={13} />
            What is this demo? Read the user guide
          </Link>
        </div>
      </div>
    </div>
  )
}
