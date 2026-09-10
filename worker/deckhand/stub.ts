import { normalizeContainer, validateContainer } from './containers'
import { emptyExtraction, type ContainerRef, type Extraction, type Field, type Pairing, type SealRef } from './types'

/**
 * Deterministic extractor: regexes and line shape, no model call. Used whenever no API key
 * is configured and always in e2e, so the suite stays byte-stable.
 *
 * It will pass its own tests and generalize poorly. That is the point of it — it is the
 * offline floor, not evidence the feature works. Real emails are the only evidence.
 */

// 4 letters + 6 digits + check digit, tolerating the spacing people type.
const CONTAINER_RE = /\b[A-Z]{4}[\s-]?\d{6}[\s-]?\d\b/gi
// Seals have no standard shape, so they are only recognised when they are labelled.
const SEAL_LABEL_RE = /\bseals?\s*(?:no\.?|number|#)?\s*[:\-]\s*(.+)$/i
const SEAL_TOKEN_RE = /^[A-Z0-9][A-Z0-9-]{3,19}$/i

const labelled = (text: string, labels: string[]): Field => {
  for (const label of labels) {
    const re = new RegExp(`${label}\\s*(?:no\\.?|number|#)?\\s*[:\\-]\\s*([^\\n\\r|]{2,60})`, 'i')
    const m = text.match(re)
    if (m) {
      // One line often carries two labels ("Vessel: X    Voyage: 12E"). Stop at a run of
      // spaces or at the next label so the first value does not swallow the second.
      const value = m[1]
        .split(/\s{2,}|\t/)[0]
        .split(/\b(?:voyage|voy|vessel|seal|container|eta|etd|pod|pol)\b\s*[:\-]/i)[0]
        .trim()
        .replace(/[.,;]$/, '')
      if (value) return { value, confidence: 'high' }
    }
  }
  return { value: null, confidence: 'unsure' }
}

const toContainerRef = (raw: string, confidence: ContainerRef['confidence'] = 'high'): ContainerRef => ({
  raw: raw.trim(),
  normalized: normalizeContainer(raw),
  status: validateContainer(raw),
  confidence,
})

const findAll = (line: string, re: RegExp): string[] => [...line.matchAll(new RegExp(re.source, re.flags))].map((m) => m[0])

/**
 * Seals are only recognised behind a label, because they have no distinguishing shape.
 * "Seals: SL-1, SL-2" is a list of two, which is why this takes the rest of the line and
 * splits it rather than capturing a single token.
 */
const findSeals = (line: string): string[] => {
  const m = line.match(SEAL_LABEL_RE)
  if (!m) return []
  return m[1]
    .split(/[,;]|\s{2,}|\s*\|\s*|\s+and\s+/i)
    .map((t) => t.trim())
    .filter((t) => SEAL_TOKEN_RE.test(t))
}

/** A line that looks like a table row: two or more columns separated by | or a run of spaces/tabs. */
const isTableRow = (line: string): boolean => /\|/.test(line) || /\S(?:\t| {2,})\S/.test(line)

export function stubExtract(text: string): Extraction {
  const out = emptyExtraction('stub')
  const lines = text.split(/\r?\n/)

  out.bookingRef = labelled(text, ['booking\\s*(?:ref(?:erence)?)?', 'shipment\\s*(?:ref(?:erence)?|id)', 'b/?l'])
  out.vessel = labelled(text, ['vessel', 'ship', 'm/?v'])
  out.voyage = labelled(text, ['voyage', 'voy'])
  out.portOfLoading = labelled(text, ['port\\s*of\\s*loading', 'pol', 'load\\s*port', 'origin'])
  out.portOfDischarge = labelled(text, ['port\\s*of\\s*discharge', 'pod', 'discharge\\s*port', 'destination'])

  const pairs: Pairing[] = []
  const looseContainers: ContainerRef[] = []
  const looseSeals: SealRef[] = []

  for (const line of lines) {
    const containers = findAll(line, CONTAINER_RE)
    const seals = findSeals(line)

    // Exactly one of each on one line is the only shape that proves they belong together.
    if (containers.length === 1 && seals.length === 1) {
      pairs.push({
        container: toContainerRef(containers[0]),
        seal: { raw: seals[0], confidence: 'high' },
        evidence: isTableRow(line) ? 'same_row' : 'same_line',
      })
      continue
    }

    // One container alone on its line is a pairing with no seal, which is a fact worth stating.
    if (containers.length === 1 && seals.length === 0) {
      pairs.push({ container: toContainerRef(containers[0]), seal: null, evidence: isTableRow(line) ? 'same_row' : 'same_line' })
      continue
    }

    // Several of either on one line: no positional evidence, so nothing is paired.
    for (const c of containers) looseContainers.push(toContainerRef(c, 'low'))
    for (const s of seals) looseSeals.push({ raw: s, confidence: 'low' })
  }

  out.pairs = pairs
  out.unpaired = { containers: looseContainers, seals: looseSeals }

  if (looseContainers.length > 0 || looseSeals.length > 0) {
    out.warnings.push(
      `${looseContainers.length} container(s) and ${looseSeals.length} seal(s) were not shown next to each other, so they are listed separately and NOT paired. Check them against the source before use.`,
    )
  }
  // A seal count that does not match the container count is worth saying out loud even
  // when everything paired cleanly, because it usually means one was missed.
  const sealed = pairs.filter((p) => p.seal !== null).length
  if (pairs.length > 0 && sealed !== pairs.length) {
    out.warnings.push(`${pairs.length - sealed} of ${pairs.length} container(s) have no seal number in this document.`)
  }
  for (const p of pairs) {
    if (p.container.status === 'invalid') {
      out.warnings.push(`Container ${p.container.raw} fails its ISO 6346 check digit — retype it from the source.`)
    }
  }
  if (pairs.length === 0 && looseContainers.length === 0) {
    out.warnings.push('No container numbers were recognised in this text.')
  }
  return out
}
