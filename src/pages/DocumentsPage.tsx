import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileCheck2, FileClock, FileText } from 'lucide-react'
import { useData } from '../context/DataContext'
import { Card } from '../components/ui/Card'
import { DocStatusBadge } from '../components/ui/StatusBadge'
import { SearchInput, Select, EmptyState } from '../components/ui/inputs'
import { fmtDateShort } from '../data/random'

const TYPE_LABELS: Record<string, string> = {
  SI: 'Shipping Instructions',
  BL: 'Bill of Lading',
  VGM: 'VGM Declaration',
  COMMERCIAL_INVOICE: 'Commercial Invoice',
  PACKING_LIST: 'Packing List',
}

export default function DocumentsPage() {
  const { shipments } = useData()
  const [q, setQ] = useState('')
  const [type, setType] = useState('all')
  const [status, setStatus] = useState('all')

  const rows = useMemo(
    () =>
      shipments.flatMap((s) => s.documents.map((d) => ({ shipment: s, doc: d }))).filter(({ shipment, doc }) => {
        if (type !== 'all' && doc.type !== type) return false
        if (status !== 'all' && doc.status !== status) return false
        const needle = q.trim().toLowerCase()
        if (!needle) return true
        return `${doc.name} ${shipment.bookingRef} ${doc.uploadedBy}`.toLowerCase().includes(needle)
      }),
    [shipments, q, type, status],
  )

  const all = shipments.flatMap((s) => s.documents)
  const pending = all.filter((d) => d.status === 'pending_approval').length
  const approved = all.filter((d) => d.status === 'approved').length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: 'Total documents', value: all.length, icon: FileText, cls: 'text-brand-600 bg-brand-50' },
          { label: 'Pending approval', value: pending, icon: FileClock, cls: 'text-amber-600 bg-amber-50' },
          { label: 'Approved', value: approved, icon: FileCheck2, cls: 'text-emerald-600 bg-emerald-50' },
        ].map(({ label, value, icon: Icon, cls }) => (
          <Card key={label} className="flex items-center gap-3.5 p-4">
            <span className={`rounded-lg p-2.5 ${cls}`}>
              <Icon size={18} />
            </span>
            <div>
              <div className="text-[20px] font-semibold leading-none text-slate-900">{value}</div>
              <div className="mt-1 text-[12px] text-slate-500">{label}</div>
            </div>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Search document, ref, owner…" />
        <Select
          label="Type"
          value={type}
          onChange={setType}
          options={[
            { value: 'all', label: 'All types' },
            ...Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label })),
          ]}
        />
        <Select
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: 'All statuses' },
            { value: 'draft', label: 'Draft' },
            { value: 'pending_approval', label: 'Pending approval' },
            { value: 'approved', label: 'Approved' },
          ]}
        />
        <span className="ml-1 text-[12px] text-slate-400">{rows.length} documents</span>
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No documents match your filters" />
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3 font-medium">Document</th>
                <th className="px-3 py-3 font-medium">Shipment</th>
                <th className="px-3 py-3 font-medium">Route</th>
                <th className="px-3 py-3 font-medium">Uploaded by</th>
                <th className="px-3 py-3 font-medium">Updated</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 60).map(({ shipment, doc }) => (
                <tr key={doc.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-3">
                    <div className="font-medium text-slate-800">{doc.name}</div>
                    <div className="text-[11px] text-slate-400">{doc.type}</div>
                  </td>
                  <td className="px-3 py-3">
                    <Link to={`/shipments/${shipment.id}`} className="font-medium text-brand-600 hover:underline">
                      {shipment.bookingRef}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    {shipment.origin.code} → {shipment.destination.code}
                  </td>
                  <td className="px-3 py-3 text-slate-600">{doc.uploadedBy}</td>
                  <td className="px-3 py-3 text-slate-600">{fmtDateShort(doc.updatedAt)}</td>
                  <td className="px-5 py-3">
                    <DocStatusBadge status={doc.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
