import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, Copy, Download, FileUp, Loader2, Wand2 } from 'lucide-react'
import { Card, CardHeader } from '../components/ui/Card'
import type { ContainerStatus } from '../../worker/deckhand/containers'
import { OUTPUT_COLUMNS, csvFileName, formatCsv, formatTsv, outputRows, summarizeOutput } from '../../worker/deckhand/format'
import type { Extraction, Field, Pairing } from '../../worker/deckhand/types'

// The model and the formatters come from the worker module rather than being restated here:
// the table on screen and the text on the clipboard have to be the same rows, and a second
// copy of either would eventually stop being the same.

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

/**
 * Three shapes for the same verified pairing, because the portal screen Yigal is on decides
 * what is useful: a block to read, a grid to paste into, a file to upload. The rows behind
 * all three are identical — only the packaging changes.
 */
const OUTPUT_MODES = [
  { id: 'block', label: 'Block', title: 'Paste-ready block', subtitle: 'Read it against the email before it goes anywhere.' },
  { id: 'table', label: 'Table', title: 'Paste-ready table', subtitle: 'Two columns, tab separated. Copy all, then paste into the portal grid in one action.' },
  { id: 'file', label: 'File', title: 'Container details file', subtitle: 'The same two columns as a .csv, built here in the browser and never stored.' },
] as const

type OutputMode = (typeof OUTPUT_MODES)[number]['id']

/**
 * A real radio group: three native radios with visible labels, so arrow keys move between
 * them and a screen reader announces the group. The segmented look is styling on top of
 * that, never a substitute for it.
 */
function OutputModeControl({ value, onChange }: { value: OutputMode; onChange: (mode: OutputMode) => void }) {
  return (
    <div className="flex items-center gap-2.5">
      <span id="deckhand-output-label" className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
        Output
      </span>
      <div role="radiogroup" aria-labelledby="deckhand-output-label" className="flex gap-0.5 rounded-lg bg-slate-100 p-0.5">
        {OUTPUT_MODES.map((mode) => (
          <label key={mode.id} className="cursor-pointer">
            <input
              type="radio"
              name="deckhand-output"
              value={mode.id}
              checked={value === mode.id}
              onChange={() => onChange(mode.id)}
              className="peer sr-only"
            />
            <span className="block rounded-md px-3 py-1 text-[12px] font-medium text-slate-600 transition-colors hover:text-slate-900 peer-checked:bg-white peer-checked:text-slate-900 peer-checked:shadow-sm peer-focus-visible:ring-2 peer-focus-visible:ring-brand-600/40">
              {mode.label}
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}

/**
 * The file is built from the extraction already in memory and handed straight to the browser.
 * Nothing is uploaded, nothing is written to D1, and there is no server round trip: Deckhand
 * still reads, returns and forgets.
 */
function DownloadCsvButton({ csv, fileName }: { csv: string; fileName: string }) {
  return (
    <button
      type="button"
      data-testid="deckhand-download-csv"
      onClick={() => {
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
        const link = document.createElement('a')
        link.href = url
        link.download = fileName
        link.click()
        URL.revokeObjectURL(url)
      }}
      className="inline-flex flex-none items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-medium text-slate-700 transition-colors hover:bg-slate-50"
    >
      <Download size={13} />
      Download .csv
    </button>
  )
}

/**
 * The rows exactly as they will be copied or downloaded, with every gap and every failed
 * check digit stated above the table and marked in it. An empty seal cell is acceptable in
 * the output; an empty seal cell nobody noticed is not.
 */
function OutputTable({ extraction }: { extraction: Extraction }) {
  const rows = outputRows(extraction)
  const summary = summarizeOutput(extraction)
  const clean =
    summary.rowsWithoutSeal === 0 &&
    summary.unpairedSeals === 0 &&
    summary.checkDigitFailures === 0 &&
    summary.malformed === 0 &&
    summary.duplicatesMerged === 0 &&
    summary.sealConflicts === 0

  const counts = [
    `${summary.rows} row${summary.rows === 1 ? '' : 's'}`,
    `${summary.rowsWithoutSeal} with no seal number`,
    `${summary.unpairedSeals} unpaired seal${summary.unpairedSeals === 1 ? '' : 's'} left out of this output`,
    ...(summary.checkDigitFailures > 0 ? [`${summary.checkDigitFailures} failing the ISO 6346 check digit`] : []),
    ...(summary.malformed > 0 ? [`${summary.malformed} not in container number format`] : []),
    ...(summary.duplicatesMerged > 0
      ? [`${summary.duplicatesMerged} repeat mention${summary.duplicatesMerged === 1 ? '' : 's'} merged into the row above it`]
      : []),
    ...(summary.sealConflicts > 0
      ? [
          `${summary.sealConflicts} container${summary.sealConflicts === 1 ? '' : 's'} given two different seals, so the seal cell is blank and must be filled from the source`,
        ]
      : []),
  ]

  return (
    <div className="p-5 pt-3">
      <p
        data-testid="deckhand-output-summary"
        className={`mb-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px] ${
          clean ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-amber-200 bg-amber-50/60 text-amber-900'
        }`}
      >
        {!clean && <AlertTriangle size={13} className="mt-0.5 flex-none" />}
        <span>{`${counts.join(', ')}.`}</span>
      </p>

      {rows.length === 0 ? (
        <div className="text-[13px] italic text-slate-400">No containers were recognised, so there is nothing to paste.</div>
      ) : (
        <div className="overflow-x-auto">
          <table data-testid="deckhand-output-table" className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200">
                {OUTPUT_COLUMNS.map((column) => (
                  <th key={column} className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} data-testid="deckhand-output-row" className="border-b border-slate-50 last:border-0">
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[13px] font-semibold text-slate-800">{row.container}</span>
                      {statusChip(row.status)}
                      {row.origin === 'unpaired_container' && (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                          not paired
                        </span>
                      )}
                      {row.mentions > 1 && (
                        <span
                          title="The document named this container more than once. One row, not two."
                          className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500"
                        >
                          {row.mentions} mentions merged
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    {row.sealConflict ? (
                      <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700">
                        two different seals given, fill this from the source
                      </span>
                    ) : row.seal === '' ? (
                      <span className="text-[12px] italic text-slate-400">no seal in this document</span>
                    ) : (
                      <span className="font-mono text-[13px] text-slate-700">{row.seal}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function DeckhandPage() {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ extraction: Extraction; block: string } | null>(null)
  // Whichever shape he needed last is almost certainly the shape he needs next, so the mode
  // survives an extraction. Block stays the default on first load.
  const [mode, setMode] = useState<OutputMode>('block')
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
  const tsv = useMemo(() => (x ? formatTsv(x) : ''), [x])
  const csv = useMemo(() => (x ? formatCsv(x) : ''), [x])
  const modeCopy = OUTPUT_MODES.find((m) => m.id === mode)!

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
            <CardHeader title={modeCopy.title} subtitle={modeCopy.subtitle} />
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
              <OutputModeControl value={mode} onChange={setMode} />
              {mode === 'block' && <CopyButton text={result.block} label="Copy all" />}
              {mode === 'table' && <CopyButton text={tsv} label="Copy all" />}
              {mode === 'file' && <DownloadCsvButton csv={csv} fileName={csvFileName(x)} />}
            </div>
            {mode === 'block' ? (
              <pre
                data-testid="deckhand-block"
                className="overflow-x-auto whitespace-pre px-5 py-4 font-mono text-[12px] leading-relaxed text-slate-800"
              >
                {result.block}
              </pre>
            ) : (
              // Table and file show the same rows: the file is reviewed on screen before it
              // is downloaded, exactly as the table is reviewed before it is copied.
              <OutputTable extraction={x} />
            )}
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
