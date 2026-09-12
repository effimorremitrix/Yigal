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
  Receipt,
  Settings,
  Ship,
  Wand2,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { roleLabel, type Vocabulary } from '../lib/vocabulary'
import { Card, CardHeader } from '../components/ui/Card'

// The partner organizations are labelled by the business model, not by the transport role stored
// against them, so this table and the one above cannot disagree about what a `shipper` is called.
const accounts = (v: Vocabulary) => [
  { email: 'yigal.tzfira@galco-intl.com', role: 'Admin', org: 'Tidelane (internal)', sees: 'Everything, plus user management, integrations (incl. QuickBooks), invoices, Deckhand and the business model' },
  { email: 'effi.mor@galco-intl.com', role: 'Operations', org: 'Tidelane (internal)', sees: 'All shipments, invoices and Deckhand; can book, approve documents, comment' },
  { email: 'ben.mor@galco-intl.com', role: 'Viewer', org: 'Tidelane (internal)', sees: 'All shipments, read-only' },
  { email: 'dana@atlaspolymers.demo', role: 'Operations', org: `Atlas Polymers (${roleLabel(v, 'shipper').toLowerCase()})`, sees: 'Only shipments where Atlas Polymers is a party' },
  { email: 'amit@globalfreight.demo', role: 'Operations', org: 'GlobalFreight Partners (forwarder)', sees: 'Only shipments they forward' },
  { email: 'pieter@northline.demo', role: 'Viewer', org: `Northline Imports (${roleLabel(v, 'consignee').toLowerCase()})`, sees: 'Their inbound shipments, read-only' },
  { email: 'desk@meridianline.demo', role: 'Operations', org: 'Meridian Line (carrier)', sees: 'Shipments carried by Meridian Line' },
]

const PERMISSIONS: { action: string; admin: boolean; ops: boolean; viewer: boolean }[] = [
  { action: 'View shipments, tracking, documents, analytics', admin: true, ops: true, viewer: true },
  { action: 'Create bookings', admin: true, ops: true, viewer: false },
  { action: 'Approve documents', admin: true, ops: true, viewer: false },
  { action: 'Post comments to parties', admin: true, ops: true, viewer: false },
  { action: 'Edit own profile & preferences', admin: true, ops: true, viewer: true },
  { action: 'Pull and view QuickBooks invoices (internal org only)', admin: true, ops: true, viewer: false },
  { action: 'Use Deckhand extraction (internal org only)', admin: true, ops: true, viewer: false },
  { action: 'Manage users & organizations', admin: true, ops: false, viewer: false },
  { action: 'Switch the business model (internal admin only)', admin: true, ops: false, viewer: false },
]

// Labels come from the business model rather than being written twice; `sees` is the access rule,
// which is the same sentence in both models except for counterparty isolation.
const orgScopes = (v: Vocabulary) => [
  { type: 'internal', label: 'Tidelane', sees: 'Every shipment in the network' },
  {
    type: 'shipper',
    label: roleLabel(v, 'shipper'),
    sees: v.showsCommission
      ? 'Only shipments they are a party to, and not the other commercial counterparties on them'
      : 'Only shipments they are a party to',
  },
  { type: 'forwarder', label: roleLabel(v, 'forwarder'), sees: 'Only the shipments they forward' },
  {
    type: 'consignee',
    label: roleLabel(v, 'consignee'),
    sees: v.showsCommission
      ? 'Only their inbound shipments, and not who the goods were bought from'
      : 'Only their inbound shipments',
  },
  { type: 'carrier', label: roleLabel(v, 'carrier'), sees: 'Only the shipments they carry' },
]

const modules = (v: Vocabulary) => [
  {
    icon: LayoutDashboard,
    name: 'Dashboard (Control Tower)',
    text: 'KPIs across your visible shipments — active count, containers on the water, on-time performance, detention & demurrage exposure — plus delayed-shipment exceptions, upcoming arrivals and the latest confirmed milestones. Rule of thumb for a working day: start from the exceptions, not from the full shipment list.',
  },
  {
    icon: Ship,
    name: 'Shipments',
    text: `Search and filter every shipment your organization can see. Click a row for the full journey: a route map of the ports the vessel is due to call at — click one for its country, its role in the route (load, transship, discharge), its ETA or ETD, the days remaining, and the milestones that happen there — plus the milestone timeline (planned vs actual), containers with seal numbers and D&D exposure, documents, parties and the collaboration thread.${
      v.showsCommission
        ? ' The facts panel also carries the money: deal value, commission rate, your commission and what the producer receives.'
        : ' The facts panel carries the freight cost for the shipment.'
    }`,
  },
  {
    icon: CalendarPlus,
    name: 'New Booking',
    text: `Four steps: route & incoterm → containers & cargo${
      v.showsCommission ? ' (and the deal value, if the price is agreed)' : ''
    } → pick a sailing (price, transit time, CO₂ per option) → confirm. Like booking a flight, but for a container. The booking is saved to the database with a TL-2026-#### reference — it stays after you reload, and other users of your org see it too.`,
  },
  {
    icon: Map,
    name: 'Track & Trace',
    text: 'Live map of vessels currently sailing, drawn on trade-lane routes (Suez, Malacca, transpacific). Click a vessel or a list entry to highlight its route; colors show in-transit, transshipment and delayed.',
  },
  {
    icon: FileText,
    name: 'Documents',
    text: 'Registry of shipping instructions, B/Ls, VGM declarations, commercial invoices and packing lists across shipments. Ops and admin users approve pending documents from the shipment page; approvals persist. Viewers see the document but cannot approve it.',
  },
  {
    icon: Receipt,
    name: 'Invoices',
    text: `Customer invoices pulled from QuickBooks Online, each linked to the shipment it bills by the TL-2026-#### reference found in the doc number, memo or line items. ${
      v.showsCommission
        ? 'The customer is the importer and the invoice is the deal value; your commission is not on it, because it comes out of the producer\u2019s side and is not the importer\u2019s business. '
        : 'The customer is the shipper and the invoice is the freight. '
    }Status (open, overdue, paid, void) is derived at read time. Re-pulling updates existing invoices instead of duplicating them. Internal admin/ops only; partner organizations never see finance data.`,
  },
  {
    icon: Wand2,
    name: 'Deckhand',
    text: 'Paste an arrival notice or booking confirmation, or attach the PDF or photo, and read back the identifiers you would otherwise retype: booking ref, containers, seals, vessel/voyage, ports. See the section below — it is the one module that exists to remove typing rather than to add a screen.',
  },
  {
    icon: BarChart3,
    name: 'Analytics',
    text: `TEU volume by month, carrier allocation, on-time performance against a 90% target, and CO₂ by trade lane — computed live from the shipments your organization can see. The headline tiles follow the business model: ${
      v.showsCommission
        ? 'deal value invoiced, commission earned, and the effective rate across the whole book, which moves if any shipment carries its own rate'
        : 'freight spend and average cost per TEU'
    }.`,
  },
  {
    icon: Settings,
    name: 'Settings',
    text: 'Profile (name, title), preferences (timezone, date format, landing page, notification toggles) — all saved per user. Admins also manage users here (invite, change role or organization, deactivate) and the external connectors: CBP ACE customs, E2open INTTRA and Intuit QuickBooks, each with mock/live mode, encrypted credentials and a connection test. An internal admin additionally gets Business model, which is the one setting that changes what every other screen means.',
  },
]

const MILESTONES = [
  { key: 'booking_confirmed', label: 'Booking confirmed' },
  { key: 'container_gate_in', label: 'Container gate-in' },
  { key: 'loaded_on_vessel', label: 'Loaded on vessel' },
  { key: 'vessel_departed', label: 'Vessel departed' },
  { key: 'transshipment', label: 'Transshipment' },
  { key: 'vessel_arrived', label: 'Vessel arrived' },
  { key: 'gate_out', label: 'Gate-out' },
  { key: 'delivered', label: 'Delivered' },
]

const SHIPMENT_STATUSES = [
  'booking_confirmed',
  'awaiting_departure',
  'in_transit',
  'transshipment',
  'arrived',
  'delivered',
  'delayed',
]

const DOC_TYPES = [
  { code: 'SI', name: 'Shipping instructions' },
  { code: 'BL', name: 'Bill of lading' },
  { code: 'VGM', name: 'Verified gross mass declaration' },
  { code: 'COMMERCIAL_INVOICE', name: 'Commercial invoice' },
  { code: 'PACKING_LIST', name: 'Packing list' },
]

const INTEGRATIONS = [
  {
    name: 'Intuit QuickBooks',
    use: 'Pulls customer invoices into the ledger and matches them to shipments',
    state: 'Can go live',
    live: true,
  },
  { name: 'CBP ACE', use: 'US customs: ISF 10+2, entry and release status per shipment', state: 'Mock only', live: false },
  { name: 'E2open INTTRA', use: 'Sailing schedules for the booking wizard', state: 'Mock only', live: false },
]

const SCENARIOS = [
  { need: 'A shipment is running late', path: 'Dashboard → Exceptions → open the shipment → find where the milestone timeline stalled → comment to the carrier' },
  { need: 'A customer asks where their cargo is', path: 'Track & Trace → find the vessel, or Shipments → search the booking reference' },
  { need: 'A document is stuck', path: 'Documents → filter pending_approval → approve from the shipment page' },
  { need: 'How much is open against a customer', path: 'Invoices → filter open and overdue' },
  { need: 'What am I earning on this shipment', path: 'Shipments → open it → the facts panel: deal value, commission, and what the producer receives' },
  { need: 'The commission on one deal is not the house rate', path: 'The shipment carries its own rate. There is no screen for it yet; it is a column on the shipment' },
  { need: 'A partner says they cannot see a shipment', path: 'Settings → Users → confirm their organization is actually a party on that shipment' },
  { need: 'An email arrived with containers and seals to retype', path: 'Deckhand → paste it → check it against the email → copy the block, paste the table into the portal grid, or download the .csv' },
]

const YesNo = ({ v }: { v: boolean }) =>
  v ? <Check size={15} className="mx-auto text-emerald-600" /> : <Minus size={15} className="mx-auto text-slate-300" />

const Code = ({ children }: { children: string }) => (
  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">{children}</span>
)

export default function GuidePage() {
  // Read before login too, where there is no business profile yet; the vocabulary then falls back
  // to the default model, which is what a fresh deployment actually runs.
  const { status, vocabulary } = useAuth()
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
              Tidelane is a demo of a container shipping management platform for {vocabulary.audience} — the kind of
              system that connects producers, importers, forwarders and ocean carriers in one place: booking
              operations, door-to-door tracking, document workflows, collaboration and reporting.
            </p>
            <p>
              The analogy: think of it as a <strong className="font-semibold text-slate-700">port control tower</strong>.
              Everyone in the chain looks at the same screen instead of at a mail thread between four companies.
            </p>
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
              Everything here is simulated: the shipments, vessels, companies and carriers are fictional demo data
              stored in a real database (Cloudflare D1). Your changes — bookings, approvals, comments, settings —
              persist, but no real-world booking is ever made.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="How the work flows" subtitle="Sign-in to invoice, in one line" />
          <div className="space-y-4 px-5 pb-5 pt-4">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-[12px] font-medium text-slate-600">
              {['Sign in', 'New booking', 'Track the shipment', 'Documents & approvals', 'Collaborate', 'Invoice & collect', 'Analyze'].map(
                (step, i, all) => (
                  <span key={step} className="flex items-center gap-2">
                    <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">{step}</span>
                    {i < all.length - 1 && <span className="text-slate-300">→</span>}
                  </span>
                ),
              )}
            </div>
            <p className="text-[13px] leading-relaxed text-slate-600">
              Deckhand sits before all of it. It is the step where identifiers arrive by email and have to get into a
              form — the one job the rest of the platform does not do for you.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Who you are in the system" subtitle="Two axes decide what you see and what you may do" />
          <div className="space-y-4 px-5 pb-5 pt-4 text-[13px] leading-relaxed text-slate-600">
            <p>
              <strong className="font-semibold text-slate-700">Your role is the key; your organization is the floor of
              the building.</strong>{' '}
              An admin at a partner company still cannot see a shipment they are not a party to, and an internal viewer
              still cannot approve a document.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="py-2.5 pr-3 font-medium">Organization type</th>
                    <th className="px-3 py-2.5 font-medium">Who they are</th>
                    <th className="px-3 py-2.5 font-medium">What they see</th>
                  </tr>
                </thead>
                <tbody>
                  {orgScopes(vocabulary).map((o) => (
                    <tr key={o.type} className="border-b border-slate-50 last:border-0">
                      <td className="py-2.5 pr-3"><Code>{o.type}</Code></td>
                      <td className="px-3 py-2.5 text-slate-700">{o.label}</td>
                      <td className="px-3 py-2.5 text-slate-500">{o.sees}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
              Access is enforced in the API, not only in the screen. Reaching a shipment by typing its URL directly is
              blocked the same way the sidebar blocks it.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="The money on a shipment"
            subtitle={
              vocabulary.showsCommission
                ? 'One price, and the commission that comes out of it'
                : 'Freight cost per shipment'
            }
          />
          <div className="space-y-4 px-5 pb-5 pt-4 text-[13px] leading-relaxed text-slate-600">
            {vocabulary.showsCommission ? (
              <>
                <p>
                  A trader buys from a producer and sells to an importer, and is paid a commission out of the
                  producer&rsquo;s side. There is{' '}
                  <strong className="font-semibold text-slate-700">one price, not two.</strong>
                </p>
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <table className="w-full text-left text-[13px]">
                    <tbody>
                      <tr>
                        <td className="py-1.5 pr-4 text-slate-500">Deal value</td>
                        <td className="py-1.5 font-medium text-slate-800">
                          goods + freight + insurance + duty. What the importer is invoiced
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1.5 pr-4 text-slate-500">Commission</td>
                        <td className="py-1.5 font-medium text-slate-800">deal value × rate. What you keep</td>
                      </tr>
                      <tr>
                        <td className="py-1.5 pr-4 text-slate-500">Producer receives</td>
                        <td className="py-1.5 font-medium text-slate-800">deal value − commission</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p>
                  <strong className="font-semibold text-slate-700">The fee comes out of the producer&rsquo;s side, not
                  on top of the buyer&rsquo;s.</strong>{' '}
                  The importer pays the headline price either way, so your being in the deal does not make the goods
                  more expensive. It works like a travel agent paid out of the hotel&rsquo;s rate: the traveller pays
                  the rack rate, the agent keeps a slice, the hotel nets less.
                </p>
                <p>
                  Only the deal value and the rate are stored. The commission and the producer&rsquo;s share are
                  worked out each time the shipment is read, so changing a rate moves both together and they can never
                  disagree. <Code>producer receives + commission = deal value</Code> always holds.
                </p>
                <ul className="list-disc space-y-1.5 pl-5">
                  <li>
                    The house rate is set once in Settings → Business model. A single shipment may carry its own rate,
                    which then wins for that shipment only.
                  </li>
                  <li>
                    A shipment with no agreed price reads as <em>not set</em>, never as zero, and is never guessed from
                    the freight cost. The deal value is optional in the booking wizard for exactly that reason.
                  </li>
                  <li>
                    Your commission never appears on the invoice. That document is addressed to the importer, and what
                    you kept out of the producer&rsquo;s side is not his business.
                  </li>
                </ul>
              </>
            ) : (
              <p>
                In the freight operator model a shipment carries its freight cost and nothing else. There is no deal
                value and no commission, because the internal organization is moving other people&rsquo;s cargo for a
                fee rather than trading on its own account.
              </p>
            )}

            <p className="border-t border-slate-100 pt-4">
              <strong className="font-semibold text-slate-700">Which model is running is a setting.</strong> An
              internal admin picks it in Settings → Business model, and it is not a personal preference: it applies to
              the whole workspace and every screen follows it.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="py-2.5 pr-3 font-medium"></th>
                    <th className="px-3 py-2.5 font-medium">Trader</th>
                    <th className="px-3 py-2.5 font-medium">Freight operator</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-50">
                    <td className="py-2.5 pr-3 text-slate-500">Counterparties are called</td>
                    <td className="px-3 py-2.5 text-slate-700">Producer, Importer</td>
                    <td className="px-3 py-2.5 text-slate-700">Exporter, Consignee</td>
                  </tr>
                  <tr className="border-b border-slate-50">
                    <td className="py-2.5 pr-3 text-slate-500">A shipment shows</td>
                    <td className="px-3 py-2.5 text-slate-700">Deal value, commission, producer&rsquo;s share</td>
                    <td className="px-3 py-2.5 text-slate-700">Freight cost</td>
                  </tr>
                  <tr className="border-b border-slate-50">
                    <td className="py-2.5 pr-3 text-slate-500">The invoice bills</td>
                    <td className="px-3 py-2.5 text-slate-700">The importer, for the deal value</td>
                    <td className="px-3 py-2.5 text-slate-700">The shipper, for the freight</td>
                  </tr>
                  <tr className="last:border-0">
                    <td className="py-2.5 pr-3 text-slate-500">Counterparty isolation</td>
                    <td className="px-3 py-2.5 font-medium text-emerald-700">On</td>
                    <td className="px-3 py-2.5 font-medium text-amber-700">Off</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              <strong className="font-semibold">That last row is the reason this setting is admin-only.</strong>{' '}
              Switching to the freight operator model turns counterparty isolation off, so every partner company on a
              shipment sees the full party list again. That is right for an operator, whose exporter and consignee are
              on the same bill of lading and already know each other. It is wrong for a trader with real supplier and
              customer data loaded.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Accounts" subtitle="Password for every account: tidelane-demo" />
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
                {accounts(vocabulary).map((a) => (
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
              Internal users see the whole network. Partner users — shippers, forwarders, consignees, carriers — only
              see shipments where their company is a party, each from their own perspective.
            </p>
            <p className="mt-2 text-[12px] text-slate-500">
              {vocabulary.showsCommission
                ? 'On top of that, a partner sees their own company and the service providers on a shipment, never another company in a commercial role. A trader buys from a producer and sells to an importer, and both are parties to the same shipment; showing either one the other is how a trader gets cut out of his own deal. The rule covers comment authors and document uploaders too, but it cannot filter the text of a comment.'
                : 'In the freight operator model there is no counterparty isolation: an exporter and a consignee on one bill of lading already know each other, so every partner company on a shipment sees the full party list.'}
            </p>
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              All seven accounts share one password while this is a demo. That has to end before any real shipment data
              is loaded: real accounts, individual passwords, and this page closed to the public.
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
            {modules(vocabulary).map(({ icon: Icon, name, text }) => (
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
          <CardHeader title="Deckhand" subtitle="Stop retyping shipment and seal numbers out of email" />
          <div className="space-y-4 px-5 pb-5 pt-4 text-[13px] leading-relaxed text-slate-600">
            <p>
              A deckhand is the junior crew member who handles the routine deck work so the officers can navigate. That
              is the whole design intent: <strong className="font-semibold text-slate-700">Deckhand does the copying,
              you keep the judgment.</strong>
            </p>
            <div>
              <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">How to use it</div>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5">
                <li>Paste the email body into the box, or attach the arrival notice, booking confirmation, B/L or container list as a PDF, JPEG or PNG (5 MB cap).</li>
                <li>Press <strong className="font-semibold text-slate-700">Extract</strong>.</li>
                <li>Read the paste-ready block against the source email. This step is the product, not an inconvenience.</li>
                <li>
                  Pick an <strong className="font-semibold text-slate-700">Output</strong> shape:{' '}
                  <strong className="font-semibold text-slate-700">Block</strong> to read and copy whole,{' '}
                  <strong className="font-semibold text-slate-700">Table</strong> for a two-column paste straight into a
                  portal grid, or <strong className="font-semibold text-slate-700">File</strong> for a .csv of the same
                  two columns. Individual fields still have their own copy buttons.
                </li>
                <li>Paste or upload it into INTTRA or wherever it has to go.</li>
              </ol>
            </div>
            <div>
              <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">What it returns</div>
              <p className="mt-2">
                Booking / shipment ref, container numbers, seal numbers aligned to the container they were shown beside,
                vessel and voyage, ports (POL → POD), and an explicit list of anything it would not commit to.
              </p>
            </div>
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-[12px]">
              <div className="font-semibold text-slate-700">The rules it works under</div>
              <ul className="list-disc space-y-1.5 pl-4 text-slate-600">
                <li>
                  <strong className="font-medium text-slate-700">It never guesses a pairing.</strong> A container and a
                  seal are paired only when the document physically showed them together — same table row, same line, or
                  same labelled block — and it tells you which. Anything else is listed as{' '}
                  <em>not paired</em>, with a warning. A seal on the wrong container is worse than no output at all.
                </li>
                <li>
                  <strong className="font-medium text-slate-700">Missing is a value.</strong> A field it could not find
                  is printed as missing, never quietly dropped.
                </li>
                <li>
                  <strong className="font-medium text-slate-700">Confidence is per field</strong>, not one overall
                  score. Anything short of certain is labelled.
                </li>
                <li>
                  <strong className="font-medium text-slate-700">Container numbers are checked against ISO 6346.</strong>{' '}
                  A failed check digit is flagged loudly and never silently corrected. Seal numbers have no standard
                  format and no check digit, so nothing about them can be verified, and the page says so.
                </li>
                <li>
                  <strong className="font-medium text-slate-700">Nothing is stored.</strong> Deckhand reads the
                  document, returns the block, and forgets it — it neither reads from nor writes to the database.
                </li>
                <li>
                  <strong className="font-medium text-slate-700">No portal credentials, ever.</strong> Deckhand does not
                  log into INTTRA, ACE or Login.gov, and never will. It hands you text; you drive the portal.
                </li>
              </ul>
            </div>
            <p className="text-[12px] text-slate-500">
              Available to admin and operations users of the internal organization. If the deployment has no extraction
              key configured, Deckhand falls back to a deterministic text-only reader and PDFs and photos will tell you
              to paste the text instead.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Shipment lifecycle" subtitle="Eight milestones, planned vs actual" />
          <div className="space-y-4 px-5 pb-5 pt-4">
            <ol className="space-y-1.5">
              {MILESTONES.map((m, i) => (
                <li key={m.key} className="flex items-center gap-3 text-[13px]">
                  <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-brand-50 text-[10px] font-semibold text-brand-600">
                    {i + 1}
                  </span>
                  <span className="font-medium text-slate-700">{m.label}</span>
                  <Code>{m.key}</Code>
                </li>
              ))}
            </ol>
            <div className="text-[13px] text-slate-600">
              <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">Shipment statuses</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {SHIPMENT_STATUSES.map((s) => (
                  <Code key={s}>{s}</Code>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Documents & approvals" />
          <div className="space-y-4 px-5 pb-5 pt-4 text-[13px] text-slate-600">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="py-2.5 pr-3 font-medium">Type</th>
                    <th className="px-3 py-2.5 font-medium">What it is</th>
                  </tr>
                </thead>
                <tbody>
                  {DOC_TYPES.map((d) => (
                    <tr key={d.code} className="border-b border-slate-50 last:border-0">
                      <td className="py-2.5 pr-3"><Code>{d.code}</Code></td>
                      <td className="px-3 py-2.5 text-slate-600">{d.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">States</span>
              <Code>draft</Code>
              <span className="text-slate-300">→</span>
              <Code>pending_approval</Code>
              <span className="text-slate-300">→</span>
              <Code>approved</Code>
            </div>
            <p className="leading-relaxed">
              A document waiting for approval is flagged on the shipment page. An ops or admin user approves it there,
              and the approval is written to the database and survives a reload. Viewers see the document but have no
              approve button.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Integrations" subtitle="Admins configure these in Settings → Integrations" />
          <div className="space-y-4 px-5 pb-5 pt-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="py-2.5 pr-3 font-medium">Connector</th>
                    <th className="px-3 py-2.5 font-medium">What it is for</th>
                    <th className="px-3 py-2.5 font-medium">Status today</th>
                  </tr>
                </thead>
                <tbody>
                  {INTEGRATIONS.map((c) => (
                    <tr key={c.name} className="border-b border-slate-50 align-top last:border-0">
                      <td className="py-2.5 pr-3 font-medium text-slate-700">{c.name}</td>
                      <td className="px-3 py-2.5 text-slate-600">{c.use}</td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                            c.live
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border-slate-200 bg-slate-50 text-slate-600'
                          }`}
                        >
                          {c.state}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[13px] leading-relaxed text-slate-600">
              ACE and INTTRA stay in Mock because real access is a vendor agreement, not code. Their live payload
              mappers deliberately refuse to run, so nothing can silently pretend to be connected.
            </p>
            <p className="text-[13px] leading-relaxed text-slate-600">
              Each connector has an on/off switch, a <strong className="font-semibold text-slate-700">Mock</strong> or{' '}
              <strong className="font-semibold text-slate-700">Live</strong> mode, credential fields and a{' '}
              <strong className="font-semibold text-slate-700">Test connection</strong> button. Credentials are
              encrypted before they are stored and are never returned by the API — only whether one is present, where it
              came from, and its last four characters. A disabled connector makes its own endpoints return 503; the rest
              of the app is unaffected.
            </p>
            <p className="text-[13px] leading-relaxed text-slate-600">
              QuickBooks can be connected two ways: sign in with Intuit (save the base URL, client ID and client secret,
              register the callback URL shown on the card, then press Connect), or paste a realm ID and refresh token
              obtained from Intuit's OAuth playground. Then switch to Live, press Test connection, and pull invoices
              from the Invoices page.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Common scenarios" subtitle="What to do, and where" />
          <div className="overflow-x-auto px-5 pb-5">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="py-2.5 pr-3 font-medium">Situation</th>
                  <th className="px-3 py-2.5 font-medium">Path</th>
                </tr>
              </thead>
              <tbody>
                {SCENARIOS.map((s) => (
                  <tr key={s.need} className="border-b border-slate-50 align-top last:border-0">
                    <td className="py-2.5 pr-3 font-medium text-slate-700">{s.need}</td>
                    <td className="px-3 py-2.5 text-slate-500">{s.path}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Suggested tour" subtitle="Ten minutes, three logins" />
          <ol className="list-decimal space-y-2 px-10 pb-5 pt-1 text-[13px] leading-relaxed text-slate-600">
            <li>
              Sign in as <span className="font-mono text-[12px]">yigal.tzfira@galco-intl.com</span> — scan the Control
              Tower, open a delayed shipment, approve a pending document, post a comment, then create a booking end-to-end.
            </li>
            <li>
              Open <span className="font-mono text-[12px]">Deckhand</span> and paste a real arrival-notice email. Read
              the block against the email: check the container check-digit flags, and check that every seal sits beside
              the container it actually belonged to.
            </li>
            <li>
              Reload the page — your booking, approval and comment are still there. Open Settings → Users &
              Organizations to see the admin view.
            </li>
            <li>
              Log out and sign in as <span className="font-mono text-[12px]">dana@atlaspolymers.demo</span> — the
              shipment list shrinks to Atlas Polymers' cargo only, Invoices and Deckhand disappear from the sidebar, and
              the partner view takes over.
            </li>
            <li>
              Finally try <span className="font-mono text-[12px]">ben.mor@galco-intl.com</span> — booking, approvals and
              commenting disappear: read-only.
            </li>
          </ol>
        </Card>
      </main>
    </div>
  )
}
