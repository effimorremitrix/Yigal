import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CircleDollarSign, FileCheck2, Receipt, RefreshCw } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { ApiError, apiFetch } from '../lib/api'
import { Card } from '../components/ui/Card'
import { InvoiceStatusBadge } from '../components/ui/StatusBadge'
import { EmptyState, SearchInput, Select } from '../components/ui/inputs'
import { fmtDateShort } from '../data/random'
import type { InvoiceListResult, InvoiceStatus, InvoiceSync } from '../types'

const money = (n: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)

const fmtWhen = (isoStr: string) =>
  new Date(isoStr).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

const syncLine = (s: InvoiceSync | null): string => {
  if (!s) return 'Never pulled'
  if (!s.ok) return `Last pull failed ${fmtWhen(s.at)} · ${s.message}`
  return `Last pull ${fmtWhen(s.at)} · ${s.count ?? 0} invoices · ${s.mode}`
}

export default function InvoicesPage() {
  const { isAdmin } = useAuth()
  const [data, setData] = useState<InvoiceListResult | null>(null)
  const [error, setError] = useState('')
  const [forbidden, setForbidden] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [customer, setCustomer] = useState('all')

  const load = useCallback(async () => {
    try {
      setData(await apiFetch<InvoiceListResult>('/api/invoices'))
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setForbidden(true)
      else setError(err instanceof Error ? err.message : 'Failed to load invoices')
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  async function sync() {
    setError('')
    setSyncing(true)
    try {
      await apiFetch<InvoiceSync>('/api/integrations/quickbooks/invoices/sync', { method: 'POST' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pull failed')
    } finally {
      setSyncing(false)
    }
  }

  const invoices = useMemo(() => data?.invoices ?? [], [data])
  const customers = useMemo(() => [...new Set(invoices.map((i) => i.customerName))].sort(), [invoices])
  const rows = useMemo(
    () =>
      invoices.filter((inv) => {
        if (status !== 'all' && inv.status !== status) return false
        if (customer !== 'all' && inv.customerName !== customer) return false
        const needle = q.trim().toLowerCase()
        if (!needle) return true
        return `${inv.docNumber ?? ''} ${inv.customerName} ${inv.bookingRef ?? ''} ${inv.memo ?? ''}`.toLowerCase().includes(needle)
      }),
    [invoices, q, status, customer],
  )

  const receivable = invoices.filter((i) => i.status === 'open' || i.status === 'overdue')
  const overdue = invoices.filter((i) => i.status === 'overdue')
  const paid = invoices.filter((i) => i.status === 'paid')
  const sum = (list: { balance: number }[]) => list.reduce((n, i) => n + i.balance, 0)

  if (forbidden) {
    return (
      <Card>
        <EmptyState title="Invoices are available to Tidelane operations users" subtitle="Finance data is not shared with partner organizations." />
      </Card>
    )
  }

  const kpis: { id: string; label: string; value: string; sub: string; icon: typeof Receipt; cls: string }[] = [
    { id: 'open', label: 'Open receivables', value: money(sum(receivable)), sub: `${receivable.length} invoices`, icon: CircleDollarSign, cls: 'text-brand-600 bg-brand-50' },
    { id: 'overdue', label: 'Overdue', value: money(sum(overdue)), sub: `${overdue.length} invoices`, icon: AlertTriangle, cls: 'text-red-600 bg-red-50' },
    { id: 'paid', label: 'Paid', value: String(paid.length), sub: 'invoices settled', icon: FileCheck2, cls: 'text-emerald-600 bg-emerald-50' },
    { id: 'count', label: 'Total invoices', value: String(invoices.length), sub: data?.source ? `source · ${data.source}` : 'connector off', icon: Receipt, cls: 'text-slate-600 bg-slate-100' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[12px] text-slate-500" data-testid="invoices-last-sync">
          {data ? syncLine(data.lastSync) : 'Loading…'}
        </div>
        <button
          type="button"
          onClick={() => void sync()}
          disabled={syncing || !data}
          data-testid="invoices-sync"
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-[12px] font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Pulling…' : 'Pull from QuickBooks'}
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</div>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(({ id, label, value, sub, icon: Icon, cls }) => (
          <Card key={id} className="flex items-center gap-3.5 p-4">
            <span className={`rounded-lg p-2.5 ${cls}`}>
              <Icon size={18} />
            </span>
            <div>
              <div className="text-[20px] font-semibold leading-none text-slate-900" data-testid={`invoices-kpi-${id}`}>
                {value}
              </div>
              <div className="mt-1 text-[12px] text-slate-500">
                {label} · {sub}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Search invoice, customer, booking…" />
        <Select
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: 'All statuses' },
            ...(['open', 'overdue', 'paid', 'void'] as InvoiceStatus[]).map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })),
          ]}
        />
        <Select
          label="Customer"
          value={customer}
          onChange={setCustomer}
          options={[{ value: 'all', label: 'All customers' }, ...customers.map((c) => ({ value: c, label: c }))]}
        />
        <span className="ml-1 text-[12px] text-slate-400">{rows.length} invoices</span>
      </div>

      <Card>
        {!data ? (
          <div className="p-5 text-[12px] text-slate-400">Loading invoices…</div>
        ) : invoices.length === 0 ? (
          <EmptyState
            title="No invoices yet"
            subtitle={
              data.source
                ? 'Press "Pull from QuickBooks" to load the ledger.'
                : 'The QuickBooks connector is switched off. An admin can enable it in Settings > Integrations.'
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState title="No invoices match your filters" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-medium">Invoice</th>
                  <th className="px-3 py-3 font-medium">Customer</th>
                  <th className="px-3 py-3 font-medium">Shipment</th>
                  <th className="px-3 py-3 font-medium">Issued</th>
                  <th className="px-3 py-3 font-medium">Due</th>
                  <th className="px-3 py-3 text-right font-medium">Total</th>
                  <th className="px-3 py-3 text-right font-medium">Balance</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 200).map((inv) => (
                  <tr key={inv.id} className="border-b border-slate-50 last:border-0" data-testid="invoice-row">
                    <td className="px-5 py-3">
                      <div className="font-medium text-slate-800">{inv.docNumber ?? inv.externalId}</div>
                      <div className="max-w-[260px] truncate text-[11px] text-slate-400" title={inv.memo ?? undefined}>
                        {inv.memo ?? '—'}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{inv.customerName}</td>
                    <td className="px-3 py-3">
                      {inv.shipmentId ? (
                        <Link to={`/shipments/${inv.shipmentId}`} className="font-medium text-brand-600 hover:underline">
                          {inv.bookingRef}
                        </Link>
                      ) : (
                        <span className="text-slate-400">{inv.bookingRef ?? '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-slate-600">{fmtDateShort(inv.txnDate)}</td>
                    <td className="px-3 py-3 text-slate-600">{inv.dueDate ? fmtDateShort(inv.dueDate) : '—'}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-700">{money(inv.totalAmount, inv.currency)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-700">{money(inv.balance, inv.currency)}</td>
                    <td className="px-5 py-3">
                      <InvoiceStatusBadge status={inv.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {isAdmin && (
        <p className="text-[12px] text-slate-400">
          Connect or switch the QuickBooks connector between mock and live in{' '}
          <Link to="/settings?tab=integrations" className="text-brand-600 hover:underline">
            Settings › Integrations
          </Link>
          .
        </p>
      )}
    </div>
  )
}
