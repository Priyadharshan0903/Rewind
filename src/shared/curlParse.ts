import type { HttpMethod } from './types'

export interface ParsedCurl {
  method: HttpMethod
  url: string
  headers: [string, string][]
  bodyText: string
  /** -F/--form fields; a value starting with '@' is a file path. */
  formFields?: [string, string][]
}

/** Split a shell command into words, honoring quotes and line continuations. */
function shellWords(input: string): string[] {
  const src = input.replace(/\\\r?\n/g, ' ')
  const words: string[] = []
  let cur = ''
  let started = false
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (ch === "'") {
      started = true
      i++
      while (i < src.length && src[i] !== "'") cur += src[i++]
      i++
    } else if (ch === '"') {
      started = true
      i++
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\' && i + 1 < src.length && ['"', '\\', '$', '`'].includes(src[i + 1])) i++
        cur += src[i++]
      }
      i++
    } else if (ch === '\\' && i + 1 < src.length) {
      started = true
      cur += src[i + 1]
      i += 2
    } else if (/\s/.test(ch)) {
      if (started || cur) words.push(cur)
      cur = ''
      started = false
      i++
    } else {
      started = true
      cur += src[i++]
    }
  }
  if (started || cur) words.push(cur)
  return words
}

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'QUERY'])

export function looksLikeCurl(text: string): boolean {
  return /^\s*curl\s/i.test(text)
}

/** Parse a pasted cURL command into request parts. Returns null if it isn't one. */
export function parseCurl(text: string): ParsedCurl | null {
  if (!looksLikeCurl(text)) return null
  const words = shellWords(text.trim())
  if (words[0]?.toLowerCase() !== 'curl') return null

  let method: HttpMethod | null = null
  let url = ''
  const headers: [string, string][] = []
  const dataParts: string[] = []
  const formFields: [string, string][] = []
  let user: string | null = null

  const takesValue = new Set([
    '-X',
    '--request',
    '-H',
    '--header',
    '-d',
    '--data',
    '--data-raw',
    '--data-binary',
    '--data-ascii',
    '--data-urlencode',
    '--url',
    '-u',
    '--user',
    '-A',
    '--user-agent',
    '-e',
    '--referer',
    '-b',
    '--cookie',
    '-o',
    '--output',
    '-T',
    '--upload-file',
    '--connect-timeout',
    '--max-time',
    '-m',
    '-w',
    '--write-out',
    '--cacert',
    '--capath',
    '--cert',
    '--key',
    '--proxy',
    '-x',
    '--retry',
    '--form',
    '-F'
  ])

  for (let i = 1; i < words.length; i++) {
    const w = words[i]
    const next = (): string => words[++i] ?? ''
    switch (w) {
      case '-X':
      case '--request': {
        const m = next().toUpperCase()
        if (METHODS.has(m)) method = m as HttpMethod
        break
      }
      case '-H':
      case '--header': {
        const h = next()
        const idx = h.indexOf(':')
        if (idx > 0) headers.push([h.slice(0, idx).trim(), h.slice(idx + 1).trim()])
        break
      }
      case '-d':
      case '--data':
      case '--data-raw':
      case '--data-binary':
      case '--data-ascii':
      case '--data-urlencode':
        dataParts.push(next())
        break
      case '--url':
        url = next()
        break
      case '-u':
      case '--user':
        user = next()
        break
      case '-A':
      case '--user-agent':
        headers.push(['User-Agent', next()])
        break
      case '-e':
      case '--referer':
        headers.push(['Referer', next()])
        break
      case '-b':
      case '--cookie':
        headers.push(['Cookie', next()])
        break
      case '-F':
      case '--form': {
        const f = next()
        const eq = f.indexOf('=')
        if (eq > 0) formFields.push([f.slice(0, eq), f.slice(eq + 1)])
        break
      }
      default:
        if (takesValue.has(w)) {
          next() // consume and ignore the value
        } else if (!w.startsWith('-') && !url) {
          url = w
        }
    }
  }

  if (!url) return null
  if (user && !headers.some(([k]) => k.toLowerCase() === 'authorization')) {
    headers.push(['Authorization', 'Basic ' + toBase64(user)])
  }
  const bodyText = dataParts.join('&')
  return {
    method: method ?? (bodyText || formFields.length ? 'POST' : 'GET'),
    url,
    headers,
    bodyText,
    ...(formFields.length ? { formFields } : {})
  }
}

function toBase64(s: string): string {
  if (typeof btoa === 'function') return btoa(s)
  return Buffer.from(s, 'utf8').toString('base64')
}
