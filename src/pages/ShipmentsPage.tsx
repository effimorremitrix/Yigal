import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useData } from '../context/DataContext'
import { Card } from '../components/ui/Card'
import { SearchInput, Select } from '../components/ui/inputs'
import ShipmentTable from '../components/shipments/ShipmentTable'
import { SHIPMENT_STATUS_META } from '../components/ui/StatusBadge'
import { CARRIERS } from '../data/constants'
import type { ShipmentStatus } from '../types'

export default function ShipmentsPage() {
  const { shipments } = useData()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [carrier, setCarrier] = useState('all')

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return shipments.filter((s) => {
      if (status !== 'all' && s.status !== status) return false
      if (carrier !== 'all' && s.carrier.scac !== carrier) return false
      if (!needle) return true
      return [s.bookingRef, s.vessel.name, s.origin.name, s.origin.code, s.destination.name, s.destination.code, s.commodity]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    })
  }, [shipments, q, status, carrier])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={q} onChange={setQ} placeholder="Search ref, vessel, port…" />
          <Select
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'all', label: 'All statuses' },
              ...(Object.keys(SHIPMENT_STATUS_META) as ShipmentStatus[]).map((k) => ({
                value: k,
                label: SHIPMENT_STATUS_META[k].label,
              })),
            ]}
          />
          <Select
            label="Carrier"
            value={carrier}
            onChange={setCarrier}
            options={[{ value: 'all', label: 'All carriers' }, ...CARRIERS.map((c) => ({ value: c.scac, label: c.name }))]}
          />
          <span className="ml-1 text-[12px] text-slate-400">
            {filtered.length} of {shipments.length} shipments
          </span>
        </div>
        <Link
          to="/booking"
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-brand-700"
        >
          <Plus size={15} />
          New booking
        </Link>
      </div>
      <Card>
        <ShipmentTable shipments={filtered} />
      </Card>
    </div>
  )
}
