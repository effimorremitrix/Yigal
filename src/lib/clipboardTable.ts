/**
 * The table the clipboard already has.
 *
 * When Yigal copies a booking table out of his mail client, the clipboard carries two
 * flavours of it: `text/html`, which is the real <table> with real rows and cells, and
 * `text/plain`, which is whatever that client could flatten it to. A <textarea> takes the
 * plain one and throws the other away — and the plain one, for most clients, is either one
 * cell per line or a run of spaces. The row structure is destroyed before Deckhand ever
 * sees it, and a container and its seal are no longer on the same line.
 *
 * So take the HTML flavour and cut it up ourselves. Every cell keeps the row it was in,
 * because the row is right there in the markup; nothing is inferred, counted or aligned.
 * The result is written into the box as tab separated text, which is both what the reader
 * on the server understands and what Yigal can see and check before he presses Extract.
 *
 * On safety: parseFromString builds a detached document. It runs no script, loads no
 * image, and fires no event. Nothing here touches anything but textContent and tagName.
 */

/** Cell text: HTML collapses whitespace, and a tab or newline inside a cell would split it. */
const cellText = (element: Element): string => (element.textContent ?? '').replace(/\s+/g, ' ').trim()

/** The table an element belongs to, so a table nested inside a layout table is read on its own. */
const ownerTable = (element: Element): Element | null => element.closest('table')

/**
 * The rows of one table, rectangular. A cell spanning several columns is expanded to that
 * many cells so everything below it stays in the column it was typed in.
 */
function rowsOf(table: Element): string[][] {
  const rows: string[][] = []
  for (const tr of Array.from(table.querySelectorAll('tr'))) {
    if (ownerTable(tr) !== table) continue
    const cells: string[] = []
    for (const cell of Array.from(tr.querySelectorAll('th, td'))) {
      if (ownerTable(cell) !== table) continue
      const span = Math.min(Math.max(Number(cell.getAttribute('colspan')) || 1, 1), 32)
      cells.push(cellText(cell))
      for (let i = 1; i < span; i += 1) cells.push('')
    }
    if (cells.length > 0) rows.push(cells)
  }

  const width = Math.max(...rows.map((row) => row.length), 0)
  return rows.map((row) => [...row, ...Array<string>(width - row.length).fill('')])
}

/** Tab separated, one row per line: the shape the table reader on the server is built for. */
export const toTsv = (rows: string[][]): string => rows.map((row) => row.join('\t')).join('\n')

/**
 * A table worth keeping: at least two rows and at least two columns, and some cell with text
 * in it. Mail clients use one-cell and one-column tables for layout, and turning those into
 * tab separated lines would only add noise.
 */
const isDataTable = (rows: string[][]): boolean =>
  rows.length >= 2 && (rows[0]?.length ?? 0) >= 2 && rows.some((row) => row.some((cell) => cell !== ''))

const BLOCK = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'BR', 'DD', 'DIV', 'DL', 'DT', 'FIELDSET', 'FIGURE',
  'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL',
  'P', 'PRE', 'SECTION', 'TABLE', 'TR', 'UL',
])
const SKIP = new Set(['HEAD', 'SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT'])

/** The visible text of a node, with a line break where the markup put one. */
function textOf(node: Node): string {
  if (node.nodeType === 3 /* text */) return (node.nodeValue ?? '').replace(/ /g, ' ')
  if (node.nodeType !== 1 /* element */) return ''
  const tag = (node as Element).tagName.toUpperCase()
  if (SKIP.has(tag)) return ''
  if (tag === 'BR') return '\n'
  let out = ''
  for (const child of Array.from(node.childNodes)) out += textOf(child)
  return BLOCK.has(tag) ? `${out}\n` : out
}

/** Collapse the whitespace HTML would have collapsed, without touching the tabs we inserted. */
const tidy = (text: string): string =>
  text
    .replace(/[^\S\t\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

export interface PastedTable {
  rows: number
  columns: number
}

export interface PastedHtml {
  /** The whole message as text, with every data table rewritten as tab separated rows. */
  text: string
  /** What was rewritten, so the page can say so rather than silently changing the paste. */
  tables: PastedTable[]
}

/**
 * Turn the `text/html` flavour of a paste into text, keeping its tables as tables.
 *
 * Returns null when there is no data table in it — there is then nothing to improve on, and
 * the browser's own paste is left to happen.
 */
export function readHtmlClipboard(html: string): PastedHtml | null {
  let document: Document
  try {
    document = new DOMParser().parseFromString(html, 'text/html')
  } catch {
    return null
  }

  const tables: PastedTable[] = []
  // Innermost first, so a data table is rewritten before the layout table wrapping it is
  // walked — by then it is already text, and its cells are not read a second time.
  const found = Array.from(document.querySelectorAll('table')).reverse()
  for (const table of found) {
    const rows = rowsOf(table)
    if (!isDataTable(rows)) continue
    tables.push({ rows: rows.length, columns: rows[0].length })
    table.replaceWith(document.createTextNode(`\n${toTsv(rows)}\n`))
  }

  if (tables.length === 0) return null
  const text = tidy(textOf(document.body))
  return text === '' ? null : { text, tables: tables.reverse() }
}
