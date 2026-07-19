import type { RunRequest } from './types'

function sq(s: string): string {
  return `'` + s.replace(/'/g, `'\\''`) + `'`
}

/** Copy-pastable cURL from an already-resolved request. */
export function buildCurl(req: RunRequest): string {
  const parts: string[] = [`curl -X ${req.method} ${sq(req.url)}`]
  for (const [k, v] of req.headers) parts.push(`  -H ${sq(`${k}: ${v}`)}`)
  if (req.bodyForm) {
    for (const f of req.bodyForm) {
      parts.push(`  -F ${sq(f.type === 'file' ? `${f.name}=@${f.value}` : `${f.name}=${f.value}`)}`)
    }
  } else if (req.bodyText.trim()) {
    parts.push(`  --data ${sq(req.bodyText)}`)
  }
  return parts.join(' \\\n')
}

/** Node.js fetch snippet. */
export function buildNode(req: RunRequest): string {
  const lines: string[] = []
  if (req.bodyForm) {
    if (req.bodyForm.some((f) => f.type === 'file'))
      lines.push(`import { openAsBlob } from 'node:fs'`, '')
    lines.push('const form = new FormData()')
    for (const f of req.bodyForm) {
      if (f.type === 'file') {
        lines.push(
          `form.append(${JSON.stringify(f.name)}, await openAsBlob(${JSON.stringify(f.value)}), ${JSON.stringify(f.value.split('/').pop() ?? 'file')})`
        )
      } else {
        lines.push(`form.append(${JSON.stringify(f.name)}, ${JSON.stringify(f.value)})`)
      }
    }
    lines.push('')
  }
  lines.push(`const res = await fetch(${JSON.stringify(req.url)}, {`, `  method: '${req.method}',`)
  if (req.headers.length) {
    lines.push('  headers: {')
    lines.push(
      req.headers.map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')
    )
    lines.push('  },')
  }
  if (req.bodyForm) lines.push('  body: form,')
  else if (req.bodyText.trim()) lines.push(`  body: ${JSON.stringify(req.bodyText)},`)
  lines.push('})', '', 'console.log(res.status, await res.text())')
  return lines.join('\n')
}

/** Python requests snippet. */
export function buildPython(req: RunRequest): string {
  const lines: string[] = [
    'import requests',
    '',
    `resp = requests.request(`,
    `    "${req.method}",`,
    `    ${JSON.stringify(req.url)},`
  ]
  if (req.headers.length) {
    lines.push('    headers={')
    lines.push(
      req.headers.map(([k, v]) => `        ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')
    )
    lines.push('    },')
  }
  if (req.bodyForm) {
    const texts = req.bodyForm.filter((f) => f.type === 'text')
    const files = req.bodyForm.filter((f) => f.type === 'file')
    if (texts.length) {
      lines.push('    data={')
      lines.push(
        texts
          .map((f) => `        ${JSON.stringify(f.name)}: ${JSON.stringify(f.value)}`)
          .join(',\n')
      )
      lines.push('    },')
    }
    if (files.length) {
      lines.push('    files={')
      lines.push(
        files
          .map((f) => `        ${JSON.stringify(f.name)}: open(${JSON.stringify(f.value)}, "rb")`)
          .join(',\n')
      )
      lines.push('    },')
    }
  } else if (req.bodyText.trim()) {
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
  return (
    '{\n' +
    entries.map(([k, x]) => `${pad}${JSON.stringify(k)}: ${pyLiteral(x, indent + 4)}`).join(',\n') +
    `\n${close}}`
  )
}
