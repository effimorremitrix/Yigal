import type { IntegrationProvider } from '../../src/types'
import { HttpError } from '../env'

export type IntegrationErrorCode = 'disabled' | 'no_credentials' | 'timeout' | 'network' | 'auth' | 'http' | 'unmapped' | 'not_implemented'

export class IntegrationError extends Error {
  constructor(
    public provider: IntegrationProvider,
    public code: IntegrationErrorCode,
    message: string,
    public status?: number,
  ) {
    super(message)
  }
}

const HTTP_STATUS: Record<IntegrationErrorCode, number> = {
  disabled: 503,
  no_credentials: 503,
  timeout: 504,
  network: 502,
  auth: 502,
  http: 502,
  unmapped: 502,
  not_implemented: 501,
}

// Route layer: turn adapter failures into the JSON error shape the SPA already understands.
export function toHttpError(err: unknown): HttpError {
  if (err instanceof HttpError) return err
  if (err instanceof IntegrationError) return new HttpError(HTTP_STATUS[err.code], err.message)
  console.error(err)
  return new HttpError(502, 'Integration call failed')
}
