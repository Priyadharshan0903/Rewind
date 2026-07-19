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
  let url = interpolate(request.url, vars, opts).text
  const headers: [string, string][] = []
  for (const h of request.headers) {
    if (!h.enabled || !h.key.trim()) continue
    headers.push([interpolate(h.key, vars, opts).text, interpolate(h.value, vars, opts).text])
  }
  const hasAuth = headers.some(([k]) => k.toLowerCase() === 'authorization')
  if (!hasAuth) {
    if (request.auth.mode === 'inherit' && vars.token)
      headers.unshift(['Authorization', `Bearer ${vars.token}`])
    else if (request.auth.mode === 'bearer' && request.auth.token) {
      headers.unshift([
        'Authorization',
        `Bearer ${interpolate(request.auth.token, vars, opts).text}`
      ])
    } else if (request.auth.mode === 'basic') {
      const user = interpolate(request.auth.username ?? '', vars, opts).text
      const pass = interpolate(request.auth.password ?? '', vars, opts).text
      if (user || pass) headers.unshift(['Authorization', `Basic ${btoa(`${user}:${pass}`)}`])
    }
  }
  if (request.auth.mode === 'apikey' && request.auth.key?.trim()) {
    const key = interpolate(request.auth.key, vars, opts).text
    const value = interpolate(request.auth.value ?? '', vars, opts).text
    if (request.auth.addTo === 'query') url += `${url.includes('?') ? '&' : '?'}${key}=${value}`
    else headers.unshift([key, value])
  }

  let bodyText = ''
  let bodyForm: RunRequest['bodyForm']
  const fields = (request.body.form ?? []).filter((f) => f.enabled && f.key.trim())
  if (request.body.mode === 'json' || request.body.mode === 'text') {
    bodyText = interpolate(request.body.text, vars, opts).text
  } else if (request.body.mode === 'urlencoded') {
    bodyText = fields
      .map(
        (f) =>
          `${encodeURIComponent(interpolate(f.key, vars, opts).text)}=${encodeURIComponent(interpolate(f.value, vars, opts).text)}`
      )
      .join('&')
    if (!headers.some(([k]) => k.toLowerCase() === 'content-type')) {
      headers.push(['Content-Type', 'application/x-www-form-urlencoded'])
    }
  } else if (request.body.mode === 'formdata') {
    bodyForm = fields.map((f) => ({
      name: interpolate(f.key, vars, opts).text,
      value: f.type === 'file' ? f.value : interpolate(f.value, vars, opts).text,
      type: f.type
    }))
  }

  return { method: request.method, url, headers, bodyText, ...(bodyForm ? { bodyForm } : {}) }
}
