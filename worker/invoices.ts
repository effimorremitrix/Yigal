import type { IntegrationMode, Invoice, InvoiceListResult, InvoiceStatus, InvoiceSync, VendorInvoice } from '../src/types'
import { json, type Env, type SessionUser } from './env'
import { saveSync, toSync } from './integrations/config'
import { toHttpError } from './integrations/errors'
import { requireEnabled, resolveQuickBooks } from './integrations/registry'

// Invoices are domain data with a provider column, pulled by the accounting connector into D1 and read
// from there. Status is derived at read time because "overdue" depends on today's date.

const PROVIDER = 'quickbooks' as const
const BATCH = 50

interface InvoiceRow {
  id: number
  provider: string
  external_id: string
  doc_number: string | null
  customer_id: string | null
  customer_name: string
  booking_ref: string | null
  shipment_id: string | null
  txn_date: string
  due_date: string | null
  currency: string
  total_amount: number
  balance: number
  vendor_status: string | null
  memo: string | null
  source: IntegrationMode
  vendor_updated_at: string | null
  synced_at: string
}

export function deriveStatus(row: { vendor_status: string | null; balance: number; due_date: string | null }, now: Date): InvoiceStatus {
  if (row.vendor_status === 'Voided') return 'void'
  if (row.balance <= 0) return 'paid'
  if (row.due_date && new Date(row.due_date).getTime() < now.getTime()) return 'overdue'
  return 'open'
}

const toInvoice = (r: InvoiceRow, now: Date): Invoice => ({
  id: r.id,
  provider: PROVIDER,
  externalId: r.external_id,
  docNumber: r.doc_number,
  customerId: r.customer_id,
  customerName: r.customer_name,
  bookingRef: r.booking_ref,
  shipmentId: r.shipment_id,
  txnDate: r.txn_date,
  dueDate: r.due_date,
  currency: r.currency,
  totalAmount: r.total_amount,
  balance: r.balance,
  vendorStatus: r.vendor_status,
  memo: r.memo,
  vendorUpdatedAt: r.vendor_updated_at,
  status: deriveStatus(r, now),
  source: r.source,
  syncedAt: r.synced_at,
})

export async function listInvoices(env: Env, _user: SessionUser): Promise<Response> {
  const r = await resolveQuickBooks(env)
  let rows: InvoiceRow[] = []
  try {
    const res = await env.DB.prepare('SELECT * FROM invoices WHERE provider = ? ORDER BY txn_date DESC, id').bind(PROVIDER).all<InvoiceRow>()
    rows = res.results ?? []
  } catch (err) {
    // Table not migrated yet (CI does not run migrations): show an empty ledger rather than a 500.
    console.error('invoices table unavailable', err)
  }
  const now = new Date()
  const result: InvoiceListResult = {
    source: r.config.enabled ? r.config.effectiveMode : null,
    lastSync: toSync(r.row),
    invoices: rows.map((row) => toInvoice(row, now)),
  }
  return json(result)
}

const UPSERT = `INSERT INTO invoices (provider, external_id, doc_number, customer_id, customer_name, booking_ref, shipment_id, txn_date, due_date,
    currency, total_amount, balance, vendor_status, memo, source, vendor_updated_at, synced_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(provider, external_id) DO UPDATE SET doc_number = excluded.doc_number, customer_id = excluded.customer_id,
    customer_name = excluded.customer_name, booking_ref = excluded.booking_ref, shipment_id = excluded.shipment_id,
    txn_date = excluded.txn_date, due_date = excluded.due_date, currency = excluded.currency, total_amount = excluded.total_amount,
    balance = excluded.balance, vendor_status = excluded.vendor_status, memo = excluded.memo, source = excluded.source,
    vendor_updated_at = excluded.vendor_updated_at, synced_at = excluded.synced_at`

// Always a full pull: the ledger is small, and a partial pull would leave a stale mix. Rows from the
// other mode are dropped afterwards so mock and live invoices never sit side by side.
export async function syncInvoices(env: Env, user: SessionUser): Promise<Response> {
  const r = await resolveQuickBooks(env, { actorId: user.id })
  const at = new Date().toISOString()
  const mode = r.config.effectiveMode
  try {
    requireEnabled(r)
    const pulled: VendorInvoice[] = await r.adapter.listInvoices({})
    const refs = await env.DB.prepare('SELECT id, booking_ref FROM shipments').all<{ id: string; booking_ref: string }>()
    const byRef = new Map(refs.results.map((s) => [s.booking_ref, s.id]))
    const stmts = pulled.map((inv) =>
      env.DB.prepare(UPSERT).bind(
        PROVIDER,
        inv.externalId,
        inv.docNumber,
        inv.customerId,
        inv.customerName,
        inv.bookingRef,
        inv.bookingRef ? (byRef.get(inv.bookingRef) ?? null) : null,
        inv.txnDate,
        inv.dueDate,
        inv.currency,
        inv.totalAmount,
        inv.balance,
        inv.vendorStatus,
        inv.memo,
        mode,
        inv.vendorUpdatedAt,
        at,
      ),
    )
    stmts.push(env.DB.prepare('DELETE FROM invoices WHERE provider = ? AND source <> ?').bind(PROVIDER, mode))
    for (let i = 0; i < stmts.length; i += BATCH) await env.DB.batch(stmts.slice(i, i + BATCH))
    const sync: InvoiceSync = { at, ok: true, mode, count: pulled.length, message: `Pulled ${pulled.length} invoices (${mode})` }
    await saveSync(env, PROVIDER, sync)
    return json(sync)
  } catch (err) {
    const http = toHttpError(err)
    await saveSync(env, PROVIDER, { at, ok: false, mode, count: null, message: http.message }).catch((e) => console.error(e))
    throw http
  }
}
