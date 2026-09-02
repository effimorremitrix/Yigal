import type { IntegrationProvider } from '../../src/types'
import { IntegrationError } from './errors'

// Worker-side mirror of src/lib/api.ts: typed JSON calls, timeout, and vendor errors mapped to IntegrationError.
export interface HttpClient {
  get<T>(path: string, query?: Record<string, string>): Promise<T>
  post<T>(path: string, body: unknown): Promise<T>
}

export interface HttpClientOptions {
  provider: IntegrationProvider
  baseUrl: string
  headers: () => Promise<Record<string, string>> | Record<string, string>
  timeoutMs?: number
}

export function createHttpClient(opts: HttpClientOptions): HttpClient {
  const timeoutMs = opts.timeoutMs ?? 8000
  const base = opts.baseUrl.endsWith('/') ? opts.baseUrl : `${opts.baseUrl}/`

  async function call<T>(method: 'GET' | 'POST', path: string, query?: Record<string, string>, body?: unknown): Promise<T> {
    const url = new URL(path.replace(/^\//, ''), base)
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let res: Response
    try {
      res = await fetch(url.toString(), {
        method,
        headers: {
          accept: 'application/json',
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(await opts.headers()),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new IntegrationError(opts.provider, 'timeout', `${opts.provider} request timed out after ${timeoutMs} ms`)
      }
      // Never include headers in the message; the URL host is enough for diagnostics.
      throw new IntegrationError(opts.provider, 'network', `${opts.provider} request to ${url.host} failed: ${err instanceof Error ? err.message : 'network error'}`)
    } finally {
      clearTimeout(timer)
    }
    if (res.status === 401 || res.status === 403) {
      throw new IntegrationError(opts.provider, 'auth', `${opts.provider} rejected the credentials (HTTP ${res.status})`, res.status)
    }
    if (!res.ok) throw new IntegrationError(opts.provider, 'http', `${opts.provider} responded HTTP ${res.status}`, res.status)
    try {
      return (await res.json()) as T
    } catch {
      throw new IntegrationError(opts.provider, 'unmapped', `${opts.provider} returned a non-JSON response`)
    }
  }

  return {
    get: (path, query) => call('GET', path, query),
    post: (path, body) => call('POST', path, undefined, body),
  }
}
