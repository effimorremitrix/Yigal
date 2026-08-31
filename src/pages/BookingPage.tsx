import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Leaf, Minus, Plus, Ship } from 'lucide-react'
import { useData } from '../context/DataContext'
import { Card } from '../components/ui/Card'
import { Select } from '../components/ui/inputs'
import { CONTAINER_TYPES, LANES, PORTS } from '../data/constants'
import { generateSailingSchedules } from '../data/schedules'
import { addDays, fmtDate, iso, TODAY } from '../data/random'
import type { Incoterm, Milestone, SailingSchedule, Shipment } from '../types'

const STEPS = ['Route', 'Cargo', 'Schedule', 'Review']

const CONTAINER_INFO: Record<string, string> = {
  '20DV': "20' Dry Van · 33 m³",
  '40DV': "40' Dry Van · 67 m³",
  '40HC': "40' High Cube · 76 m³",
  '40RF': "40' Reefer · 67 m³",
}

export default function BookingPage() {
  const { addShipment, shipments } = useData()
  const navigate = useNavigate()

  const [step, setStep] = useState(0)
  const [origin, setOrigin] = useState('CNSHA')
  const [destination, setDestination] = useState('NLRTM')
  const [readyDays, setReadyDays] = useState('7')
  const [incoterm, setIncoterm] = useState<Incoterm>('FOB')
  const [quantities, setQuantities] = useState<Record<string, number>>({ '20DV': 0, '40DV': 2, '40HC': 0, '40RF': 0 })
  const [commodity, setCommodity] = useState('Auto parts')
  const [weight, setWeight] = useState('18')
  const [selected, setSelected] = useState<SailingSchedule | null>(null)
  const [createdId, setCreatedId] = useState<string | null>(null)

  const destinations = useMemo(
    () => LANES.filter((l) => l.origin === origin).map((l) => l.destination),
    [origin],
  )
  const effectiveDest = destinations.includes(destination) ? destination : destinations[0]

  const readyDate = addDays(TODAY, Number(readyDays))
  const schedules = useMemo(
    () => generateSailingSchedules(origin, effectiveDest, readyDate),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [origin, effectiveDest, readyDays],
  )

  const totalContainers = Object.values(quantities).reduce((a, b) => a + b, 0)
  const totalTeu = Object.entries(quantities).reduce((a, [t, n]) => a + n * (t === '20DV' ? 1 : 2), 0)

  const canNext = step === 0 ? Boolean(effectiveDest) : step === 1 ? totalContainers > 0 : step === 2 ? selected !== null : true

  function confirm() {
    if (!selected) return
    const lane = LANES.find((l) => l.origin === origin && l.destination === effectiveDest)!
    const o = PORTS[origin]
    const d = PORTS[effectiveDest]
    const n = shipments.length + 1
    const etd = new Date(selected.etd)

    const plan: { key: Milestone['key']; label: string; location: string; offset: number }[] = [
      { key: 'booking_confirmed', label: 'Booking confirmed', location: o.name, offset: -Number(readyDays) },
      { key: 'container_gate_in', label: 'Container gate in', location: `${o.name} terminal`, offset: -3 },
      { key: 'loaded_on_vessel', label: 'Loaded on vessel', location: `${o.name} terminal`, offset: -1 },
      { key: 'vessel_departed', label: 'Vessel departed', location: o.name, offset: 0 },
      ...(lane.via
        ? [{ key: 'transshipment' as const, label: 'Transshipment', location: PORTS[lane.via].name, offset: Math.round(selected.transitDays * 0.45) }]
        : []),
      { key: 'vessel_arrived' as const, label: 'Vessel arrived', location: d.name, offset: selected.transitDays },
      { key: 'gate_out' as const, label: 'Container gate out', location: `${d.name} terminal`, offset: selected.transitDays + 2 },
      { key: 'delivered' as const, label: 'Delivered', location: `${d.name} area`, offset: selected.transitDays + 4 },
    ]

    const containers = Object.entries(quantities).flatMap(([type, count]) =>
      Array.from({ length: count }, (_, i) => ({
        number: `TLNU${String(7000000 + n * 137 + i)}`,
        type: type as Shipment['containers'][number]['type'],
        sealNumber: `SL${String(400000 + n * 61 + i)}`,
        weightKg: Number(weight) * 1000,
        status: 'FCL',
        ddRiskUsd: 0,
      })),
    )

    const shipment: Shipment = {
      id: `new-${n}`,
      bookingRef: `TL-2026-${String(n + 100).padStart(4, '0')}`,
      origin: o,
      destination: d,
      via: lane.via ? PORTS[lane.via] : undefined,
      laneId: lane.id,
      carrier: { name: selected.carrier, scac: selected.scac },
      vessel: { name: selected.vesselName, imo: `9${String(500000 + n)}`, voyage: selected.voyage },
      status: 'booking_confirmed',
      etd: selected.etd,
      eta: selected.eta,
      containers,
      milestones: plan.map((m, i) => ({
        key: m.key,
        label: m.label,
        location: m.location,
        planned: iso(addDays(etd, m.offset)),
        actual: i === 0 ? iso(TODAY) : undefined,
        status: i === 0 ? 'completed' : i === 1 ? 'current' : 'pending',
      })),
      documents: [
        { id: `nd-${n}-1`, type: 'SI', name: 'Shipping Instructions', status: 'draft', uploadedBy: 'Effi Mor', updatedAt: iso(TODAY) },
        { id: `nd-${n}-2`, type: 'VGM', name: 'VGM Declaration', status: 'draft', uploadedBy: 'Effi Mor', updatedAt: iso(TODAY) },
      ],
      parties: [
        { id: `np-${n}-1`, name: 'Atlas Polymers Ltd', role: 'shipper', contact: 'Effi Mor' },
        { id: `np-${n}-2`, name: 'Northline Imports BV', role: 'consignee', contact: 'Pieter van Dam' },
        { id: `np-${n}-3`, name: 'GlobalFreight Partners', role: 'forwarder', contact: 'Amit Shalev' },
        { id: `np-${n}-4`, name: selected.carrier, role: 'carrier', contact: 'Operations desk' },
      ],
      comments: [
        { id: `nc-${n}`, author: 'Operations desk', role: 'carrier', text: 'Booking confirmed on requested sailing. Cut-off is 48h before ETD.', at: iso(TODAY) },
      ],
      incoterm,
      commodity,
      co2Tons: Math.round(totalTeu * selected.co2PerTeuTons * 10) / 10,
      freightCostUsd: totalTeu * selected.costPerTeuUsd,
      onTime: true,
      progress: 0,
    }

    addShipment(shipment)
    setCreatedId(shipment.id)
  }

  if (createdId) {
    return (
      <Card className="mx-auto max-w-xl p-10 text-center">
        <CheckCircle2 size={44} className="mx-auto text-emerald-500" />
        <h2 className="mt-4 text-[19px] font-semibold text-slate-900">Booking confirmed</h2>
        <p className="mt-2 text-[13px] text-slate-500">
          Your shipment was created and the carrier has been notified. Track its milestones from the shipment page.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={() => navigate(`/shipments/${createdId}`)}
            className="rounded-lg bg-brand-600 px-4 py-2.5 text-[13px] font-medium text-white hover:bg-brand-700"
          >
            View shipment
          </button>
          <Link to="/shipments" className="rounded-lg border border-slate-200 px-4 py-2.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50">
            All shipments
          </Link>
        </div>
      </Card>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* Stepper */}
      <div className="flex items-center">
        {STEPS.map((label, i) => (
          <div key={label} className={`flex items-center ${i < STEPS.length - 1 ? 'flex-1' : ''}`}>
            <div className="flex items-center gap-2">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-semibold ${
                  i < step ? 'bg-brand-600 text-white' : i === step ? 'border-2 border-brand-600 bg-white text-brand-600' : 'border border-slate-300 bg-white text-slate-400'
                }`}
              >
                {i < step ? <Check size={14} /> : i + 1}
              </span>
              <span className={`text-[13px] font-medium ${i <= step ? 'text-slate-800' : 'text-slate-400'}`}>{label}</span>
            </div>
            {i < STEPS.length - 1 && <div className={`mx-3 h-px flex-1 ${i < step ? 'bg-brand-600' : 'bg-slate-200'}`} />}
          </div>
        ))}
      </div>

      <Card className="p-6">
        {step === 0 && (
          <div className="space-y-5">
            <h2 className="text-[15px] font-semibold text-slate-900">Where is your cargo going?</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Port of loading</span>
                <Select
                  value={origin}
                  onChange={setOrigin}
                  options={[...new Set(LANES.map((l) => l.origin))].map((code) => ({
                    value: code,
                    label: `${PORTS[code].flag} ${PORTS[code].name} (${code})`,
                  }))}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Port of discharge</span>
                <Select
                  value={effectiveDest}
                  onChange={setDestination}
                  options={destinations.map((code) => ({
                    value: code,
                    label: `${PORTS[code].flag} ${PORTS[code].name} (${code})`,
                  }))}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Cargo ready</span>
                <Select
                  value={readyDays}
                  onChange={setReadyDays}
                  options={[
                    { value: '3', label: `In 3 days (${fmtDate(iso(addDays(TODAY, 3)))})` },
                    { value: '7', label: `In 1 week (${fmtDate(iso(addDays(TODAY, 7)))})` },
                    { value: '14', label: `In 2 weeks (${fmtDate(iso(addDays(TODAY, 14)))})` },
                    { value: '21', label: `In 3 weeks (${fmtDate(iso(addDays(TODAY, 21)))})` },
                  ]}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Incoterm</span>
                <Select
                  value={incoterm}
                  onChange={(v) => setIncoterm(v as Incoterm)}
                  options={(['FOB', 'CIF', 'EXW', 'DDP'] as const).map((t) => ({ value: t, label: t }))}
                />
              </label>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <h2 className="text-[15px] font-semibold text-slate-900">What are you shipping?</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {CONTAINER_TYPES.map((t) => (
                <div key={t} className={`flex items-center justify-between rounded-lg border p-4 ${quantities[t] > 0 ? 'border-brand-600 bg-brand-50/40' : 'border-slate-200'}`}>
                  <div>
                    <div className="text-[13px] font-semibold text-slate-800">{t}</div>
                    <div className="text-[11px] text-slate-500">{CONTAINER_INFO[t]}</div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={() => setQuantities((q) => ({ ...q, [t]: Math.max(0, q[t] - 1) }))}
                      className="rounded-md border border-slate-200 p-1 text-slate-500 hover:bg-slate-50"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="w-5 text-center text-[14px] font-semibold text-slate-800">{quantities[t]}</span>
                    <button
                      onClick={() => setQuantities((q) => ({ ...q, [t]: Math.min(20, q[t] + 1) }))}
                      className="rounded-md border border-slate-200 p-1 text-slate-500 hover:bg-slate-50"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Commodity</span>
                <input
                  value={commodity}
                  onChange={(e) => setCommodity(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-slate-500">Weight per container (t)</span>
                <input
                  type="number"
                  min={1}
                  max={28}
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15"
                />
              </label>
            </div>
            <div className="text-[12px] text-slate-500">
              {totalContainers} container{totalContainers === 1 ? '' : 's'} · {totalTeu} TEU
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-[15px] font-semibold text-slate-900">
              Choose a sailing — {PORTS[origin].name} → {PORTS[effectiveDest].name}
            </h2>
            {schedules.map((sch) => {
              const isSel = selected?.id === sch.id
              return (
                <button
                  key={sch.id}
                  onClick={() => setSelected(sch)}
                  className={`w-full rounded-lg border p-4 text-left transition-colors ${isSel ? 'border-brand-600 bg-brand-50/40 ring-2 ring-brand-600/15' : 'border-slate-200 hover:border-slate-300'}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className={`rounded-lg p-2 ${isSel ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        <Ship size={16} />
                      </span>
                      <div>
                        <div className="text-[13px] font-semibold text-slate-800">
                          {sch.carrier} <span className="font-normal text-slate-400">({sch.scac})</span>
                        </div>
                        <div className="text-[12px] text-slate-500">
                          {sch.vesselName} · voy {sch.voyage}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 text-[12px]">
                      <div>
                        <div className="text-slate-400">ETD</div>
                        <div className="font-medium text-slate-800">{fmtDate(sch.etd)}</div>
                      </div>
                      <div>
                        <div className="text-slate-400">ETA</div>
                        <div className="font-medium text-slate-800">{fmtDate(sch.eta)}</div>
                      </div>
                      <div>
                        <div className="text-slate-400">Transit</div>
                        <div className="font-medium text-slate-800">
                          {sch.transitDays}d · {sch.transshipments === 0 ? 'direct' : `${sch.transshipments} T/S`}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-emerald-600">
                        <Leaf size={13} />
                        {sch.co2PerTeuTons} t/TEU
                      </div>
                      <div className="text-[15px] font-semibold text-slate-900">${sch.costPerTeuUsd.toLocaleString()}<span className="text-[11px] font-normal text-slate-400">/TEU</span></div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {step === 3 && selected && (
          <div className="space-y-5">
            <h2 className="text-[15px] font-semibold text-slate-900">Review & confirm</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg bg-slate-50 p-5 sm:grid-cols-3">
              {(
                [
                  ['Route', `${PORTS[origin].name} → ${PORTS[effectiveDest].name}`],
                  ['Incoterm', incoterm],
                  ['Commodity', commodity],
                  ['Containers', `${totalContainers} (${totalTeu} TEU)`],
                  ['Carrier', `${selected.carrier} (${selected.scac})`],
                  ['Vessel', `${selected.vesselName} · ${selected.voyage}`],
                  ['ETD', fmtDate(selected.etd)],
                  ['ETA', fmtDate(selected.eta)],
                  ['Est. freight', `$${(totalTeu * selected.costPerTeuUsd).toLocaleString()}`],
                ] as [string, string][]
              ).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[11px] uppercase tracking-wide text-slate-400">{k}</dt>
                  <dd className="mt-0.5 text-[13px] font-medium text-slate-800">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="text-[12px] text-slate-400">
              Confirming sends the booking request to the carrier and notifies all parties. (Demo — no real booking is made.)
            </p>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-5">
          <button
            onClick={() => setStep((v) => Math.max(0, v - 1))}
            disabled={step === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            <ArrowLeft size={14} />
            Back
          </button>
          {step < 3 ? (
            <button
              onClick={() => canNext && setStep((v) => v + 1)}
              disabled={!canNext}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-brand-700 disabled:opacity-40"
            >
              Continue
              <ArrowRight size={14} />
            </button>
          ) : (
            <button
              onClick={confirm}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2 text-[13px] font-medium text-white hover:bg-emerald-700"
            >
              <Check size={15} />
              Confirm booking
            </button>
          )}
        </div>
      </Card>
    </div>
  )
}
