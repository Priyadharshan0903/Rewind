import type { RunRequest } from './types'

function sq(s: string): string {
  return `'` + s.replace(/'/g, `'\\''`) + `'`
}

/** Copy-pastable cURL from an already-resolved request. */
export function buildCurl(req: RunRequest): string {
  const parts: string[] = [`curl -X ${req.method} ${sq(req.url)}`]
  for (const [k, v] of req.headers) parts.push(`  -H ${sq(`${k}: ${v}`)}`)
  if (req.bodyText.trim()) parts.push(`  --data ${sq(req.bodyText)}`)
  return parts.join(' \\\n')
}

/** Node.js fetch snippet. */
export function buildNode(req: RunRequest): string {
  const lines: string[] = [`const res = await fetch(${JSON.stringify(req.url)}, {`, `  method: '${req.method}',`]
  if (req.headers.length) {
    lines.push('  headers: {')
    lines.push(req.headers.map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n'))
    lines.push('  },')
  }
  if (req.bodyText.trim()) lines.push(`  body: ${JSON.stringify(req.bodyText)},`)
  lines.push('})', '', 'console.log(res.status, await res.text())')
  return lines.join('\n')
}

/** Python requests snippet. */
export function buildPython(req: RunRequest): string {
  const lines: string[] = ['import requests', '', `resp = requests.request(`, `    "${req.method}",`, `    ${JSON.stringify(req.url)},`]
  if (req.headers.length) {
    lines.push('    headers={')
    lines.push(req.headers.map(([k, v]) => `        ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n'))
    lines.push('    },')
  }
  if (req.bodyText.trim()) {
    let asJson = false
    try {
      JSON.parse(req.bodyText)
      asJson = true
    } catch {
      /* plain data */
    }
    if (asJson) lines.push(`    json=${pyLiteral(JSON.parse(req.bodyText))},`)
    else lines.push(`    data=${JSON.stringify(req.bodyText)},`)
  }
  lines.push(')', '', 'print(resp.status_code, resp.text)')
  return lines.join('\n')
}

function pyLiteral(v: unknown, indent = 4): string {
  const pad = ' '.repeat(indent + 4)
  const close = ' '.repeat(indent)
  if (v === null) return 'None'
  if (v === true) return 'True'
  if (v === false) return 'False'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string') return JSON.stringify(v)
  if (Array.isArray(v)) {
    if (!v.length) return '[]'
    return '[\n' + v.map((x) => pad + pyLiteral(x, indent + 4)).join(',\n') + `\n${close}]`
  }
  const entries = Object.entries(v as Record<string, unknown>)
  if (!entries.length) return '{}'
  return '{\n' + entries.map(([k, x]) => `${pad}${JSON.stringify(k)}: ${pyLiteral(x, indent + 4)}`).join(',\n') + `\n${close}}`
}
