/**
 * Turning literal values back into `{{variables}}` on import (pasted cURL).
 *
 * The rules are deliberately conservative: a wrong rewrite sends the request
 * to the wrong host and the user won't notice until it fires, so every match
 * is either a URL-boundary prefix match or a whole-value equality match.
 */

export interface VarEntry {
  name: string
  value: string
}

/** Below this, an exact-value match is noise (`1`, `en`, `on`, …). */
const MIN_EXACT_LEN = 4

const AUTH_SCHEME_RE = /^(?:Bearer|Basic|Token|ApiKey)\s+/i
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i
const BARE_HOST_RE = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d{1,5})?(?:\/.*)?$/i

function hasScheme(s: string): boolean {
  return SCHEME_RE.test(s)
}

/** Index where the path starts — i.e. the end of scheme + authority. */
function authorityEnd(s: string): number {
  const scheme = s.indexOf('://')
  const from = scheme >= 0 ? scheme + 3 : 0
  const slash = s.indexOf('/', from)
  return slash === -1 ? s.length : slash
}

/** Could this value stand in for the front of a URL? */
function isUrlBase(v: string): boolean {
  if (hasScheme(v)) return v.length > v.indexOf('://') + 3
  return BARE_HOST_RE.test(v)
}

/**
 * Does `value` sit at `at` in `url`, ending on a URL boundary? Scheme and
 * authority compare case-insensitively (they are case-insensitive in the
 * spec); the path compares exactly, since `/Users` ≠ `/users` on most servers.
 */
function matchesAt(url: string, value: string, at: number): boolean {
  if (url.length - at < value.length) return false
  const head = url.slice(at, at + value.length)
  const ae = authorityEnd(value)
  if (head.slice(0, ae).toLowerCase() !== value.slice(0, ae).toLowerCase()) return false
  if (head.slice(ae) !== value.slice(ae)) return false
  // A value ending in '/' already consumed the boundary.
  if (value.endsWith('/')) return true
  const rest = url.slice(at + value.length)
  return rest === '' || rest.startsWith('/') || rest.startsWith('?') || rest.startsWith('#')
}

function exactHit(v: string, entries: VarEntry[]): string | undefined {
  if (v.length < MIN_EXACT_LEN) return undefined
  return entries.find((e) => e.value === v)?.name
}

/** Replace a whole value (or the part after `Bearer`/`Basic`/…) with `{{name}}`. */
export function substituteValue(
  value: string,
  entries: VarEntry[]
): { text: string; name?: string } {
  const prefix = AUTH_SCHEME_RE.exec(value)?.[0] ?? ''
  const name = exactHit(value.slice(prefix.length), entries)
  return name ? { text: `${prefix}{{${name}}}`, name } : { text: value }
}

/**
 * Swap a known base URL for `{{name}}`, then swap query-param values that
 * exactly equal a variable (inline api keys). Longest base wins; on a tie the
 * earlier entry wins, so callers should pass collection vars before env vars.
 */
export function substituteUrl(url: string, entries: VarEntry[]): { text: string; names: string[] } {
  const names: string[] = []
  let text = url

  const bases = entries
    .filter((e) => isUrlBase(e.value))
    .sort((a, b) => b.value.length - a.value.length)
  for (const e of bases) {
    // A scheme-less value ('api.x.com') may still match after the url's scheme.
    const at = hasScheme(e.value) ? 0 : hasScheme(text) ? text.indexOf('://') + 3 : 0
    if (!matchesAt(text, e.value, at)) continue
    text = `${text.slice(0, at)}{{${e.name}}}${text.slice(at + e.value.length)}`
    names.push(e.name)
    break // the base is a prefix — only one can apply
  }

  const qi = text.indexOf('?')
  if (qi >= 0) {
    const hi = text.indexOf('#', qi)
    const query = hi >= 0 ? text.slice(qi + 1, hi) : text.slice(qi + 1)
    const swapped = query
      .split('&')
      .map((pair) => {
        const eq = pair.indexOf('=')
        if (eq < 0) return pair
        const raw = pair.slice(eq + 1)
        let decoded = raw
        try {
          decoded = decodeURIComponent(raw)
        } catch {
          /* leave it raw */
        }
        const name = exactHit(raw, entries) ?? exactHit(decoded, entries)
        if (!name) return pair
        names.push(name)
        return `${pair.slice(0, eq + 1)}{{${name}}}`
      })
      .join('&')
    text = text.slice(0, qi + 1) + swapped + (hi >= 0 ? text.slice(hi) : '')
  }

  return { text, names }
}
