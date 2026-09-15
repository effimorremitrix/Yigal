import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { extract } from './extract'
import { gridExtract, mergeGrid } from './grid'
import { formatTsv, outputRows } from './format'
import { emptyExtraction } from './types'

/**
 * The real table. Copied out of a "DOC CUT" email: ten containers, ten seals, a booking
 * number repeated down the column, and three columns of the sender's own bookkeeping that
 * must not be mistaken for any of it.
 *
 * Every container number here passes its ISO 6346 check digit, which is what makes this a
 * fair test of the reflow guard — the guard is allowed to accept it.
 */
const HEAD = ['GALCO', 'Container #', 'LOT#:', 'SEAL#', 'BOOKING#', 'VERITY']
const ROWS = [
  ['3671', 'MSNU7007075', 'HS03874', 'UL-6611448', 'EBKG15117043', 'CT SSR 23/25'],
  ['3671.01', 'MSNU9690566', 'HS03875', 'UL-6611449', 'EBKG15117043', 'CT SSR 23/25'],
  ['3671.02', 'FFAU1762240', 'HS03876', 'UL-7687051', 'EBKG15117043', 'CT SSR 23/25'],
  ['3671.03', 'TGBU4625141', 'HS03877', 'UL-7687052', 'EBKG15117043', 'CT SSR 23/25'],
  ['3671.04', 'FFAU1945597', 'HS03878', 'UL-7687053', 'EBKG15117043', 'CT SSR 23/25'],
  ['3671.05', 'MSDU7406753', 'HS03879', 'UL-7687054', 'EBKG15117043', 'CT SSR 23/25'],
  ['3671.06', 'MSNU5805374', 'HS03880', 'UL-7687055', 'EBKG15117043', 'CT SSR 23/25'],
  ['3671.07', 'MSMU6012880', 'HS03881', 'UL-7687056', 'EBKG15117043', 'CT SSR 23/25'],
  ['3671.08', 'UETU7107482', 'HS03882', 'UL-7687057', 'EBKG15117043', 'CT SSR 23/25'],
  ['3671.09', 'MEDU7391281', 'HS03883', 'UL-7687058', 'EBKG15117043', 'CT SSR 23/25'],
]

const EXPECTED = ROWS.map((r) => [r[1], r[3]])

const tabbed = [HEAD, ...ROWS].map((r) => r.join('\t')).join('\n')
const piped = [HEAD, ...ROWS].map((r) => `| ${r.join(' | ')} |`).join('\n')
const spaced = [HEAD, ...ROWS].map((r) => r.map((c) => c.padEnd(16)).join('')).join('\n')
/** One cell per line: what some mail clients put on the clipboard for an HTML table. */
const flattened = [...HEAD, ...ROWS.flat()].join('\n')

const pairsOf = (text: string) => {
  const grid = gridExtract(text)
  assert.ok(grid, 'expected a table to be recognised')
  return grid.pairs.map((p) => [p.container.normalized ?? p.container.raw, p.seal?.raw ?? ''])
}

for (const [shape, text] of [
  ['tab separated', tabbed],
  ['pipe separated', piped],
  ['aligned with spaces', spaced],
  ['flattened to one cell per line', flattened],
] as const) {
  test(`reads every container AND its seal from a table ${shape}`, () => {
    assert.deepEqual(pairsOf(text), EXPECTED)
  })
}

test('the seal column is found by its heading, with no colon after it', () => {
  // This is the defect the DOC CUT paste hit: "SEAL#" is a heading, not "Seal No: ...",
  // so every seal was invisible and ten containers came out with empty seal cells.
  const grid = gridExtract(tabbed)
  assert.equal(grid?.pairs.filter((p) => p.seal !== null).length, 10)
})

test('every pairing states the row it came from', () => {
  for (const pair of gridExtract(tabbed)!.pairs) assert.equal(pair.evidence, 'same_row')
})

test('columns are read by heading, not by position', () => {
  const swapped = [
    ['SEAL#', 'BOOKING#', 'Container #'].join('\t'),
    ['UL-6611448', 'EBKG15117043', 'MSNU7007075'].join('\t'),
  ].join('\n')
  assert.deepEqual(pairsOf(swapped), [['MSNU7007075', 'UL-6611448']])
})

test('takes the booking number when the whole column agrees', () => {
  assert.deepEqual(gridExtract(tabbed)?.bookingRef, { value: 'EBKG15117043', confidence: 'high' })
})

test('refuses the booking number when the column disagrees', () => {
  const mixed = [HEAD, ROWS[0], [...ROWS[1].slice(0, 4), 'EBKG99999999', ROWS[1][5]]].map((r) => r.join('\t')).join('\n')
  const grid = gridExtract(mixed)
  assert.equal(grid?.bookingRef.value, null)
  assert.match(grid!.warnings.join(' '), /2 different numbers/)
})

test('a table with no seal column yields empty seal cells, never the next column along', () => {
  const noSeal = [
    ['Container #', 'LOT#:', 'BOOKING#'].join('\t'),
    ['MSNU7007075', 'HS03874', 'EBKG15117043'].join('\t'),
  ].join('\n')
  assert.deepEqual(pairsOf(noSeal), [['MSNU7007075', '']])
  assert.match(gridExtract(noSeal)!.warnings.join(' '), /no seal column/)
})

test('a seal cell that repeats its own label is stripped to the number', () => {
  const labelled = ['Container      | Seal', 'CSQU3054383    | Seal No: SL-44821'].join('\n')
  assert.deepEqual(pairsOf(labelled), [['CSQU3054383', 'SL-44821']])
})

test('a shipper seal never stands in for a missing carrier seal', () => {
  const both = [
    ['Container #', 'Seal No', 'Shipper Seal No'].join('\t'),
    ['MSNU7007075', '', 'SH-1'].join('\t'),
  ].join('\n')
  assert.deepEqual(pairsOf(both), [['MSNU7007075', '']])
  assert.match(gridExtract(both)!.warnings.join(' '), /shipper seal but no carrier seal/)
})

test('prose under the table is left for the model, and the table is not exhaustive', () => {
  const withProse = `Subject: DOC CUT\n\n${tabbed}\n\nVessel: Meridian Aurora   Voyage: 12E`
  const grid = gridExtract(withProse)
  assert.equal(grid?.pairs.length, 10)
  assert.equal(grid?.exhaustive, false)
})

test('a paste that is nothing but the table needs no model call', async () => {
  // extract() is given no API key AND the stub would find no seals here; if the result has
  // ten seals, it came from the table reader alone.
  const out = await extract(undefined, { kind: 'text', text: tabbed })
  assert.equal(out.source, 'grid')
  assert.equal(out.pairs.filter((p) => p.seal !== null).length, 10)
})

test('two columns, tab separated, is exactly what goes into the portal grid', async () => {
  const out = await extract(undefined, { kind: 'text', text: tabbed })
  assert.deepEqual(
    formatTsv(out).split('\r\n'),
    EXPECTED.map(([container, seal]) => `${container}\t${seal}`),
  )
  assert.equal(outputRows(out).filter((r) => r.seal === '').length, 0)
})

/* The reflow guard. Each of these must fail closed rather than produce a shifted row. */

test('refuses a flattened table with a cell missing', () => {
  const short = [...HEAD, ...ROWS.flat().slice(0, -1)].join('\n')
  assert.equal(gridExtract(short), null)
})

test('refuses a flattened table when a whole column of cells went missing', () => {
  // Drop the VERITY cell from every row: the count still divides by 6, but the rows shift
  // and the container column stops holding container numbers.
  const dropped = [...HEAD, ...ROWS.flatMap((r) => r.slice(0, 5))].join('\n')
  assert.equal(gridExtract(dropped), null)
})

test('refuses a flattened table when one container fails its check digit', () => {
  const broken = ROWS.map((r, i) => (i === 4 ? [...r.slice(0, 1), 'FFAU1945598', ...r.slice(2)] : r))
  assert.equal(gridExtract([...HEAD, ...broken.flat()].join('\n')), null)
})

test('a delimited table still reports a failed check digit rather than dropping the row', () => {
  const broken = [HEAD, [...ROWS[0].slice(0, 1), 'FFAU1945598', ...ROWS[0].slice(2)]].map((r) => r.join('\t')).join('\n')
  const grid = gridExtract(broken)
  assert.equal(grid?.pairs.length, 1)
  assert.equal(grid?.pairs[0].container.status, 'invalid')
})

test('no table at all falls through to the model', () => {
  assert.equal(gridExtract('Containers: CSQU3054383, TGHU7654320\nSeals: SL-44821, SL-44822'), null)
})

/* The merge. */

test('a container the model found outside the table is kept, not dropped', () => {
  const base = emptyExtraction('llm')
  base.pairs = [{ container: { raw: 'CSQU3054383', normalized: 'CSQU3054383', status: 'valid', confidence: 'high' }, seal: null, evidence: 'same_line' }]
  const merged = mergeGrid(base, gridExtract(tabbed)!)
  assert.equal(merged.pairs.length, 11)
  assert.equal(merged.pairs[10].container.raw, 'CSQU3054383')
})

test('prose repeating a container the table has cannot overrule the row it came from', () => {
  const base = emptyExtraction('llm')
  // The same container, read out of a sentence, with the seal written a different way.
  base.pairs = [
    {
      container: { raw: 'MSNU7007075', normalized: 'MSNU7007075', status: 'valid', confidence: 'high' },
      seal: { raw: 'UL 6611448', confidence: 'low' },
      evidence: 'same_line',
    },
  ]
  const rows = outputRows(mergeGrid(base, gridExtract(tabbed)!))
  const row = rows.find((r) => r.container === 'MSNU7007075')!
  assert.equal(row.seal, 'UL-6611448', 'the table row wins')
  assert.equal(row.sealConflict, false, 'and the two spellings must not blank the cell')
  // The repeat is still reported, because one row out of two mentions is worth knowing.
  assert.equal(row.mentions, 2)
  assert.equal(rows.length, 10)
})

test('the same table row read twice is one mention, not two', () => {
  const base = emptyExtraction('llm')
  // A model that read the same table reports the same row. That is not a second mention.
  base.pairs = [
    {
      container: { raw: 'MSNU7007075', normalized: 'MSNU7007075', status: 'valid', confidence: 'high' },
      seal: { raw: 'UL-6611448', confidence: 'high' },
      evidence: 'same_row',
    },
  ]
  const rows = outputRows(mergeGrid(base, gridExtract(tabbed)!))
  assert.equal(rows.length, 10)
  assert.equal(rows.find((r) => r.container === 'MSNU7007075')!.mentions, 1)
})

test('a seal the table already used is not also reported as unpaired', () => {
  const base = emptyExtraction('llm')
  base.unpaired.seals = [{ raw: 'UL-6611448', confidence: 'low' }, { raw: 'SL-99001', confidence: 'low' }]
  const merged = mergeGrid(base, gridExtract(tabbed)!)
  assert.deepEqual(merged.unpaired.seals.map((s) => s.raw), ['SL-99001'])
})

test('a container the table read is not also reported as unpaired', () => {
  const base = emptyExtraction('llm')
  base.unpaired.containers = [{ raw: 'MSNU7007075', normalized: 'MSNU7007075', status: 'valid', confidence: 'low' }]
  assert.deepEqual(mergeGrid(base, gridExtract(tabbed)!).unpaired.containers, [])
})
