import type { DocStatus, InvoiceStatus, ShipmentStatus } from '../../types'

export const SHIPMENT_STATUS_META: Record<ShipmentStatus, { label: string; cls: string; dot: string }> = {
  booking_confirmed: { label: 'Booking confirmed', cls: 'bg-sky-50 text-sky-700 border-sky-200', dot: 'bg-sky-500' },
  awaiting_departure: { label: 'Awaiting departure', cls: 'bg-slate-50 text-slate-600 border-slate-200', dot: 'bg-slate-400' },
  in_transit: { label: 'In transit', cls: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500' },
  transshipment: { label: 'Transshipment', cls: 'bg-violet-50 text-violet-700 border-violet-200', dot: 'bg-violet-500' },
  arrived: { label: 'Arrived', cls: 'bg-teal-50 text-teal-700 border-teal-200', dot: 'bg-teal-500' },
  delivered: { label: 'Delivered', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  delayed: { label: 'Delayed', cls: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
}

export function ShipmentStatusBadge({ status }: { status: ShipmentStatus }) {
  const m = SHIPMENT_STATUS_META[status]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${m.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  )
}

const DOC_STATUS_META: Record<DocStatus, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'bg-slate-50 text-slate-600 border-slate-200' },
  pending_approval: { label: 'Pending approval', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  approved: { label: 'Approved', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
}

export function DocStatusBadge({ status }: { status: DocStatus }) {
  const m = DOC_STATUS_META[status]
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${m.cls}`}>
      {m.label}
    </span>
  )
}

export const INVOICE_STATUS_META: Record<InvoiceStatus, { label: string; cls: string }> = {
  open: { label: 'Open', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  overdue: { label: 'Overdue', cls: 'bg-red-50 text-red-700 border-red-200' },
  paid: { label: 'Paid', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  void: { label: 'Void', cls: 'bg-slate-50 text-slate-500 border-slate-200' },
}

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const m = INVOICE_STATUS_META[status]
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${m.cls}`}>
      {m.label}
    </span>
  )
}
