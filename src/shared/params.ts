import type { KV } from './types'
import { newId } from './id'

/**
 * Query-param ↔ URL sync helpers. Everything is kept as raw text — no
 * percent-encoding or decoding — so `{{variables}}` survive round-trips
 * and what you type is exactly what is sent.
 */

export function splitUrl(url: string): { base: string; query: string } {
  const idx = url.indexOf('?')
  return idx === -1 ? { base: url, query: '' } : { base: url.slice(0, idx), query: url.slice(idx + 1) }
}

function pairsFromQuery(query: string): [string, string][] {
  if (!query) return []
  return query.split('&').map((part) => {
    const eq = part.indexOf('=')
    return eq === -1 ? [part, ''] : [part.slice(0, eq), part.slice(eq + 1)]
  })
}

/**
 * Derive the param table from a URL, preserving row ids from `prev` (so the
 * table doesn't remount while typing in the URL bar) and keeping disabled
 * rows — they live only in the table, never in the URL.
 */
export function paramsFromUrl(url: string, prev?: KV[]): KV[] {
  const pairs = pairsFromQuery(splitUrl(url).query)
  const prevEnabled = (prev ?? []).filter((p) => p.enabled)
  const disabled = (prev ?? []).filter((p) => !p.enabled)
  const rows: KV[] = pairs.map(([key, value], i) => ({
    id: prevEnabled[i]?.id ?? newId(6),
    key,
    value,
    enabled: true
  }))
  return [...rows, ...disabled]
}

/** Rebuild the URL's query string from the enabled rows of the param table. */
export function urlWithParams(url: string, params: KV[]): string {
  const { base } = splitUrl(url)
  const query = params
    .filter((p) => p.enabled && p.key.trim() !== '')
    .map((p) => (p.value === '' ? p.key : `${p.key}=${p.value}`))
    .join('&')
  return query ? `${base}?${query}` : base
}
