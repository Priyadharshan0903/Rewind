import type { RunRequest } from './types'

function sq(s: string): string {
  return `'` + s.replace(/'/g, `'\\''`) + `'`
}

/** Build a copy-pastable cURL command from an already-resolved request. */
export function buildCurl(req: RunRequest): string {
  const parts: string[] = [`curl -X ${req.method} ${sq(req.url)}`]
  for (const [k, v] of req.headers) parts.push(`  -H ${sq(`${k}: ${v}`)}`)
  if (req.bodyText.trim()) parts.push(`  --data ${sq(req.bodyText)}`)
  return parts.join(' \\\n')
}
