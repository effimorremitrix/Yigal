import type { InvoiceQuery, VendorInvoice } from '../../../src/types'
import { IntegrationError } from '../errors'
import { createHttpClient } from '../http'
import type { QuickBooksAdapter } from '../provider'
import { dropTokenCache, getAccessToken, type QuickBooksAuth } from './oauth'

// QuickBooks Online Accounting API v3. Base URL is the sandbox or production API host; the realm
// (company) id is part of every path. Reads use the query endpoint with QBO's SQL-like language.
const MINOR_VERSION = '75'
const PAGE_SIZE = 1000
const MAX_PAGES = 20 // 20,000 invoices per pull is plenty for a demo and bounds a runaway loop

const BOOKING_REF = /TL-\d{4}-\d{4}/

export interface QuickBooksLiveOptions extends QuickBooksAuth {
  baseUrl: string
}

interface QboRef {
  value?: string
  name?: string
}

interface QboInvoice {
  Id?: string
  DocNumber?: string
  TxnDate?: string
  DueDate?: string
  TotalAmt?: number
  Balance?: number
  CurrencyRef?: QboRef
  CustomerRef?: QboRef
  CustomerMemo?: { value?: string }
  PrivateNote?: string
  EmailStatus?: string
  MetaData?: { CreateTime?: string; LastUpdatedTime?: string }
  Line?: { Description?: string }[]
}

interface QboQueryResponse {
  QueryResponse?: { Invoice?: QboInvoice[]; startPosition?: number; maxResults?: number }
}

interface QboCompanyInfo {
  CompanyInfo?: { CompanyName?: string }
}

export function createQuickBooksLiveAdapter(opts: QuickBooksLiveOptions): QuickBooksAdapter {
  const http = createHttpClient({
    provider: 'quickbooks',
    baseUrl: opts.baseUrl,
    headers: async () => ({ authorization: `Bearer ${await getAccessToken(opts)}` }),
    timeoutMs: opts.timeoutMs,
  })
  const company = `/v3/company/${encodeURIComponent(opts.realmId)}`

  // One retry after dropping the cached access token: Intuit may revoke it before expires_in.
  async function withAuthRetry<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (err) {
      if (err instanceof IntegrationError && err.code === 'auth' && err.status !== undefined) {
        dropTokenCache(opts.clientId, opts.realmId)
        return fn()
      }
      throw err
    }
  }

  return {
    provider: 'quickbooks',
    mode: 'live',
    async healthCheck() {
      const t0 = Date.now()
      try {
        const info = await withAuthRetry(() => http.get<QboCompanyInfo>(`${company}/companyinfo/${encodeURIComponent(opts.realmId)}`, { minorversion: MINOR_VERSION }))
        const name = info.CompanyInfo?.CompanyName ?? `realm ${opts.realmId}`
        const rotation = opts.onRefreshTokenRotated ? '' : ' · rotated refresh tokens cannot be persisted: set CREDENTIALS_KEY'
        return { ok: true, mode: 'live', message: `Connected to ${name}${rotation}`, checkedAt: new Date().toISOString(), latencyMs: Date.now() - t0 }
      } catch (err) {
        return { ok: false, mode: 'live', message: err instanceof Error ? err.message : 'Health check failed', checkedAt: new Date().toISOString(), latencyMs: Date.now() - t0 }
      }
    },
    async listInvoices(query: InvoiceQuery) {
      const out: VendorInvoice[] = []
      for (let page = 0; page < MAX_PAGES; page++) {
        const start = page * PAGE_SIZE + 1
        const where = query.updatedSince ? ` WHERE MetaData.LastUpdatedTime > '${query.updatedSince.replace(/'/g, '')}'` : ''
        const sql = `SELECT * FROM Invoice${where} ORDERBY MetaData.LastUpdatedTime STARTPOSITION ${start} MAXRESULTS ${PAGE_SIZE}`
        const raw = await withAuthRetry(() => http.get<QboQueryResponse>(`${company}/query`, { query: sql, minorversion: MINOR_VERSION }))
        const batch = mapInvoices(raw)
        out.push(...batch)
        if (batch.length < PAGE_SIZE) break
      }
      return out
    },
  }
}

// Single place where the vendor payload becomes the vendor-neutral VendorInvoice DTO.
export function mapInvoices(raw: unknown): VendorInvoice[] {
  const res = raw as QboQueryResponse
  if (!res || typeof res !== 'object' || !res.QueryResponse) {
    throw new IntegrationError('quickbooks', 'unmapped', 'QuickBooks query response had no QueryResponse envelope')
  }
  return (res.QueryResponse.Invoice ?? []).flatMap((inv) => {
    if (!inv.Id) return []
    const total = Number(inv.TotalAmt ?? 0)
    const balance = Number(inv.Balance ?? 0)
    const memo = inv.CustomerMemo?.value ?? null
    const voided = total === 0 && /void/i.test(inv.PrivateNote ?? '')
    return [
      {
        externalId: inv.Id,
        docNumber: inv.DocNumber ?? null,
        customerId: inv.CustomerRef?.value ?? null,
        customerName: inv.CustomerRef?.name ?? 'Unknown customer',
        bookingRef: extractBookingRef([inv.DocNumber, memo, inv.PrivateNote, ...(inv.Line ?? []).map((l) => l.Description)]),
        txnDate: toIso(inv.TxnDate) ?? toIso(inv.MetaData?.CreateTime) ?? new Date().toISOString(),
        dueDate: toIso(inv.DueDate),
        currency: inv.CurrencyRef?.value ?? 'USD',
        totalAmount: total,
        balance,
        vendorStatus: voided ? 'Voided' : (inv.EmailStatus ?? null),
        memo,
        vendorUpdatedAt: toIso(inv.MetaData?.LastUpdatedTime),
      },
    ]
  })
}

export function extractBookingRef(candidates: (string | null | undefined)[]): string | null {
  for (const text of candidates) {
    const m = text?.match(BOOKING_REF)
    if (m) return m[0]
  }
  return null
}

// QBO dates are 'YYYY-MM-DD' (TxnDate/DueDate) or full timestamps (MetaData); normalize to ISO.
function toIso(value: string | undefined): string | null {
  if (!value) return null
  const d = new Date(value.length === 10 ? `${value}T00:00:00Z` : value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
