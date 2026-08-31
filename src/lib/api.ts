export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

let onUnauthorized: (() => void) | null = null
export const setUnauthorizedHandler = (fn: (() => void) | null) => {
  onUnauthorized = fn
}

export async function apiFetch<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json: jsonBody, ...rest } = init ?? {}
  const res = await fetch(path, {
    ...rest,
    headers: {
      ...(jsonBody !== undefined ? { 'content-type': 'application/json' } : {}),
      ...rest.headers,
    },
    body: jsonBody !== undefined ? JSON.stringify(jsonBody) : rest.body,
    credentials: 'same-origin',
  })
  if (res.status === 401 && !path.startsWith('/api/auth/')) onUnauthorized?.()
  if (!res.ok) {
    let message = res.statusText
    try {
      const data = (await res.json()) as { error?: string }
      if (data.error) message = data.error
    } catch {
      /* not json */
    }
    throw new ApiError(res.status, message)
  }
  return (await res.json()) as T
}
