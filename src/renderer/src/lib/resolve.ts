import type { RequestNode, RunRequest } from '@shared/types'
import { interpolate } from '@shared/interpolate'

/**
 * Resolve a request against already-merged variables (collection + active
 * environment) for code snippets — mirrors the main-process send pipeline,
 * but leaves dynamic variables (`{{$uuid}}`) literal so the snippet shows
 * where fresh values go.
 */
export function resolveForCodegen(request: RequestNode, vars: Record<string, string>): RunRequest {
  const opts = { dynamic: false }
  const headers: [string, string][] = []
  for (const h of request.headers) {
    if (!h.enabled || !h.key.trim()) continue
    headers.push([interpolate(h.key, vars, opts).text, interpolate(h.value, vars, opts).text])
  }
  const hasAuth = headers.some(([k]) => k.toLowerCase() === 'authorization')
  if (!hasAuth) {
    if (request.auth.mode === 'inherit' && vars.token) headers.unshift(['Authorization', `Bearer ${vars.token}`])
    else if (request.auth.mode === 'bearer' && request.auth.token) {
      headers.unshift(['Authorization', `Bearer ${interpolate(request.auth.token, vars, opts).text}`])
    }
  }
  return {
    method: request.method,
    url: interpolate(request.url, vars, opts).text,
    headers,
    bodyText: request.body.mode === 'none' ? '' : interpolate(request.body.text, vars, opts).text
  }
}
