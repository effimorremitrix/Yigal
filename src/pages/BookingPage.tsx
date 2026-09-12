import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Leaf, Minus, Plus, Ship } from 'lucide-react'
import { useData } from '../context/DataContext'
import { useAuth } from '../context/AuthContext'
import { Card } from '../components/ui/Card'
import { inputCls, Select } from '../components/ui/inputs'
import { apiFetch } from '../lib/api'
import { CONTAINER_TYPES, INCOTERMS, LANES, PORTS } from '../data/constants'
import { addDays, fmtDate, iso, TODAY } from '../data/random'
import type { Incoterm, SailingSchedule, ScheduleResult } from '../types'

const STEPS = ['Route', 'Cargo', 'Schedule', 'Review']

const CONTAINER_INFO: Record<string, string> = {
  '20DV': "20' Dry Van · 33 m³",
  '40DV': "40' Dry Van · 67 m³",
  '40HC': "40' High Cube · 76 m³",
  '40RF': "40' Reefer · 67 m³",
}

export default function BookingPage() {
  const { createBooking } = useData()
  const { canWrite, vocabulary, business } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState(0)
  const [origin, setOrigin] = useState('CNSHA')
  const [destination, setDestination] = useState('NLRTM')
  const [readyDays, setReadyDays] = useState('7')
  const [incoterm, setIncoterm] = useState<Incoterm>('FOB')
  const [quantities, setQuantities] = useState<Record<string, number>>({ '20DV': 0, '40DV': 2, '40HC': 0, '40RF': 0 })
  const [commodity, setCommodity] = useState('Auto parts')
  const [weight, setWeight] = useState('18')
  // Trader mode only, and optional: the all-in price the importer is invoiced. Left blank it is
  // simply not set on the shipment; it is never guessed from the freight cost.
  const [dealValue, setDealValue] = useState('')
  const [selected, setSelected] = useState<SailingSchedule | null>(null)
  const [createdId, setCreatedId] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState('')
  const [busy, setBusy] = useState(false)

  const destinations = useMemo(
    () => LANES.filter((l) => l.origin === origin).map((l) => l.destination),
    [origin],
  )
  const effectiveDest = destinations.includes(destination) ? destination : destinations[0]

  // Sailings come from the INTTRA connector (mock adapter until credentials are configured).
  const [schedules, setSchedules] = useState<SailingSchedule[] | null>(null)
  const [schedError, setSchedError] = useState('')
  const [schedTick, setSchedTick] = useState(0)
  useEffect(() => {
    if (!canWrite) return
    let cancelled = false
    setSchedules(null)
    setSchedError('')
    setSelected(null)
    const q = new URLSearchParams({ origin, destination: effectiveDest, ready: iso(addDays(TODAY, Number(readyDays))) })
    apiFetch<ScheduleResult>(`/api/integrations/inttra/schedules?${q}`)
      .then((r) => {
        if (!cancelled) setSchedules(r.schedules)
      })
      .catch((err) => {
        if (!cancelled) setSchedError(err instanceof Error ? err.message : 'Could not load sailings')
      })
    return () => {
      cancelled = true
    }
  }, [origin, effectiveDest, readyDays, canWrite, schedTick])

  const totalContainers = Object.values(quantities).reduce((a, b) => a + b, 0)
  const totalTeu = Object.entries(quantities).reduce((a, [t, n]) => a + n * (t === '20DV' ? 1 : 2), 0)

  const canNext = step === 0 ? Boolean(effectiveDest) : step === 1 ? totalContainers > 0 : step === 2 ? selected !== null : true

  async function confirm() {
    if (!selected || busy) return
    setSubmitError('')
    setBusy(true)
    try {
      const created = await createBooking({
        originCode: origin,
        destinationCode: effectiveDest,
        incoterm,
        commodity,
        weightKg: Number(weight) * 1000,
        // Blank stays blank: undefined tells the worker "not set" rather than zero.
        dealValueUsd: dealValue.trim() === '' ? undefined : Number(dealValue),
        containers: quantities,
        schedule: {
          carrier: selected.carrier,
          scac: selected.scac,
          vesselName: selected.vesselName,
          voyage: selected.voyage,
          etd: selected.etd,
          eta: selected.eta,
          transitDays: selected.transitDays,
          co2PerTeuTons: selected.co2PerTeuTons,
          costPerTeuUsd: selected.costPerTeuUsd,
        },
      })
      setCreatedId(created.id)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Booking failed — please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!canWrite) return <Navigate to="/" replace />

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
                  options={INCOTERMS.map((t) => ({ value: t, label: t }))}
                />
              </label>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <h2 className="text-[15px] font-semibold text-slate-900">What are you shipping?</h2>
            {vocabulary.showsCommission && (
              <label className="block max-w-sm">
                <span className="mb-1.5 block text-[12px] font-medium text-slate-500">
                  Deal value (USD, optional)
                </span>
                <input
                  value={dealValue}
                  onChange={(e) => setDealValue(e.target.value)}
                  inputMode="decimal"
                  placeholder="e.g. 154000"
                  className={inputCls}
                  data-testid="deal-value"
                />
                <span className="mt-1.5 block text-[12px] text-slate-500">
                  The all-in price invoiced to the importer, covering goods, freight, insurance and duty. Your{' '}
                  {business?.commissionRatePct ?? 2}% commission comes out of what the producer receives. Leave blank
                  if the price is not agreed yet.
                </span>
              </label>
            )}
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
            {schedules === null && !schedError && <div className="py-8 text-center text-[12px] text-slate-400">Loading sailings…</div>}
            {schedError && (
              <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
                <span>{schedError}</span>
                <button type="button" onClick={() => setSchedTick((t) => t + 1)} className="font-medium underline">
                  Retry
                </button>
              </div>
            )}
            {(schedules ?? []).map((sch) => {
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
                  ...(vocabulary.showsCommission
                    ? ([['Deal value', dealValue ? `$${Number(dealValue).toLocaleString()}` : 'Not set']] as [string, string][])
                    : []),
                ] as [string, string][]
              ).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[11px] uppercase tracking-wide text-slate-400">{k}</dt>
                  <dd className="mt-0.5 text-[13px] font-medium text-slate-800">{v}</dd>
                </div>
              ))}
            </dl>
            {submitError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{submitError}</div>
            )}
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
              onClick={() => void confirm()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2 text-[13px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Check size={15} />
              {busy ? 'Confirming…' : 'Confirm booking'}
            </button>
          )}
        </div>
      </Card>
    </div>
  )
}
