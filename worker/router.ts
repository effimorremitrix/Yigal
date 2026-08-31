import type { Env, SessionUser } from './env'

export interface RequestContext {
  request: Request
  env: Env
  params: Record<string, string>
  user: SessionUser | null
}

export type Handler = (ctx: RequestContext) => Promise<Response>

interface Route {
  method: string
  segments: string[]
  handler: Handler
}

export class Router {
  private routes: Route[] = []

  add(method: string, path: string, handler: Handler) {
    this.routes.push({ method, segments: path.split('/').filter(Boolean), handler })
  }

  match(method: string, pathname: string): { handler: Handler; params: Record<string, string> } | null {
    const parts = pathname.split('/').filter(Boolean)
    for (const route of this.routes) {
      if (route.method !== method || route.segments.length !== parts.length) continue
      const params: Record<string, string> = {}
      let ok = true
      for (let i = 0; i < parts.length; i++) {
        const seg = route.segments[i]
        if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(parts[i])
        else if (seg !== parts[i]) {
          ok = false
          break
        }
      }
      if (ok) return { handler: route.handler, params }
    }
    return null
  }
}
