import { Link } from 'react-router-dom'
import {
  Anchor,
  ArrowLeft,
  BarChart3,
  CalendarPlus,
  Check,
  FileText,
  LayoutDashboard,
  Map,
  Minus,
  Settings,
  Ship,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { Card, CardHeader } from '../components/ui/Card'

const ACCOUNTS = [
  { email: 'effi@tidelane.demo', role: 'Admin', org: 'Tidelane (internal)', sees: 'Everything, plus user management in Settings' },
  { email: 'ops@tidelane.demo', role: 'Operations', org: 'Tidelane (internal)', sees: 'All shipments; can book, approve documents, comment' },
  { email: 'viewer@tidelane.demo', role: 'Viewer', org: 'Tidelane (internal)', sees: 'All shipments, read-only' },
  { email: 'dana@atlaspolymers.demo', role: 'Operations', org: 'Atlas Polymers (shipper)', sees: 'Only shipments where Atlas Polymers is a party' },
  { email: 'amit@globalfreight.demo', role: 'Operations', org: 'GlobalFreight Partners (forwarder)', sees: 'Only shipments they forward' },
  { email: 'pieter@northline.demo', role: 'Viewer', org: 'Northline Imports (consignee)', sees: 'Their inbound shipments, read-only' },
  { email: 'desk@meridianline.demo', role: 'Operations', org: 'Meridian Line (carrier)', sees: 'Shipments carried by Meridian Line' },
]

const PERMISSIONS: { action: string; admin: boolean; ops: boolean; viewer: boolean }[] = [
  { action: 'View shipments, tracking, documents, analytics', admin: true, ops: true, viewer: true },
  { action: 'Create bookings', admin: true, ops: true, viewer: false },
  { action: 'Approve documents', admin: true, ops: true, viewer: false },
  { action: 'Post comments to parties', admin: true, ops: true, viewer: false },
  { action: 'Edit own profile & preferences', admin: true, ops: true, viewer: true },
  { action: 'Manage users & organizations', admin: true, ops: false, viewer: false },
]

const MODULES = [
  {
    icon: LayoutDashboard,
    name: 'Dashboard (Control Tower)',
    text: 'KPIs across your visible shipments — active count, containers on the water, on-time performance, detention & demurrage exposure — plus delayed-shipment exceptions, upcoming arrivals and the latest confirmed milestones.',
  },
  {
    icon: Ship,
    name: 'Shipments',
    text: 'Search and filter every shipment your organization can see. Click a row for the full journey: milestone timeline (planned vs actual), containers, documents, parties and the collaboration thread.',
  },
  {
    icon: CalendarPlus,
    name: 'New Booking',
    text: 'Four steps: route & incoterm → containers & cargo → pick a sailing (price, transit time, CO₂ per option) → confirm. The booking is saved to the database — it stays after you reload, and other users of your org see it too.',
  },
  {
    icon: Map,
    name: 'Track & Trace',
    text: 'Live map of vessels currently sailing, drawn on trade-lane routes (Suez, Malacca, transpacific). Click a vessel or a list entry to highlight its route; colors show in-transit, transshipment and delayed.',
  },
  {
    icon: FileText,
    name: 'Documents',
    text: 'Registry of shipping instructions, B/Ls, VGM declarations, invoices and packing lists across shipments. Ops users can approve pending documents from the shipment page; approvals persist.',
  },
  {
    icon: BarChart3,
    name: 'Analytics',
    text: 'TEU volume by month, carrier allocation, on-time performance against a 90% target, and CO₂ by trade lane — computed live from the shipments your organization can see.',
  },
  {
    icon: Settings,
    name: 'Settings',
    text: 'Profile (name, title), preferences (timezone, date format, landing page, notification toggles) — all saved per user. Admins also manage users here: invite, change role or organization, deactivate.',
  },
]

const YesNo = ({ v }: { v: boolean }) =>
  v ? <Check size={15} className="mx-auto text-emerald-600" /> : <Minus size={15} className="mx-auto text-slate-300" />

export default function GuidePage() {
  const { status } = useAuth()
  const backTo = status === 'authed' ? '/' : '/login'
  const backLabel = status === 'authed' ? 'Back to the app' : 'Go to sign-in'

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-navy-900">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
              <Anchor size={20} />
            </span>
            <div>
              <div className="text-[15px] font-semibold tracking-wide text-white">Tidelane — User Guide</div>
              <div className="text-[10px] uppercase tracking-widest text-slate-400">Ocean freight OS · demo</div>
            </div>
          </div>
          <Link to={backTo} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-300 hover:text-white">
            <ArrowLeft size={15} />
            {backLabel}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        <Card>
          <CardHeader title="What is Tidelane?" />
          <div className="space-y-3 px-5 pb-5 text-[13px] leading-relaxed text-slate-600">
            <p>
              Tidelane is a demo of a container shipping management platform for large-volume shippers — the kind of
              system that connects exporters, importers, forwarders and ocean carriers in one place: booking
              operations, door-to-door tracking, document workflows, collaboration and reporting.
            </p>
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
              Everything here is simulated: the shipments, vessels, companies and carriers are fictional demo data
              stored in a real database (Cloudflare D1). Your changes — bookings, approvals, comments, settings —
              persist, but no real-world booking is ever made.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Demo accounts" subtitle="Password for every account: tidelane-demo" />
          <div className="overflow-x-auto px-5 pb-5">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="py-2.5 pr-3 font-medium">Email</th>
                  <th className="px-3 py-2.5 font-medium">Role</th>
                  <th className="px-3 py-2.5 font-medium">Organization</th>
                  <th className="px-3 py-2.5 font-medium">What they see</th>
                </tr>
              </thead>
              <tbody>
                {ACCOUNTS.map((a) => (
                  <tr key={a.email} className="border-b border-slate-50 align-top last:border-0">
                    <td className="py-2.5 pr-3 font-mono text-[12px] text-brand-600">{a.email}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-700">{a.role}</td>
                    <td className="px-3 py-2.5 text-slate-600">{a.org}</td>
                    <td className="px-3 py-2.5 text-slate-500">{a.sees}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-[12px] text-slate-500">
              Internal (Tidelane) users see the whole network. Partner users — shippers, forwarders, consignees,
              carriers — only see shipments where their company is a party, each from their own perspective.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Roles & permissions" />
          <div className="overflow-x-auto px-5 pb-5">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="py-2.5 pr-3 font-medium">Action</th>
                  <th className="px-3 py-2.5 text-center font-medium">Admin</th>
                  <th className="px-3 py-2.5 text-center font-medium">Operations</th>
                  <th className="px-3 py-2.5 text-center font-medium">Viewer</th>
                </tr>
              </thead>
              <tbody>
                {PERMISSIONS.map((p) => (
                  <tr key={p.action} className="border-b border-slate-50 last:border-0">
                    <td className="py-2.5 pr-3 text-slate-700">{p.action}</td>
                    <td className="px-3 py-2.5"><YesNo v={p.admin} /></td>
                    <td className="px-3 py-2.5"><YesNo v={p.ops} /></td>
                    <td className="px-3 py-2.5"><YesNo v={p.viewer} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Module walkthrough" />
          <div className="divide-y divide-slate-50">
            {MODULES.map(({ icon: Icon, name, text }) => (
              <div key={name} className="flex gap-4 px-5 py-4">
                <span className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <Icon size={17} />
                </span>
                <div>
                  <div className="text-[13px] font-semibold text-slate-800">{name}</div>
                  <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Suggested tour" subtitle="Five minutes, three logins" />
          <ol className="list-decimal space-y-2 px-10 pb-5 pt-1 text-[13px] leading-relaxed text-slate-600">
            <li>
              Sign in as <span className="font-mono text-[12px]">effi@tidelane.demo</span> — scan the Control Tower,
              open a delayed shipment, approve a pending document, post a comment, then create a booking end-to-end.
            </li>
            <li>
              Reload the page — your booking, approval and comment are still there. Open Settings → Users &
              Organizations to see the admin view.
            </li>
            <li>
              Log out and sign in as <span className="font-mono text-[12px]">dana@atlaspolymers.demo</span> — the
              shipment list shrinks to Atlas Polymers' cargo only, and the sidebar shows the partner view.
            </li>
            <li>
              Finally try <span className="font-mono text-[12px]">viewer@tidelane.demo</span> — booking, approvals and
              commenting disappear: read-only.
            </li>
          </ol>
        </Card>
      </main>
    </div>
  )
}
