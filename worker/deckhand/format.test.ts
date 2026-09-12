import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { normalizeContainer, validateContainer, withCheckDigit } from './containers'
import { OUTPUT_COLUMNS, csvFileName, formatCsv, formatTsv, outputRows, summarizeOutput } from './format'
import { emptyExtraction, type ContainerRef, type Extraction, type Pairing, type SealRef } from './types'

/**
 * These tests exist for one reason: the table and the file are read by a machine, so a seal
 * on the wrong container would be copied into a portal without anyone noticing. Every test
 * below is really the same assertion from a different angle — a seal only ever appears on
 * the row of the container it was extracted with.
 */

const container = (raw: string): ContainerRef => ({
  raw,
  normalized: normalizeContainer(raw),
  status: validateContainer(raw),
  confidence: 'high',
})

const seal = (raw: string): SealRef => ({ raw, confidence: 'high' })

const pair = (c: string, s: string | null): Pairing => ({
  container: container(c),
  seal: s === null ? null : seal(s),
  evidence: 'same_row',
})

const extraction = (parts: Partial<Extraction>): Extraction => ({ ...emptyExtraction('stub'), ...parts })

const tsvLines = (x: Extraction): string[] => {
  const tsv = formatTsv(x)
  return tsv === '' ? [] : tsv.split('\r\n')
}

const C1 = withCheckDigit('CSQU305438') // CSQU3054383
const C2 = withCheckDigit('TGHU765432')
const C3 = withCheckDigit('MSKU123456')

test('pairs only: one row each, in order, seal beside its own container', () => {
  const x = extraction({ pairs: [pair(C1, 'SL-44821'), pair(C2, 'SL-44822')] })

  assert.deepEqual(tsvLines(x), [`${C1}\tSL-44821`, `${C2}\tSL-44822`])
  assert.deepEqual(formatCsv(x).split('\r\n'), [`${OUTPUT_COLUMNS[0]},${OUTPUT_COLUMNS[1]}`, `${C1},SL-44821`, `${C2},SL-44822`, ''])

  const summary = summarizeOutput(x)
  assert.equal(summary.rows, 2)
  assert.equal(summary.rowsWithoutSeal, 0)
  assert.equal(summary.unpairedSeals, 0)
  assert.equal(summary.checkDigitFailures, 0)
})

test('a pairing with no seal keeps its row and leaves the cell empty', () => {
  const x = extraction({ pairs: [pair(C1, 'SL-44821'), pair(C2, null)] })

  // The empty cell is the point: the container is still submitted, the seal is visibly absent.
  assert.deepEqual(tsvLines(x), [`${C1}\tSL-44821`, `${C2}\t`])
  assert.ok(formatCsv(x).includes(`${C2},\r\n`))
  assert.equal(summarizeOutput(x).rowsWithoutSeal, 1)

  // And the seal that does exist has not slid onto the empty row.
  assert.ok(!formatTsv(x).includes(`${C2}\tSL-`))
})

test('unpaired containers get an empty-seal row; unpaired seals get no row at all', () => {
  const x = extraction({
    pairs: [pair(C1, 'SL-44821')],
    unpaired: { containers: [container(C2), container(C3)], seals: [seal('SL-99001'), seal('SL-99002')] },
  })

  const lines = tsvLines(x)
  assert.deepEqual(lines, [`${C1}\tSL-44821`, `${C2}\t`, `${C3}\t`])

  // The zip-by-index failure, stated directly: two loose containers and two loose seals is
  // exactly the shape that tempts a naive implementation into inventing two pairings.
  for (const s of ['SL-99001', 'SL-99002']) {
    assert.ok(!formatTsv(x).includes(s), `${s} was never paired and must not appear in the TSV`)
    assert.ok(!formatCsv(x).includes(s), `${s} was never paired and must not appear in the CSV`)
  }

  const summary = summarizeOutput(x)
  assert.equal(summary.rows, 3)
  assert.equal(summary.rowsWithoutSeal, 2)
  assert.equal(summary.unpairedSeals, 2)
  assert.equal(outputRows(x).filter((r) => r.origin === 'unpaired_container').length, 2)
})

test('a failed ISO 6346 check digit is carried through verbatim and counted, never repaired', () => {
  const broken = `${C2.slice(0, 10)}${(Number(C2[10]) + 1) % 10}`
  assert.equal(validateContainer(broken), 'invalid')

  const x = extraction({ pairs: [pair(C1, 'SL-44821'), pair(broken, 'SL-44822')] })

  assert.deepEqual(tsvLines(x), [`${C1}\tSL-44821`, `${broken}\tSL-44822`])
  assert.ok(!formatTsv(x).includes(C2), 'the valid number must not be substituted for the broken one')

  const rows = outputRows(x)
  assert.equal(rows[1].status, 'invalid') // what the screen flags in red
  assert.equal(summarizeOutput(x).checkDigitFailures, 1)
})

test('text that is not a container number shape is kept as written and counted as malformed', () => {
  const x = extraction({ pairs: [pair('MSKU12345', 'SL-1')] })

  assert.deepEqual(tsvLines(x), ['MSKU12345\tSL-1'])
  assert.equal(summarizeOutput(x).malformed, 1)
})

test('an extraction with nothing in it produces no rows rather than a blank one', () => {
  const x = emptyExtraction('stub')
  assert.equal(formatTsv(x), '')
  assert.deepEqual(tsvLines(x), [])
  assert.equal(formatCsv(x), `${OUTPUT_COLUMNS[0]},${OUTPUT_COLUMNS[1]}\r\n`)
  assert.equal(summarizeOutput(x).rows, 0)
})

test('a container named twice becomes one row, not a duplicate upload line', () => {
  // The depot list, then a sentence of prose naming the same box. One container, one row.
  const x = extraction({ pairs: [pair(C1, 'SL-44821'), pair(C2, 'SL-44822'), pair(C1, null)] })

  assert.deepEqual(tsvLines(x), [`${C1}\tSL-44821`, `${C2}\tSL-44822`])

  const rows = outputRows(x)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].mentions, 2)
  assert.equal(rows[0].seal, 'SL-44821', 'the mention that carried the seal wins over the one that did not')
  assert.equal(rows[0].sealConflict, false)
  assert.equal(summarizeOutput(x).duplicatesMerged, 1)
  assert.equal(summarizeOutput(x).rows, 2)
})

test('the seal fills in from whichever mention carried one, in either order', () => {
  // Prose first, list second: the merge must not depend on which came first.
  const x = extraction({ pairs: [pair(C1, null), pair(C1, 'SL-44821')] })

  assert.deepEqual(tsvLines(x), [`${C1}\tSL-44821`])
  assert.equal(summarizeOutput(x).rowsWithoutSeal, 0)
  assert.equal(summarizeOutput(x).duplicatesMerged, 1)
})

test('the same seal stated twice is not a conflict', () => {
  const x = extraction({ pairs: [pair(C1, 'SL-44821'), pair(C1, 'SL-44821')] })

  assert.deepEqual(tsvLines(x), [`${C1}\tSL-44821`])
  assert.equal(summarizeOutput(x).sealConflicts, 0)
  assert.equal(summarizeOutput(x).duplicatesMerged, 1)
})

test('two different seals for one container empties the cell rather than picking one', () => {
  const x = extraction({ pairs: [pair(C1, 'SL-44821'), pair(C1, 'SL-99999')] })

  // Neither seal is used. Picking either would be the exact failure this whole module exists
  // to prevent, and a blank cell is recoverable where a wrong seal is not.
  assert.deepEqual(tsvLines(x), [`${C1}\t`])
  assert.ok(!formatTsv(x).includes('SL-44821'))
  assert.ok(!formatTsv(x).includes('SL-99999'))

  const rows = outputRows(x)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].sealConflict, true)
  assert.equal(rows[0].mentions, 2)

  const summary = summarizeOutput(x)
  assert.equal(summary.sealConflicts, 1)
  assert.equal(summary.rowsWithoutSeal, 1)
})

test('a third mention cannot break a tie that is already contested', () => {
  const x = extraction({ pairs: [pair(C1, 'SL-44821'), pair(C1, 'SL-99999'), pair(C1, 'SL-44821')] })

  assert.deepEqual(tsvLines(x), [`${C1}\t`])
  assert.equal(outputRows(x)[0].sealConflict, true)
  assert.equal(summarizeOutput(x).duplicatesMerged, 2)
})

test('a container that is both paired and listed unpaired keeps the pairing', () => {
  const x = extraction({
    pairs: [pair(C1, 'SL-44821')],
    unpaired: { containers: [container(C1), container(C2)], seals: [] },
  })

  assert.deepEqual(tsvLines(x), [`${C1}\tSL-44821`, `${C2}\t`])

  const rows = outputRows(x)
  assert.equal(rows[0].origin, 'pair', 'paired anywhere means paired')
  assert.equal(rows[0].seal, 'SL-44821')
  assert.equal(rows[1].origin, 'unpaired_container')
})

test('merging never invents a pairing across two different containers', () => {
  // The guard rail: distinct containers stay distinct no matter how the seals fall.
  const x = extraction({ pairs: [pair(C1, null), pair(C2, 'SL-44822'), pair(C3, null)] })

  assert.deepEqual(tsvLines(x), [`${C1}\t`, `${C2}\tSL-44822`, `${C3}\t`])
  assert.equal(summarizeOutput(x).duplicatesMerged, 0)
})

test('every row is exactly two columns and the line endings are CRLF', () => {
  const x = extraction({
    pairs: [pair(C1, 'SL-44821'), pair(C2, null)],
    unpaired: { containers: [container(C3)], seals: [seal('SL-9')] },
  })

  const tsv = formatTsv(x)
  assert.ok(!/(^|[^\r])\n/.test(tsv), 'a bare LF would land as one cell, not one row')
  for (const line of tsvLines(x)) assert.equal(line.split('\t').length, 2)
  for (const line of formatCsv(x).split('\r\n').slice(0, -1)) assert.equal(line.split(',').length, 2)
})

test('a value carrying a comma or a quote is quoted in the CSV, not silently split', () => {
  // No seal should ever look like this, which is exactly why it must not break the file.
  const x = extraction({ pairs: [pair(C1, 'SL-1, SL-2'), pair(C2, 'SL-"3"')] })

  const rows = formatCsv(x).split('\r\n')
  assert.equal(rows[1], `${C1},"SL-1, SL-2"`)
  assert.equal(rows[2], `${C2},"SL-""3"""`)
  // The TSV needs no quoting: a comma is not its delimiter.
  assert.ok(formatTsv(x).includes(`${C1}\tSL-1, SL-2`))
})

test('the file name carries the booking ref when there is one', () => {
  assert.equal(csvFileName(emptyExtraction('stub')), 'deckhand-containers.csv')
  assert.equal(
    csvFileName(extraction({ bookingRef: { value: 'TL-2026-0042', confidence: 'high' } })),
    'deckhand-TL-2026-0042-containers.csv',
  )
  // A booking ref read out of an email is untrusted text; it must not shape a path.
  const hostile = csvFileName(extraction({ bookingRef: { value: '../../etc/passwd', confidence: 'low' } }))
  assert.equal(hostile, 'deckhand-etc-passwd-containers.csv')
  assert.ok(!hostile.includes('/') && !hostile.includes('..'))
})
