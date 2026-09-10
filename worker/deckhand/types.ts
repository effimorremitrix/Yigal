import type { ContainerStatus } from './containers'

/**
 * Per field, never one overall score. `unsure` is a first-class answer and is printed.
 */
export type Confidence = 'high' | 'low' | 'unsure'

/**
 * A value the extractor was asked for. `value: null` means it was not found, and it is
 * still rendered — missing is a value, never a silently dropped field.
 */
export interface Field {
  value: string | null
  confidence: Confidence
}

export const missing = (): Field => ({ value: null, confidence: 'unsure' })

export interface ContainerRef {
  /** Exactly as it appeared in the source, so a human can find it again. */
  raw: string
  /** Canonical form, or null when the text is not the ISO 6346 shape. */
  normalized: string | null
  status: ContainerStatus
  confidence: Confidence
}

/** Seal numbers follow no standard and carry no check digit, so there is no status here. */
export interface SealRef {
  raw: string
  confidence: Confidence
}

/**
 * Why this container and this seal are believed to belong together. A pairing cannot be
 * constructed without stating its evidence, which is what stops "they were both in the
 * email, in order" from ever becoming a pairing. There is deliberately no value meaning
 * "same position in two lists": pairing by array index is the one failure that matters.
 */
export type PairEvidence =
  | 'same_row' // one row of a table
  | 'same_line' // one line of text
  | 'same_block' // one labelled block, e.g. "Container 1:" ... "Seal:"

export interface Pairing {
  container: ContainerRef
  /** null when the source showed this container with no seal beside it. */
  seal: SealRef | null
  evidence: PairEvidence
}

/**
 * Containers and seals the source did not show adjacent to each other. They are reported
 * separately, with a warning, and are never zipped together for the sake of a tidier
 * output: a seal on the wrong container is worse than no output at all.
 */
export interface Unpaired {
  containers: ContainerRef[]
  seals: SealRef[]
}

export interface Extraction {
  bookingRef: Field
  vessel: Field
  voyage: Field
  portOfLoading: Field
  portOfDischarge: Field
  pairs: Pairing[]
  unpaired: Unpaired
  /** Anything the reader must know before trusting the block above. */
  warnings: string[]
  source: 'stub' | 'llm'
}

export const emptyExtraction = (source: Extraction['source'], warnings: string[] = []): Extraction => ({
  bookingRef: missing(),
  vessel: missing(),
  voyage: missing(),
  portOfLoading: missing(),
  portOfDischarge: missing(),
  pairs: [],
  unpaired: { containers: [], seals: [] },
  warnings,
  source,
})

/** What the page sends: pasted text, or one uploaded document. */
export type ExtractInput =
  | { kind: 'text'; text: string }
  | { kind: 'file'; mediaType: 'application/pdf' | 'image/jpeg' | 'image/png'; base64: string }
