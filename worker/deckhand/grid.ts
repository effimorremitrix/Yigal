import { normalizeContainer, validateContainer } from './containers'
import type { ContainerRef, Extraction, Field, Pairing, SealRef } from './types'

/**
 * Tables, read by column heading. Pure: no DOM, no network, no model call.
 *
 * Most of what Yigal is handed is a table — "GALCO | Container # | LOT# | SEAL# | BOOKING#"
 * and ten rows under it. A table is the strongest evidence a document can offer, because the
 * container and its seal are in one row by the author's own hand. Reading it needs no model,
 * so this runs first: it is instant, it costs nothing, and it cannot hallucinate a number.
 *
 * The one rule that governs the whole file, same as everywhere else in Deckhand:
 *
 *   a seal reaches a container only through the row they share.
 *
 * Columns are resolved from the HEADING, never from position, so a table that puts SEAL#
 * before Container # reads correctly and a table with no seal column yields rows with an
 * empty seal cell rather than the next column along.
 *
 * `reflow` below is the one place a row is rebuilt rather than read, and it is fenced in:
 * see the comment there for why it cannot produce a shifted row.
 */

/** 4 letters + 6 digits + check digit, tolerating the spacing people type. */
const CONTAINER_RE = /\b[A-Z]{4}[\s-]?\d{6}[\s-]?\d\b/gi

/**
 * A seal cell, once its own label is stripped. Seals follow no standard, so this is
 * deliberately loose — it only has to reject prose and empty cells, because the column
 * heading has already said that whatever is here is a seal.
 */
const SEAL_TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9/-]{1,23}$/

/** "Seal No: SL-1", "Seal - SL-1": a cell that repeats its own heading. */
const SEAL_LABEL_RE = /^\s*(?:carrier|shipper|line|cntr|container)?\s*seals?\s*(?:no\.?|number|nos\.?|#|id)?\s*[:\-]\s*/i

/**
 * Headings that name each column, normalized to letters and digits only so that
 * "Container #", "CONTAINER NO.", "Cntr-No" and "container_number" are one heading.
 */
const CONTAINER_HEADINGS = new Set([
  'container', 'containers', 'containerno', 'containernos', 'containernumber', 'containernumbers',
  'containernbr', 'containerid', 'containerunit', 'cntr', 'cntrno', 'cntrnumber',
  'equipment', 'equipmentno', 'equipmentnumber', 'equipmentid', 'unit', 'unitno', 'unitnumber',
  'box', 'boxno', 'boxnumber', 'van', 'vanno',
])
const SEAL_HEADINGS = new Set([
  'seal', 'seals', 'sealno', 'sealnos', 'sealnumber', 'sealnumbers', 'sealnbr', 'sealid',
  'carrierseal', 'carriersealno', 'carriersealnumber', 'lineseal', 'linesealno', 'cntrseal',
  'containerseal', 'containersealno', 'sealcarrier',
])
const SHIPPER_SEAL_HEADINGS = new Set(['shipperseal', 'shippersealno', 'shippersealnumber', 'shipperssealno'])
const BOOKING_HEADINGS = new Set([
  'booking', 'bookingno', 'bookingnos', 'bookingnumber', 'bookingref', 'bookingreference',
  'bkg', 'bkgno', 'bkgnumber', 'carrierbooking', 'carrierbookingno', 'carrierbookingnumber',
])

const normalizeHeading = (cell: string): string => cell.toLowerCase().replace(/[^a-z0-9]/g, '')

const findContainers = (text: string): string[] =>
  [...text.matchAll(new RegExp(CONTAINER_RE.source, CONTAINER_RE.flags))].map((m) => m[0])

/** How a line is cut into cells. Tried in this order; the first that finds a heading row wins. */
const DELIMITERS = [
  { id: 'tab', cut: (line: string): string[] => line.split('\t') },
  { id: 'pipe', cut: (line: string): string[] => line.split('|') },
  { id: 'spaces', cut: (line: string): string[] => line.split(/ {2,}/) },
] as const

/**
 * Markdown writes `| a | b |`, which cuts to an empty cell at each end, and follows the
 * heading with `|---|---|`. Both are formatting, not data.
 */
function cells(line: string, cut: (line: string) => string[]): string[] {
  const parts = cut(line).map((cell) => cell.trim())
  while (parts.length > 1 && parts[0] === '') parts.shift()
  while (parts.length > 1 && parts[parts.length - 1] === '') parts.pop()
  return parts
}

const isRule = (parts: string[]): boolean => parts.length > 1 && parts.every((cell) => /^:?-{2,}:?$/.test(cell))

export interface Columns {
  container: number
  seal: number | null
  shipperSeal: number | null
  booking: number | null
}

/**
 * A heading row: two or more cells, one of which names a container column, and no container
 * number anywhere in it. That last clause is what stops a data row being mistaken for a
 * heading when a column happens to be called "Container".
 *
 * A seal column is not required. A table of containers with no seals is a real table, and
 * its rows are worth having with an empty seal cell — far better than reaching into the next
 * column along to find something seal-shaped.
 */
export function columnsOf(parts: string[]): Columns | null {
  if (parts.length < 2) return null
  if (parts.some((cell) => findContainers(cell).length > 0)) return null
  const headings = parts.map(normalizeHeading)
  const container = headings.findIndex((h) => CONTAINER_HEADINGS.has(h))
  if (container === -1) return null
  const shipperSeal = headings.findIndex((h) => SHIPPER_SEAL_HEADINGS.has(h))
  const seal = headings.findIndex((h, i) => SEAL_HEADINGS.has(h) && i !== shipperSeal)
  const booking = headings.findIndex((h) => BOOKING_HEADINGS.has(h))
  return {
    container,
    seal: seal === -1 ? null : seal,
    shipperSeal: shipperSeal === -1 ? null : shipperSeal,
    booking: booking === -1 ? null : booking,
  }
}

/** The text of a seal cell, with a repeated heading stripped off it. '' when the cell holds no seal. */
export function sealIn(parts: string[], index: number | null): string {
  if (index === null) return ''
  const text = (parts[index] ?? '').replace(SEAL_LABEL_RE, '').trim()
  if (text === '' || !SEAL_TOKEN_RE.test(text)) return ''
  // A container number in the seal column is a mis-read column, not a seal.
  return normalizeContainer(text) === null ? text : ''
}

interface Row {
  container: string
  seal: string
  shipperSeal: string
  booking: string
}

/**
 * One data row, or null when this line is not one. A line belongs to the table only if its
 * container cell holds exactly one container number: that is what ends the table at the
 * blank line, the footer, or the sentence of prose underneath it.
 */
function rowOf(parts: string[], columns: Columns): Row | null {
  const found = findContainers(parts[columns.container] ?? '')
  if (found.length !== 1) return null
  return {
    container: found[0],
    seal: sealIn(parts, columns.seal),
    shipperSeal: sealIn(parts, columns.shipperSeal),
    booking: (parts[columns.booking ?? -1] ?? '').trim(),
  }
}

interface Table {
  columns: Columns
  rows: Row[]
  /** Which source lines the table used up, so the caller can tell whether any prose is left. */
  consumed: Set<number>
  shape: 'delimited' | 'reflowed'
}

/** A table whose rows are lines and whose cells are separated by a delimiter. */
function delimitedTable(lines: string[]): Table | null {
  for (const { cut } of DELIMITERS) {
    for (let head = 0; head < lines.length; head += 1) {
      const columns = columnsOf(cells(lines[head], cut))
      if (!columns) continue
      const rows: Row[] = []
      const consumed = new Set<number>([head])
      for (let i = head + 1; i < lines.length; i += 1) {
        const parts = cells(lines[i], cut)
        if (isRule(parts)) {
          consumed.add(i)
          continue
        }
        const row = rowOf(parts, columns)
        // One line that is not a row ends the table; a second table further down is read on
        // the next call, and prose below the table stays prose.
        if (!row) break
        rows.push(row)
        consumed.add(i)
      }
      if (rows.length > 0) return { columns, rows, consumed, shape: 'delimited' }
    }
  }
  return null
}

/** The widest table this will try to rebuild from a flattened paste. */
const MAX_REFLOW_WIDTH = 16

/**
 * A table that arrived one cell per line.
 *
 * Copying an HTML table out of some mail clients flattens it: every cell becomes its own
 * line and the row structure is gone. Rebuilding it means cutting the stream into rows of
 * N, which is pairing by position — the one thing Deckhand must never do on trust. So it is
 * not done on trust. The rebuild is accepted only when it proves itself:
 *
 *   - the heading is N cells on N consecutive lines and holds no container number;
 *   - no line carries a delimiter, so this really is one cell per line;
 *   - the cells after the heading are an exact multiple of N, so no cell was dropped;
 *   - EVERY rebuilt row has a container number in the container column, and every one of
 *     them passes its ISO 6346 check digit.
 *
 * A stream that is off by one cell fails the multiple; a stream off by a whole column puts
 * lot numbers and booking numbers in the container column, and they fail the check digit.
 * Either way the rebuild is abandoned whole — never half-applied — and the text goes to the
 * model instead. There is no partial credit here, because a row that is off by one is a seal
 * on the wrong container, which is the only outcome worse than no output at all.
 */
function reflowedTable(lines: string[]): Table | null {
  if (lines.some((line) => line.includes('\t') || line.includes('|') || / {2,}/.test(line))) return null

  for (let head = 0; head < lines.length; head += 1) {
    for (let width = 2; width <= MAX_REFLOW_WIDTH; width += 1) {
      if (head + width > lines.length) break
      const columns = columnsOf(lines.slice(head, head + width))
      if (!columns) continue

      const rows = reflowRows(lines.slice(head + width), width, columns)
      // This width does not hold. Another one may, and it will have to prove itself in
      // exactly the same way — a width is never accepted on anything less than every row.
      if (!rows) continue

      const consumed = new Set<number>()
      for (let i = head; i < lines.length; i += 1) consumed.add(i)
      return { columns, rows, consumed, shape: 'reflowed' }
    }
  }
  return null
}

/**
 * Cut `body` into rows of `width`, or refuse. All four guards are here: an exact multiple of
 * the width (nothing dropped), a container number in the container column of every row, and
 * a valid check digit on every one of them.
 */
function reflowRows(body: string[], width: number, columns: Columns): Row[] | null {
  if (body.length === 0 || body.length % width !== 0) return null
  const rows: Row[] = []
  for (let at = 0; at < body.length; at += width) {
    const row = rowOf(body.slice(at, at + width), columns)
    // Every row, or none: a rebuild that works for nine rows out of ten is a rebuild that
    // has silently shifted, not one that found nine good rows.
    if (!row || validateContainer(row.container) !== 'valid') return null
    rows.push(row)
  }
  return rows
}

const toContainerRef = (raw: string): ContainerRef => ({
  raw: raw.trim(),
  normalized: normalizeContainer(raw),
  status: validateContainer(raw),
  confidence: 'high',
})

const toSealRef = (raw: string): SealRef | null => (raw === '' ? null : { raw, confidence: 'high' })

export interface GridExtraction {
  pairs: Pairing[]
  /** The booking reference, when one column carried the same value down every row. */
  bookingRef: Field
  warnings: string[]
  /** Every non-blank line was part of the table, so there is no prose left for a model to read. */
  exhaustive: boolean
  shape: Table['shape']
}

/**
 * The booking column, but only when every row agrees. Ten rows of one booking number is a
 * fact about the shipment; two different numbers down the column is a table covering two
 * bookings, and picking one of them would be a guess.
 */
function bookingFrom(rows: Row[]): { field: Field; warning: string | null } {
  const values = [...new Set(rows.map((r) => r.booking).filter((v) => v !== ''))]
  if (values.length === 0) return { field: { value: null, confidence: 'unsure' }, warning: null }
  if (values.length === 1) return { field: { value: values[0], confidence: 'high' }, warning: null }
  return {
    field: { value: null, confidence: 'unsure' },
    warning: `The booking column holds ${values.length} different numbers (${values.join(', ')}), so none was taken as the booking reference.`,
  }
}

/**
 * Read the first container table in the text. Null when there is none, which is the signal
 * to fall through to the model.
 */
export function gridExtract(text: string): GridExtraction | null {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/ /g, ' ').trimEnd())
  const table = delimitedTable(lines) ?? reflowedTable(lines)
  if (!table) return null

  const pairs: Pairing[] = table.rows.map((row) => ({
    container: toContainerRef(row.container),
    // The carrier seal is the one INTTRA's Container Number / Seal Number pair wants. A
    // shipper seal column is read too, and reported, but it never stands in for a missing
    // carrier seal: they are different numbers on different bolts.
    seal: toSealRef(row.seal),
    evidence: 'same_row' as const,
  }))

  const warnings: string[] = []
  const booking = bookingFrom(table.rows)
  if (booking.warning) warnings.push(booking.warning)

  if (table.shape === 'reflowed') {
    warnings.push(
      `The table arrived one cell per line, so its ${table.rows.length} rows were rebuilt ${table.columns.container + 1} cells apart and every container number was checked against ISO 6346 before the rebuild was accepted. Read the rows against the email before you paste them.`,
    )
  }
  if (table.columns.seal === null) {
    warnings.push('The table has no seal column, so every row has an empty seal cell. None was taken from a neighbouring column.')
  }

  const withShipperOnly = table.rows.filter((row) => row.seal === '' && row.shipperSeal !== '').length
  if (withShipperOnly > 0) {
    warnings.push(
      `${withShipperOnly} row(s) have a shipper seal but no carrier seal. The shipper seal was not used in its place — fill those cells from the source.`,
    )
  }

  const bodyLines = lines.filter((line, i) => line.trim() !== '' && !table.consumed.has(i))
  return { pairs, bookingRef: booking.field, warnings, exhaustive: bodyLines.length === 0, shape: table.shape }
}

/** A container already accounted for, by its canonical form where it has one. */
const keyOf = (ref: ContainerRef): string => ref.normalized ?? ref.raw.toUpperCase()

/**
 * Fold a table into what the model read from the rest of the email.
 *
 * The table wins on seals, because a row the author typed is better evidence than a sentence
 * of prose, and because the same seal written twice in two formats ("UL-6611448" in the row,
 * "UL 6611448" in the sentence) would otherwise read as two different seals and blank the
 * cell. Everything the model found that the table did not mention is kept rather than
 * dropped — an email often names one more container in a sentence — and a seal the table
 * already used is not also reported as unpaired.
 *
 * A container the table already has, mentioned again in PROSE, keeps its mention but loses
 * its seal on the way in. That is what preserves the "named more than once" badge on the
 * output row while making it impossible for the prose to overrule the row.
 *
 * A model pairing for a container the table already has and that cites a table row as its
 * evidence is the same row read twice, so it is dropped outright. Keeping it would report an
 * email that named a container once as having named it twice, which is a warning about
 * nothing and teaches the reader to ignore the real ones.
 */
export function mergeGrid(base: Extraction, grid: GridExtraction): Extraction {
  const fromGrid = new Set(grid.pairs.map((p) => keyOf(p.container)))
  const sealsUsed = new Set(grid.pairs.map((p) => p.seal?.raw).filter((raw): raw is string => raw !== undefined))

  const extra = base.pairs
    .filter((p) => !(fromGrid.has(keyOf(p.container)) && p.evidence === 'same_row'))
    .map((p) => (fromGrid.has(keyOf(p.container)) ? { ...p, seal: null } : p))
  const pairs = [...grid.pairs, ...extra]
  const placed = new Set(pairs.map((p) => keyOf(p.container)))

  return {
    ...base,
    bookingRef: base.bookingRef.value === null ? grid.bookingRef : base.bookingRef,
    pairs,
    unpaired: {
      containers: base.unpaired.containers.filter((c) => !placed.has(keyOf(c))),
      seals: base.unpaired.seals.filter((s) => !sealsUsed.has(s.raw)),
    },
    warnings: [...grid.warnings, ...base.warnings],
    source: 'grid',
  }
}
