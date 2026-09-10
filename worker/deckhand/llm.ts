import Anthropic from '@anthropic-ai/sdk'
import { normalizeContainer, validateContainer } from './containers'
import {
  emptyExtraction,
  type Confidence,
  type ContainerRef,
  type ExtractInput,
  type Extraction,
  type Field,
  type PairEvidence,
  type Pairing,
  type SealRef,
} from './types'

const MODEL = 'claude-opus-5'
const MAX_TOKENS = 8000

const SYSTEM = `You read shipping documents and pull out the identifiers a freight operator would otherwise retype by hand.

Return ONLY a JSON object. No prose, no markdown, no code fences.

{
  "bookingRef":      { "value": string|null, "confidence": "high"|"low"|"unsure" },
  "vessel":          { "value": string|null, "confidence": "high"|"low"|"unsure" },
  "voyage":          { "value": string|null, "confidence": "high"|"low"|"unsure" },
  "portOfLoading":   { "value": string|null, "confidence": "high"|"low"|"unsure" },
  "portOfDischarge": { "value": string|null, "confidence": "high"|"low"|"unsure" },
  "pairs": [
    {
      "container": { "raw": string, "confidence": "high"|"low"|"unsure" },
      "seal":      { "raw": string, "confidence": "high"|"low"|"unsure" } | null,
      "evidence":  "same_row" | "same_line" | "same_block"
    }
  ],
  "unpaired": {
    "containers": [ { "raw": string, "confidence": "high"|"low"|"unsure" } ],
    "seals":      [ { "raw": string, "confidence": "high"|"low"|"unsure" } ]
  },
  "warnings": [ string ]
}

RULES, in order of importance:

1. NEVER invent a pairing between a container and a seal. Emit a pair ONLY when the document
   physically shows them together: the same table row ("same_row"), the same line of text
   ("same_line"), or the same labelled block such as "Container 2: ... Seal: ..."
   ("same_block"). State which one in "evidence".
2. If the document lists containers in one place and seals in another, with nothing tying a
   specific seal to a specific container, put them ALL in "unpaired" and add a warning. Do not
   match them by order, by count, or by position. Matching by position is the single worst
   thing you can do here. "unpaired" is a correct and preferred answer.
3. A container with no seal shown beside it is a pair with "seal": null. That is different from
   an unpaired container, which is one you could not place at all.
4. Never repair, complete or guess a character in a container or seal number. Copy it exactly
   as printed into "raw". If a character is unreadable, put the container in "unpaired" with
   confidence "unsure" and add a warning naming the problem.
5. Missing is a value. Use {"value": null, "confidence": "unsure"} rather than omitting a field.
6. Confidence is per field. Use "high" only for something you read directly and unambiguously.
7. Do not compute or comment on container check digits; that is validated separately.`

const PROMPT = 'Extract the shipping identifiers from this document. Return only the JSON object.'

/** Strip code fences and any stray prose around the object, then parse. */
function parseJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fenced ? fenced[1] : text).trim()
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) throw new Error('no JSON object in response')
  return JSON.parse(candidate.slice(start, end + 1))
}

const CONFIDENCES = new Set<Confidence>(['high', 'low', 'unsure'])
const EVIDENCE = new Set<PairEvidence>(['same_row', 'same_line', 'same_block'])

const asConfidence = (v: unknown): Confidence => (CONFIDENCES.has(v as Confidence) ? (v as Confidence) : 'unsure')
const asString = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

const asField = (v: unknown): Field => {
  const o = (v ?? {}) as Record<string, unknown>
  return { value: asString(o.value), confidence: asString(o.value) === null ? 'unsure' : asConfidence(o.confidence) }
}

/** Status is always recomputed here; the model is never trusted to validate a check digit. */
const asContainer = (v: unknown): ContainerRef | null => {
  const raw = asString((v as Record<string, unknown>)?.raw)
  if (raw === null) return null
  return { raw, normalized: normalizeContainer(raw), status: validateContainer(raw), confidence: asConfidence((v as Record<string, unknown>).confidence) }
}

const asSeal = (v: unknown): SealRef | null => {
  const raw = asString((v as Record<string, unknown>)?.raw)
  return raw === null ? null : { raw, confidence: asConfidence((v as Record<string, unknown>).confidence) }
}

function coerce(parsed: unknown): Extraction {
  const o = (parsed ?? {}) as Record<string, unknown>
  const out = emptyExtraction('llm')
  out.bookingRef = asField(o.bookingRef)
  out.vessel = asField(o.vessel)
  out.voyage = asField(o.voyage)
  out.portOfLoading = asField(o.portOfLoading)
  out.portOfDischarge = asField(o.portOfDischarge)

  const pairs: Pairing[] = []
  for (const p of Array.isArray(o.pairs) ? o.pairs : []) {
    const row = (p ?? {}) as Record<string, unknown>
    const container = asContainer(row.container)
    if (!container) continue
    // An unrecognised evidence value means the model did not tell us why it paired these.
    // Rather than trust it, demote the pair to unpaired further down.
    const evidence = EVIDENCE.has(row.evidence as PairEvidence) ? (row.evidence as PairEvidence) : null
    const seal = asSeal(row.seal)
    if (evidence === null && seal !== null) {
      out.unpaired.containers.push(container)
      out.unpaired.seals.push(seal)
      out.warnings.push(`A pairing for ${container.raw} arrived without evidence of where they appeared together, so it was not trusted.`)
      continue
    }
    pairs.push({ container, seal, evidence: evidence ?? 'same_line' })
  }
  out.pairs = pairs

  const unpaired = (o.unpaired ?? {}) as Record<string, unknown>
  for (const c of Array.isArray(unpaired.containers) ? unpaired.containers : []) {
    const ref = asContainer(c)
    if (ref) out.unpaired.containers.push(ref)
  }
  for (const s of Array.isArray(unpaired.seals) ? unpaired.seals : []) {
    const ref = asSeal(s)
    if (ref) out.unpaired.seals.push(ref)
  }

  for (const w of Array.isArray(o.warnings) ? o.warnings : []) {
    const text = asString(w)
    if (text) out.warnings.push(text)
  }
  if (out.unpaired.containers.length > 0 || out.unpaired.seals.length > 0) {
    out.warnings.push(
      `${out.unpaired.containers.length} container(s) and ${out.unpaired.seals.length} seal(s) could not be matched to each other and are NOT paired.`,
    )
  }
  for (const p of out.pairs) {
    if (p.container.status === 'invalid') out.warnings.push(`Container ${p.container.raw} fails its ISO 6346 check digit — retype it from the source.`)
    if (p.container.status === 'malformed') out.warnings.push(`"${p.container.raw}" is not a valid container number format — check it against the source.`)
  }
  return out
}

const contentFor = (input: ExtractInput): Anthropic.ContentBlockParam[] =>
  input.kind === 'text'
    ? [{ type: 'text', text: `${PROMPT}\n\n---\n${input.text}` }]
    : [
        input.mediaType === 'application/pdf'
          ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: input.base64 } }
          : { type: 'image', source: { type: 'base64', media_type: input.mediaType, data: input.base64 } },
        { type: 'text', text: PROMPT },
      ]

export async function llmExtract(apiKey: string, input: ExtractInput): Promise<Extraction> {
  const client = new Anthropic({ apiKey })
  let text: string
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM,
      messages: [{ role: 'user', content: contentFor(input) }],
    })
    if (response.stop_reason === 'refusal') {
      return emptyExtraction('llm', ['The model declined to read this document. Extract it by hand.'])
    }
    text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown error'
    return emptyExtraction('llm', [`Could not reach the extraction service (${detail}). Nothing was extracted — read the document by hand.`])
  }

  try {
    return coerce(parseJson(text))
  } catch {
    // A malformed response is reported as "everything unsure", never thrown: the page must
    // still render, and the human must still be told nothing was extracted.
    return emptyExtraction('llm', ['The extraction came back in a form this page could not read. Nothing below is trustworthy — read the document by hand.'])
  }
}
