import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, ArrowRight, Building2, Download, Send, ShieldCheck } from 'lucide-react'
import { useData } from '../context/DataContext'
import { Card, CardHeader } from '../components/ui/Card'
import Tabs from '../components/ui/Tabs'
import { DocStatusBadge, ShipmentStatusBadge } from '../components/ui/StatusBadge'
import MilestoneTimeline from '../components/shipments/MilestoneTimeline'
import { fmtDate, fmtDateShort } from '../data/random'
import { EmptyState } from '../components/ui/inputs'

export default function ShipmentDetailPage() {
  const { id } = useParams()
  const { getShipment, setDocumentStatus, addComment } = useData()
  const [tab, setTab] = useState('containers')
  const [draft, setDraft] = useState('')

  const s = id ? getShipment(id) : undefined
  if (!s) {
    return (
      <Card>
        <EmptyState title="Shipment not found" subtitle="It may have been removed from this demo dataset." />
      </Card>
    )
  }

  const facts: [string, string][] = [
    ['Carrier', `${s.carrier.name} (${s.carrier.scac})`],
    ['Vessel / Voyage', `${s.vessel.name} · ${s.vessel.voyage}`],
    ['ETD', fmtDate(s.etd)],
    ['ETA', fmtDate(s.eta)],
    ['Incoterm', s.incoterm],
    ['Commodity', s.commodity],
    ['Freight cost', `$${s.freightCostUsd.toLocaleString()}`],
    ['CO₂ estimate', `${s.co2Tons} t`],
  ]

  return (
    <div className="space-y-5">
      <Link to="/shipments" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 hover:text-slate-800">
        <ArrowLeft size={15} />
        All shipments
      </Link>

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-[19px] font-semibold text-slate-900">{s.bookingRef}</h2>
              <ShipmentStatusBadge status={s.status} />
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-[14px] text-slate-600">
              <span>
                {s.origin.flag} {s.origin.name} ({s.origin.code})
              </span>
              <ArrowRight size={14} className="text-slate-400" />
              {s.via && (
                <>
                  <span className="text-slate-400">
                    {s.via.name} ({s.via.code})
                  </span>
                  <ArrowRight size={14} className="text-slate-400" />
                </>
              )}
              <span>
                {s.destination.flag} {s.destination.name} ({s.destination.code})
              </span>
            </div>
          </div>
          {s.delayReason && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12px] text-red-700">
              <AlertTriangle size={15} className="mt-0.5 flex-none" />
              <div>
                <div className="font-semibold">Revised ETA — {fmtDateShort(s.eta)}</div>
                {s.delayReason}
              </div>
            </div>
          )}
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-slate-100 pt-4 sm:grid-cols-4">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] uppercase tracking-wide text-slate-400">{k}</dt>
              <dd className="mt-0.5 text-[13px] font-medium text-slate-800">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card>
        <CardHeader title="Journey" subtitle="Planned vs actual milestones" />
        <MilestoneTimeline milestones={s.milestones} />
      </Card>

      <Card>
        <div className="px-5 pt-2">
          <Tabs
            tabs={[
              { id: 'containers', label: 'Containers', count: s.containers.length },
              { id: 'documents', label: 'Documents', count: s.documents.length },
              { id: 'parties', label: 'Parties', count: s.parties.length },
              { id: 'activity', label: 'Activity', count: s.comments.length },
            ]}
            active={tab}
            onChange={setTab}
          />
        </div>

        {tab === 'containers' && (
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-5 py-2.5 font-medium">Container</th>
                <th className="px-3 py-2.5 font-medium">Type</th>
                <th className="px-3 py-2.5 font-medium">Seal</th>
                <th className="px-3 py-2.5 font-medium">Weight</th>
                <th className="px-3 py-2.5 font-medium">Load</th>
                <th className="px-5 py-2.5 font-medium">D&D risk</th>
              </tr>
            </thead>
            <tbody>
              {s.containers.map((c) => (
                <tr key={c.number} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-3 font-mono text-[12px] font-medium text-slate-800">{c.number}</td>
                  <td className="px-3 py-3 text-slate-600">{c.type}</td>
                  <td className="px-3 py-3 font-mono text-[12px] text-slate-500">{c.sealNumber}</td>
                  <td className="px-3 py-3 text-slate-600">{(c.weightKg / 1000).toFixed(1)} t</td>
                  <td className="px-3 py-3 text-slate-600">{c.status}</td>
                  <td className="px-5 py-3">
                    {c.ddRiskUsd > 0 ? (
                      <span className="font-medium text-amber-600">${c.ddRiskUsd.toLocaleString()}</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'documents' && (
          <div className="divide-y divide-slate-50">
            {s.documents.map((d) => (
              <div key={d.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <div className="text-[13px] font-medium text-slate-800">{d.name}</div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    {d.type} · uploaded by {d.uploadedBy} · {fmtDateShort(d.updatedAt)}
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <DocStatusBadge status={d.status} />
                  <button
                    className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition-colors hover:bg-slate-50"
                    title="Download (demo)"
                  >
                    <Download size={14} />
                  </button>
                  {d.status === 'pending_approval' && (
                    <button
                      onClick={() => setDocumentStatus(s.id, d.id, 'approved')}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-emerald-700"
                    >
                      <ShieldCheck size={13} />
                      Approve
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'parties' && (
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
            {s.parties.map((party) => (
              <div key={party.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <Building2 size={13} />
                  {party.role}
                </div>
                <div className="mt-2 text-[13px] font-semibold text-slate-800">{party.name}</div>
                <div className="mt-0.5 text-[12px] text-slate-500">{party.contact}</div>
              </div>
            ))}
          </div>
        )}

        {tab === 'activity' && (
          <div className="p-5">
            <div className="space-y-4">
              {[...s.comments]
                .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
                .map((c) => (
                  <div key={c.id} className="flex gap-3">
                    <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">
                      {c.author
                        .split(' ')
                        .map((w) => w[0])
                        .slice(0, 2)
                        .join('')}
                    </span>
                    <div>
                      <div className="text-[12px]">
                        <span className="font-semibold text-slate-800">{c.author}</span>
                        <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                          {c.role}
                        </span>
                        <span className="ml-2 text-slate-400">{fmtDateShort(c.at)}</span>
                      </div>
                      <div className="mt-1 rounded-lg rounded-tl-none bg-slate-50 px-3 py-2 text-[13px] text-slate-700">
                        {c.text}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
            <form
              className="mt-5 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (draft.trim()) {
                  addComment(s.id, 'Effi Mor', draft.trim())
                  setDraft('')
                }
              }}
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Write a message to all parties…"
                className="flex-1 rounded-lg border border-slate-200 px-3.5 py-2.5 text-[13px] focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-brand-700"
              >
                <Send size={14} />
                Send
              </button>
            </form>
          </div>
        )}
      </Card>
    </div>
  )
}
