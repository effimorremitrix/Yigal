import type { ContainerStatus } from './containers'
import type { Extraction, Field } from './types'

/**
 * The paste-ready block, in the shape the brief specifies. Built on the server so the page,
 * the clipboard and anything else that ever consumes it cannot drift apart.
 *
 * Every field is printed even when it is missing, and every uncertainty is printed at the
 * bottom rather than being quietly folded into the values above.
 */

const LABELS = {
  bookingRef: 'Booking / shipment ref',
  containers: 'Container numbers',
  seals: 'Seal numbers',
  vessel: 'Vessel / voyage',
  ports: 'Ports (POL → POD)',
  unsure: 'Anything I am unsure of',
} as const

const WIDTH = Math.max(...Object.values(LABELS).map((l) => l.length))
const row = (label: string, value: string): string => `${label.padEnd(WIDTH)} : ${value}`
const shown = (f: Field): string => f.value ?? '(missing)'

export function formatBlock(x: Extraction): string {
  const lines: string[] = []
  lines.push(row(LABELS.bookingRef, shown(x.bookingRef)))

  // Containers and seals are printed as aligned columns so the eye can check the pairing.
  if (x.pairs.length > 0) {
    const width = Math.max(...x.pairs.map((p) => (p.container.normalized ?? p.container.raw).length))
    x.pairs.forEach((p, i) => {
      const number = p.container.normalized ?? p.container.raw
      const flag = p.container.status === 'valid' ? '' : p.container.status === 'invalid' ? '  <-- CHECK DIGIT FAILS' : '  <-- NOT A CONTAINER NUMBER FORMAT'
      const seal = p.seal ? `seal ${p.seal.raw}` : 'seal (missing)'
      lines.push(row(i === 0 ? LABELS.containers : '', `${number.padEnd(width)}  ${seal}${flag}`))
    })
  } else {
    lines.push(row(LABELS.containers, x.unpaired.containers.length > 0 ? '(none paired — see below)' : '(missing)'))
  }

  if (x.unpaired.containers.length > 0 || x.unpaired.seals.length > 0) {
    lines.push('')
    lines.push('NOT PAIRED — the source did not show these next to each other:')
    for (const c of x.unpaired.containers) lines.push(`  container ${c.normalized ?? c.raw}${c.status === 'valid' ? '' : `  <-- ${c.status.toUpperCase()}`}`)
    for (const s of x.unpaired.seals) lines.push(`  seal      ${s.raw}`)
    lines.push('')
  }

  const vesselVoyage = x.vessel.value || x.voyage.value ? `${shown(x.vessel)} / ${shown(x.voyage)}` : '(missing)'
  lines.push(row(LABELS.vessel, vesselVoyage))
  lines.push(row(LABELS.ports, `${shown(x.portOfLoading)} → ${shown(x.portOfDischarge)}`))

  const unsure = [
    ...([
      ['booking ref', x.bookingRef],
      ['vessel', x.vessel],
      ['voyage', x.voyage],
      ['port of loading', x.portOfLoading],
      ['port of discharge', x.portOfDischarge],
    ] as const)
      .filter(([, f]) => f.value === null || f.confidence !== 'high')
      .map(([name, f]) => (f.value === null ? `${name}: not found` : `${name}: read as "${f.value}" but not certain`)),
    ...x.warnings,
  ]
  lines.push(row(LABELS.unsure, unsure.length === 0 ? 'nothing' : unsure[0]))
  for (const line of unsure.slice(1)) lines.push(row('', line))

  return lines.join('\n')
}

/**
 * Table and file output.
 *
 * The block above is for reading. These two are for pasting into a portal grid or feeding
 * an upload, which means they are consumed by a machine and a wrong row is not obvious the
 * way a wrong line of prose is. Hence the one rule that governs everything below:
 *
 *   a seal reaches a row only through the pairing it was extracted with.
 *
 * There is no code path here that takes the nth container and the nth seal. Containers the
 * source did not show beside a seal get a row with an empty seal cell; seals the source did
 * not show beside a container get no row at all, and are reported on screen instead.
 */

/**
 * The header row for the file output, and the column headings shown on screen, in one place.
 *
 * PROVISIONAL. These are our best guess at what a container-details upload wants. We have no
 * INTTRA template, because that needs a vendor agreement rather than code. When Yigal sends
 * the real one, change these two strings and nothing else.
 */
export const OUTPUT_COLUMNS = ['Container Number', 'Seal Number'] as const

/** Whether a row came from a pairing or from a container the source left unpaired. */
export type RowOrigin = 'pair' | 'unpaired_container'

export interface OutputRow {
  /** Canonical form where the text is a container number at all, otherwise exactly as written. */
  container: string
  /** The seal extracted beside this container, or '' when there was none. Never a guess. */
  seal: string
  status: ContainerStatus
  origin: RowOrigin
  /** How many times the source mentioned this container. More than one means rows were merged. */
  mentions: number
  /** The source claimed two different seals for this container, so the cell is left empty. */
  sealConflict: boolean
}

/**
 * One row per container, in the order the source first mentioned it.
 *
 * A container number turns up more than once in a real email: in the depot list, and again
 * in a sentence of prose ("note that MSKU7293415 is the reefer"). That is one container,
 * not two. In the block a human reads, the repeat is visible and harmless; as two identical
 * rows in an upload it is a duplicate line the portal will either reject or, worse, accept.
 * So repeat mentions collapse onto the row that first named the container, and the seal is
 * taken from whichever mention carried one.
 *
 * The exception is the case that must never be guessed: two mentions claiming DIFFERENT
 * seals for one container. There is no evidence for choosing between them, so neither is
 * used, the cell is left empty and the row is flagged. A blank cell is recoverable in
 * thirty seconds; the wrong seal on a container is not recoverable at all.
 *
 * Unpaired seals remain absent from every row: they belong to a container we cannot name.
 */
export function outputRows(x: Extraction): OutputRow[] {
  const rows: OutputRow[] = []
  const byContainer = new Map<string, OutputRow>()

  const add = (container: string, seal: string, status: ContainerStatus, origin: RowOrigin): void => {
    const seen = byContainer.get(container)
    if (seen === undefined) {
      const row: OutputRow = { container, seal, status, origin, mentions: 1, sealConflict: false }
      rows.push(row)
      byContainer.set(container, row)
      return
    }

    seen.mentions += 1
    // Once the seal is contested it stays contested; a third mention cannot break the tie.
    if (seen.sealConflict) return
    if (seal === '' || seal === seen.seal) return
    if (seen.seal === '') {
      seen.seal = seal
      return
    }
    seen.seal = ''
    seen.sealConflict = true
  }

  // Pairings first, so a container that was paired anywhere keeps the 'pair' origin.
  for (const p of x.pairs) add(p.container.normalized ?? p.container.raw, p.seal?.raw ?? '', p.container.status, 'pair')
  for (const c of x.unpaired.containers) add(c.normalized ?? c.raw, '', c.status, 'unpaired_container')

  return rows
}

/** What the screen must state above the table, so an empty cell is never mistaken for a clean run. */
export interface OutputSummary {
  rows: number
  /** Rows whose seal cell is empty. */
  rowsWithoutSeal: number
  /** Seals that could not be attached to a container, and so appear in no row. */
  unpairedSeals: number
  /** Right shape, wrong ISO 6346 check digit. Never corrected, never dropped. */
  checkDigitFailures: number
  /** Not a container number shape at all. */
  malformed: number
  /** Repeat mentions of a container that collapsed onto a row already in the output. */
  duplicatesMerged: number
  /** Containers the source gave two different seals; their seal cell is blank, not guessed. */
  sealConflicts: number
}

export function summarizeOutput(x: Extraction): OutputSummary {
  const rows = outputRows(x)
  return {
    rows: rows.length,
    rowsWithoutSeal: rows.filter((r) => r.seal === '').length,
    unpairedSeals: x.unpaired.seals.length,
    checkDigitFailures: rows.filter((r) => r.status === 'invalid').length,
    malformed: rows.filter((r) => r.status === 'malformed').length,
    duplicatesMerged: rows.reduce((n, r) => n + r.mentions - 1, 0),
    sealConflicts: rows.filter((r) => r.sealConflict).length,
  }
}

/** Portal grids and Excel both split a pasted block on CRLF. */
const CRLF = '\r\n'

/**
 * Tab separated, two columns, no header row: this is pasted straight into a grid that
 * already has its own headings, so a header line here would land as a junk first row.
 * No trailing newline, for the same reason.
 */
export function formatTsv(x: Extraction): string {
  return outputRows(x)
    .map((r) => `${r.container}\t${r.seal}`)
    .join(CRLF)
}

/** RFC 4180 quoting. Container and seal numbers should never need it; correctness is cheap. */
const csvCell = (value: string): string =>
  /["\n\r,]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value

/** The same two columns as the table, with the provisional header row, CRLF as RFC 4180 asks. */
export function formatCsv(x: Extraction): string {
  const lines = [OUTPUT_COLUMNS.map(csvCell).join(','), ...outputRows(x).map((r) => [r.container, r.seal].map(csvCell).join(','))]
  return `${lines.join(CRLF)}${CRLF}`
}

/**
 * A file name Yigal can recognise in his downloads folder a day later. The booking ref comes
 * out of an email, so it is untrusted text: everything but letters, digits, dash and
 * underscore is collapsed to a dash, which leaves no dots and no separators to build a path
 * out of, and the result is capped so a runaway read cannot produce an unusable name.
 */
export function csvFileName(x: Extraction): string {
  const ref = (x.bookingRef.value ?? '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .slice(0, 40)
    .replace(/^-+|-+$/g, '')
  return ref === '' ? 'deckhand-containers.csv' : `deckhand-${ref}-containers.csv`
}
