import { int, mulberry32, pick } from '../../../src/data/random'
import type { VendorInvoice } from '../../../src/types'
import type { QuickBooksAdapter } from '../provider'

// The slice of a shipment the mock needs. Loaded lazily by the caller (registry.ts), so the adapter
// itself stays pure and listing integrations never touches the shipments table.
export interface InvoiceSeed {
  shipmentId: string
  bookingRef: string
  status: string
  etd: string
  eta: string
  originCode: string
  destinationCode: string
  incoterm: string
  freightCostUsd: number
  shipperName: string | null
  // Trader mode only; null in operator mode. Presence is how this adapter knows which model it is
  // billing under, so the mode never has to be passed alongside every row. See loadInvoiceSeeds.
  //
  // The commission is deliberately NOT here. This invoice is addressed to the importer, and the
  // one number he must not be handed is what Yigal kept out of the producer's side.
  dealValueUsd: number | null
  consigneeName: string | null
}

// Positional hash so 's12' and 's21' get different streams.
const seedOf = (s: string) => [...s].reduce((sum, ch, i) => sum + ch.charCodeAt(0) * (i + 1), 0)
const shiftDays = (isoStr: string, days: number) => new Date(new Date(isoStr).getTime() + days * 86400000).toISOString()
const round2 = (n: number) => Math.round(n * 100) / 100

export function createQuickBooksMockAdapter(loadSeeds: () => Promise<InvoiceSeed[]>): QuickBooksAdapter {
  return {
    provider: 'quickbooks',
    mode: 'mock',
    async healthCheck() {
      return { ok: true, mode: 'mock', message: 'Mock adapter responding; no external call was made', checkedAt: new Date().toISOString() }
    },
    // One invoice per shipment, billed to whichever side the business model sells to.
    // `updatedSince` is ignored: the mock is a full ledger.
    async listInvoices() {
      return (await loadSeeds()).map(mockInvoice)
    },
  }
}

// Deterministic per shipment and consistent with where the shipment is on its journey:
// delivered shipments are mostly paid, arrived ones half paid, everything else still open.
export function mockInvoice(seed: InvoiceSeed): VendorInvoice {
  const rng = mulberry32(seedOf(seed.shipmentId))
  const trading = seed.dealValueUsd !== null
  // Trader mode: the importer is invoiced the all-in deal value, nothing on top. Freight,
  // insurance and duty are already inside that number, and the commission comes out of the
  // producer's side rather than being added to the buyer's, so a surcharge here would be wrong
  // twice over. Operator mode keeps selling freight with a surcharge and a documentation fee.
  const surchargePct = int(rng, 3, 9)
  const docFee = pick(rng, [45, 60, 75])
  const totalAmount = trading
    ? round2(seed.dealValueUsd as number)
    : round2(seed.freightCostUsd * (1 + surchargePct / 100) + docFee)
  const txnDate = shiftDays(seed.etd, -3)

  let balance = totalAmount
  if (seed.status === 'delivered') balance = rng() < 0.8 ? 0 : round2(totalAmount * pick(rng, [0.25, 0.5]))
  else if (seed.status === 'arrived') balance = round2(totalAmount * 0.5)

  const customerName = (trading ? seed.consigneeName : seed.shipperName) ?? 'Walk-in customer'
  return {
    externalId: `mock-${seed.shipmentId}`,
    docNumber: `INV-${seed.bookingRef.replace(/^TL-/, '')}`,
    customerId: String(100 + (seedOf(customerName) % 900)),
    customerName,
    bookingRef: seed.bookingRef,
    txnDate,
    dueDate: shiftDays(txnDate, 30),
    currency: 'USD',
    totalAmount,
    balance,
    vendorStatus: 'EmailSent',
    memo: trading
      ? `Goods delivered ${seed.originCode} → ${seed.destinationCode}, ${seed.incoterm}, booking ${seed.bookingRef}`
      : `Ocean freight ${seed.originCode} → ${seed.destinationCode}, ${seed.incoterm}, booking ${seed.bookingRef}`,
    vendorUpdatedAt: balance < totalAmount ? shiftDays(seed.eta, 3) : txnDate,
  }
}
