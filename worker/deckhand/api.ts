import { HttpError, json, type Env, type SessionUser } from '../env'
import { extract } from './extract'
import { formatBlock } from './format'
import type { ExtractInput } from './types'

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const ACCEPTED = ['application/pdf', 'image/jpeg', 'image/png'] as const
type Accepted = (typeof ACCEPTED)[number]

const toBase64 = (bytes: Uint8Array): string => {
  // Chunked so a 5 MB file does not blow the argument limit on String.fromCharCode.
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(binary)
}

async function readInput(request: Request): Promise<ExtractInput> {
  const contentType = request.headers.get('content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) throw new HttpError(400, 'Attach one file, or send { "text": "..." } instead')
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new HttpError(413, `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is 5 MB. Paste the text instead.`)
    }
    if (!(ACCEPTED as readonly string[]).includes(file.type)) {
      throw new HttpError(415, `Unsupported file type "${file.type || 'unknown'}". Accepted: PDF, JPEG, PNG.`)
    }
    return { kind: 'file', mediaType: file.type as Accepted, base64: toBase64(new Uint8Array(await file.arrayBuffer())) }
  }

  const body = (await request.json().catch(() => null)) as { text?: unknown } | null
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  if (text === '') throw new HttpError(400, 'Paste the email text, or attach a PDF or photo')
  if (text.length > 200_000) throw new HttpError(413, 'That text is too long — paste the relevant part of the email')
  return { kind: 'text', text }
}

/**
 * POST /api/deckhand/extract — stateless by design. It reads nothing from D1, writes nothing
 * to D1, and stores nothing anywhere: the output is read by a human and copied by hand.
 * `user` is required for the access gate only.
 */
export async function extractIdentifiers(env: Env, _user: SessionUser, request: Request): Promise<Response> {
  const input = await readInput(request)
  const extraction = await extract(env.ANTHROPIC_API_KEY, input)
  return json({ extraction, block: formatBlock(extraction) })
}
