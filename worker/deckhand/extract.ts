import { gridExtract, mergeGrid } from './grid'
import { llmExtract } from './llm'
import { stubExtract } from './stub'
import { emptyExtraction, type ExtractInput, type Extraction } from './types'

/**
 * Resolves the extractor the same way the connectors resolve live vs mock: the capable
 * implementation only when it has what it needs, otherwise the deterministic one.
 *
 * ANTHROPIC_API_KEY arrives as a wrangler secret. It is never read anywhere else, never
 * returned by any endpoint, and deliberately does not live in integration_credentials —
 * that would mean registering a provider and adding a migration, neither of which v0 needs.
 *
 * The table is read FIRST, before any of that.
 *
 * Most of what arrives is a pasted table, and a table already states which column is the
 * container and which is the seal. Reading it by its headings is exact, instant and free,
 * and it cannot invent a number. A model asked to read the same table can only match that,
 * never beat it — and when the paste has been flattened on its way out of the mail client,
 * the model is rightly reluctant to pair anything at all, which is how a seal column goes
 * missing from the output.
 *
 * So: read the table, and call the model only for what is left. When the paste is nothing
 * but the table, there is nothing left and no model call is made.
 */
export async function extract(apiKey: string | undefined, input: ExtractInput): Promise<Extraction> {
  if (input.kind === 'file') {
    if (apiKey) return llmExtract(apiKey, input)
    return emptyExtraction('stub', [
      'PDFs and photographs need the extraction service, which is not configured on this deployment (ANTHROPIC_API_KEY is unset). Paste the text instead.',
    ])
  }

  const grid = gridExtract(input.text)

  // A paste that is nothing but the table: every identifier it holds has been read already,
  // by its own headings. Sending it to a model could only make it worse.
  if (grid?.exhaustive) {
    return mergeGrid(emptyExtraction(apiKey ? 'llm' : 'stub'), grid)
  }

  const rest = apiKey ? await llmExtract(apiKey, input) : stubExtract(input.text)
  return grid ? mergeGrid(rest, grid) : rest
}
