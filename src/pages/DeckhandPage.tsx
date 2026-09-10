import { useRef, useState } from 'react'
import { AlertTriangle, Check, Copy, FileUp, Loader2, Wand2 } from 'lucide-react'
import { Card, CardHeader } from '../components/ui/Card'

type Confidence = 'high' | 'low' | 'unsure'
type ContainerStatus = 'valid' | 'invalid' | 'malformed'

interface Field {
  value: string | null
  confidence: Confidence
}
interface ContainerRef {
  raw: string
  normalized: string | null
  status: ContainerStatus
  confidence: Confidence
}
interface SealRef {
  raw: string
  confidence: Confidence
}
interface Pairing {
  container: ContainerRef
  seal: SealRef | null
  evidence: 'same_row' | 'same_line' | 'same_block'
}
interface Extraction {
  bookingRef: Field
  vessel: Field
  voyage: Field
  portOfLoading: Field
  portOfDischarge: Field
  pairs: Pairing[]
  unpaired: { containers: ContainerRef[]; seals: SealRef[] }
  warnings: string[]
  source: 'stub' | 'llm'
}

const EVIDENCE_LABEL: Record<Pairing['evidence'], string> = {
  same_row: 'same table row',
  same_line: 'same line',
  same_block: 'same block',
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text)
        setDone(true)
        setTimeout(() => setDone(false), 1200)
      }}
      className="inline-flex flex-none items-center gap-1 rounded border border-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
      aria-label={`Copy ${label}`}
    >
      {done ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
      {done ? 'Copied' : label}
    </button>
  )
}

/** A value plus its own copy button. Missing values are shown, never hidden. */
function FieldRow({ label, field }: { label: string; field: Field }) {
  const present = field.value !== null
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-50 py-2 last:border-0">
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
        <div className={`truncate text-[13px] ${present ? 'font-medium text-slate-800' : 'italic text-slate-400'}`}>
          {present ? field.value : 'missing'}
        </div>
      </div>
      <div className="flex flex-none items-center gap-2">
        {present && field.confidence !== 'high' && (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">not certain</span>
        )}
        {present && <CopyButton text={field.value!} />}
      </div>
    </div>
  )
}

const statusChip = (status: ContainerStatus) =>
  status === 'valid' ? null : (
    <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700">
      {status === 'invalid' ? 'check digit fails' : 'not a container format'}
    </span>
  )

export default function DeckhandPage() {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ extraction: Extraction; block: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function run(body: BodyInit, headers?: HeadersInit) {
    setBusy(true)
    setError('')
    try {
      const r = await fetch('/api/deckhand/extract', { method: 'POST', credentials: 'same-origin', headers, body })
      const payload = (await r.json()) as { extraction?: Extraction; block?: string; error?: string }
      if (!r.ok) throw new Error(payload.error ?? `Extraction failed (${r.status})`)
      setResult({ extraction: payload.extraction!, block: payload.block! })
    } catch (err) {
      setResult(null)
      setError(err instanceof Error ? err.message : 'Extraction failed')
    } finally {
      setBusy(false)
    }
  }

  const x = result?.extraction

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Card>
        <CardHeader
          title="Deckhand"
          subtitle="Paste an email or attach the document. Deckhand reads out the identifiers; you check them and copy them across."
        />
        <div className="space-y-3 p-5">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={9}
            placeholder="Paste the email here, including any container and seal list…"
            data-testid="deckhand-text"
            className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 font-mono text-[12px] leading-relaxed focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15"
          />
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => void run(JSON.stringify({ text }), { 'content-type': 'application/json' })}
              disabled={busy || text.trim() === ''}
              data-testid="deckhand-extract"
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
              {busy ? 'Reading…' : 'Extract'}
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2.5 text-[13px] font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              <FileUp size={14} />
              Attach PDF or photo
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                const form = new FormData()
                form.append('file', file)
                void run(form)
                e.target.value = ''
              }}
            />
            <span className="text-[11px] text-slate-400">Nothing is saved. Deckhand reads the document and forgets it.</span>
          </div>
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12px] text-red-700">
              <AlertTriangle size={14} className="mt-0.5 flex-none" />
              {error}
            </div>
          )}
        </div>
      </Card>

      {result && x && (
        <>
          {x.warnings.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/60">
              <div className="space-y-1.5 p-4 text-[12px] text-amber-900">
                {x.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <AlertTriangle size={13} className="mt-0.5 flex-none" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Paste-ready block" subtitle="Read it against the email before it goes anywhere." action={<CopyButton text={result.block} label="Copy all" />} />
            <pre
              data-testid="deckhand-block"
              className="overflow-x-auto whitespace-pre px-5 py-4 font-mono text-[12px] leading-relaxed text-slate-800"
            >
              {result.block}
            </pre>
          </Card>

          <Card>
            <CardHeader title="Containers and seals" subtitle="Paired only where the document showed them together." />
            <div className="p-5 pt-3">
              {x.pairs.length === 0 && <div className="text-[13px] italic text-slate-400">No containers were recognised.</div>}
              {x.pairs.map((p, i) => (
                <div key={i} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-50 py-2.5 last:border-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[13px] font-semibold text-slate-800">{p.container.normalized ?? p.container.raw}</span>
                    {statusChip(p.container.status)}
                    <span className="text-slate-300">·</span>
                    {p.seal ? (
                      <span className="font-mono text-[13px] text-slate-700">seal {p.seal.raw}</span>
                    ) : (
                      <span className="text-[12px] italic text-slate-400">no seal in this document</span>
                    )}
                    <span className="text-[10px] text-slate-400">({EVIDENCE_LABEL[p.evidence]})</span>
                  </div>
                  <div className="flex flex-none items-center gap-1.5">
                    <CopyButton text={p.container.normalized ?? p.container.raw} label="Container" />
                    {p.seal && <CopyButton text={p.seal.raw} label="Seal" />}
                  </div>
                </div>
              ))}

              {(x.unpaired.containers.length > 0 || x.unpaired.seals.length > 0) && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/60 p-3.5" data-testid="deckhand-unpaired">
                  <div className="flex items-center gap-1.5 text-[12px] font-semibold text-amber-900">
                    <AlertTriangle size={13} />
                    Not paired — the document did not show these together
                  </div>
                  <p className="mt-1 text-[11px] text-amber-800">
                    Deckhand will not guess which seal belongs to which container. Match them from the source yourself.
                  </p>
                  <div className="mt-2.5 space-y-1.5">
                    {x.unpaired.containers.map((c, i) => (
                      <div key={`c${i}`} className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 font-mono text-[12px] text-slate-800">
                          {c.normalized ?? c.raw}
                          {statusChip(c.status)}
                        </span>
                        <CopyButton text={c.normalized ?? c.raw} label="Container" />
                      </div>
                    ))}
                    {x.unpaired.seals.map((s, i) => (
                      <div key={`s${i}`} className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[12px] text-slate-800">seal {s.raw}</span>
                        <CopyButton text={s.raw} label="Seal" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Fields" subtitle="Copy them one at a time into the form." />
            <div className="px-5 pb-4">
              <FieldRow label="Booking / shipment ref" field={x.bookingRef} />
              <FieldRow label="Vessel" field={x.vessel} />
              <FieldRow label="Voyage" field={x.voyage} />
              <FieldRow label="Port of loading" field={x.portOfLoading} />
              <FieldRow label="Port of discharge" field={x.portOfDischarge} />
            </div>
            <div className="border-t border-slate-100 px-5 py-2.5 text-[11px] text-slate-400">
              Seal numbers have no standard format and no check digit, so Deckhand cannot verify one. Container numbers are checked against ISO 6346.
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
