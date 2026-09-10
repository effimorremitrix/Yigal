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
 */
export async function extract(apiKey: string | undefined, input: ExtractInput): Promise<Extraction> {
  if (apiKey) return llmExtract(apiKey, input)

  if (input.kind === 'file') {
    return emptyExtraction('stub', [
      'PDFs and photographs need the extraction service, which is not configured on this deployment (ANTHROPIC_API_KEY is unset). Paste the text instead.',
    ])
  }
  return stubExtract(input.text)
}
