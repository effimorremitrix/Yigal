import { useEffect, useState, type FormEvent } from 'react'
import { UserPlus } from 'lucide-react'
import { useAuth, type UserSettings } from '../context/AuthContext'
import { apiFetch } from '../lib/api'
import { Card, CardHeader } from '../components/ui/Card'
import Tabs from '../components/ui/Tabs'
import { SavedFlash, Select, Toggle } from '../components/ui/inputs'
import IntegrationsTab from '../components/settings/IntegrationsTab'

const TIMEZONES = ['UTC', 'Asia/Jerusalem', 'Europe/Paris', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Asia/Shanghai', 'Asia/Singapore']
const DATE_FORMATS = ['dd MMM yyyy', 'dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd']
const LANDING_PAGES = [
  { value: '/', label: 'Dashboard' },
  { value: '/shipments', label: 'Shipments' },
  { value: '/tracking', label: 'Track & Trace' },
  { value: '/documents', label: 'Documents' },
  { value: '/analytics', label: 'Analytics' },
]

const inputCls =
  'w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15'

function ProfileTab() {
  const { user, saveProfile } = useAuth()
  const [name, setName] = useState(user?.name ?? '')
  const [title, setTitle] = useState(user?.title ?? '')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await saveProfile({ name, title })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    }
  }

  return (
    <form onSubmit={submit} className="max-w-md space-y-4 p-5">
      <label className="block">
        <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Full name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Job title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} data-testid="profile-title" />
      </label>
      <div className="grid grid-cols-2 gap-4 text-[12px] text-slate-500">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-400">Email</div>
          {user?.email}
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-400">Organization</div>
          {user?.orgName} · {user?.role}
        </div>
      </div>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</div>}
      <div className="flex items-center gap-3">
        <button type="submit" className="rounded-lg bg-brand-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-brand-700">
          Save profile
        </button>
        <SavedFlash show={saved} />
      </div>
    </form>
  )
}

function PreferencesTab() {
  const { settings, saveSettings } = useAuth()
  const [form, setForm] = useState<UserSettings | null>(settings)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => setForm(settings), [settings])
  if (!form) return null

  const set = <K extends keyof UserSettings>(k: K, v: UserSettings[K]) => setForm((f) => (f ? { ...f, [k]: v } : f))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!form) return
    setError('')
    try {
      await saveSettings(form)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    }
  }

  return (
    <form onSubmit={submit} className="max-w-md space-y-4 p-5">
      <label className="block">
        <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Timezone</span>
        <Select value={form.timezone} onChange={(v) => set('timezone', v)} options={TIMEZONES.map((t) => ({ value: t, label: t }))} />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Date format</span>
        <Select value={form.date_format} onChange={(v) => set('date_format', v)} options={DATE_FORMATS.map((f) => ({ value: f, label: f }))} />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Landing page after sign-in</span>
        <Select value={form.landing_page} onChange={(v) => set('landing_page', v)} options={LANDING_PAGES} />
      </label>
      <div className="space-y-2 pt-1">
        <div className="text-[12px] font-medium text-slate-500">Email notifications</div>
        <Toggle label="Shipment delays" hint="Revised ETAs and exceptions" checked={Boolean(form.notify_delays)} onChange={(v) => set('notify_delays', v ? 1 : 0)} />
        <Toggle label="Document activity" hint="Uploads and approval requests" checked={Boolean(form.notify_docs)} onChange={(v) => set('notify_docs', v ? 1 : 0)} />
        <Toggle label="Weekly digest" hint="Monday summary of your flows" checked={Boolean(form.notify_weekly_digest)} onChange={(v) => set('notify_weekly_digest', v ? 1 : 0)} />
      </div>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</div>}
      <div className="flex items-center gap-3">
        <button type="submit" className="rounded-lg bg-brand-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-brand-700">
          Save preferences
        </button>
        <SavedFlash show={saved} />
      </div>
    </form>
  )
}

interface AdminUser {
  id: number
  email: string
  name: string
  title: string
  role: string
  active: number
  org_id: number
  org_name: string
  org_type: string
}
interface AdminOrg {
  id: number
  name: string
  type: string
}

function AdminTab() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [orgs, setOrgs] = useState<AdminOrg[]>([])
  const [error, setError] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [draft, setDraft] = useState({ email: '', name: '', title: '', role: 'viewer', orgId: 1, password: '' })

  const load = () =>
    apiFetch<{ users: AdminUser[]; organizations: AdminOrg[] }>('/api/users').then((d) => {
      setUsers(d.users)
      setOrgs(d.organizations)
    })
  useEffect(() => {
    void load().catch(() => setError('Failed to load users'))
  }, [])

  async function patch(id: number, body: Record<string, unknown>) {
    setError('')
    try {
      await apiFetch(`/api/users/${id}`, { method: 'PATCH', json: body })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    }
  }

  async function addUser(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await apiFetch('/api/users', { method: 'POST', json: { ...draft, orgId: Number(draft.orgId) } })
      setShowAdd(false)
      setDraft({ email: '', name: '', title: '', role: 'viewer', orgId: 1, password: '' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed')
    }
  }

  return (
    <div className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="text-[12px] text-slate-500">
          {users.length} users across {orgs.length} organizations
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-[12px] font-medium text-white hover:bg-brand-700"
        >
          <UserPlus size={14} />
          Add user
        </button>
      </div>

      {showAdd && (
        <form onSubmit={addUser} className="mb-5 grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
          <input required type="email" placeholder="Email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} className={inputCls} />
          <input required placeholder="Full name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputCls} />
          <input placeholder="Job title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className={inputCls} />
          <Select value={draft.role} onChange={(v) => setDraft({ ...draft, role: v })} options={['admin', 'ops', 'viewer'].map((r) => ({ value: r, label: r }))} />
          <Select value={String(draft.orgId)} onChange={(v) => setDraft({ ...draft, orgId: Number(v) })} options={orgs.map((o) => ({ value: String(o.id), label: `${o.name} (${o.type})` }))} />
          <input required type="password" placeholder="Password (min 8 chars)" value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} className={inputCls} />
          <button type="submit" className="col-span-2 rounded-lg bg-emerald-600 px-4 py-2 text-[12px] font-medium text-white hover:bg-emerald-700 sm:col-span-3">
            Create user
          </button>
        </form>
      )}

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</div>}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400">
              <th className="py-2.5 pr-3 font-medium">User</th>
              <th className="px-3 py-2.5 font-medium">Organization</th>
              <th className="px-3 py-2.5 font-medium">Role</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-slate-50 last:border-0">
                <td className="py-2.5 pr-3">
                  <div className="font-medium text-slate-800">{u.name}</div>
                  <div className="text-[11px] text-slate-400">{u.email}</div>
                </td>
                <td className="px-3 py-2.5">
                  <Select
                    value={String(u.org_id)}
                    onChange={(v) => void patch(u.id, { orgId: Number(v) })}
                    options={orgs.map((o) => ({ value: String(o.id), label: o.name }))}
                  />
                </td>
                <td className="px-3 py-2.5">
                  <Select
                    value={u.role}
                    onChange={(v) => void patch(u.id, { role: v })}
                    options={['admin', 'ops', 'viewer'].map((r) => ({ value: r, label: r }))}
                  />
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                      u.active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'
                    }`}
                  >
                    {u.active ? 'Active' : 'Deactivated'}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  {u.id !== me?.id && (
                    <button
                      onClick={() => void patch(u.id, { active: !u.active })}
                      className={`rounded-lg border px-2.5 py-1.5 text-[12px] font-medium ${
                        u.active
                          ? 'border-red-200 text-red-600 hover:bg-red-50'
                          : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                      }`}
                    >
                      {u.active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const { isAdmin } = useAuth()
  const [tab, setTab] = useState('profile')

  const tabs = [
    { id: 'profile', label: 'Profile' },
    { id: 'preferences', label: 'Preferences' },
    ...(isAdmin ? [{ id: 'admin', label: 'Users & Organizations' }, { id: 'integrations', label: 'Integrations' }] : []),
  ]

  return (
    <Card>
      <CardHeader title="Settings" subtitle="Your profile, preferences, workspace administration and integrations" />
      <div className="px-5 pt-2">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
      </div>
      {tab === 'profile' && <ProfileTab />}
      {tab === 'preferences' && <PreferencesTab />}
      {tab === 'admin' && isAdmin && <AdminTab />}
      {tab === 'integrations' && isAdmin && <IntegrationsTab />}
    </Card>
  )
}
