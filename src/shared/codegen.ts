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

/* ------------------------------------------------------------------ *
 *  Additional language targets.
 *
 *  These share one body model: a single body string — the raw text, or a
 *  urlencoded string for a text-only form body. Full multipart is only
 *  emitted by cURL/Node/Python above; when a form has file fields, the newer
 *  targets prepend a note that uploads were omitted.
 * ------------------------------------------------------------------ */

/** JSON.stringify yields a valid double-quoted literal for JS/TS, Go, Java,
 *  Rust, C#, Ruby and (for the common escapes) Python — their escape rules
 *  overlap for the characters that appear in URLs, headers and JSON bodies. */
function dq(s: string): string {
  return JSON.stringify(s)
}

/** Single-quoted PHP string literal. */
function phpStr(s: string): string {
  return `'` + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + `'`
}

const FILE_NOTE = 'File uploads omitted — attach them with your HTTP library’s multipart API.'

function bodyString(req: RunRequest): string | null {
  if (req.bodyForm) {
    const text = req.bodyForm.filter((f) => f.type === 'text')
    if (!text.length) return null
    return text.map((f) => `${encodeURIComponent(f.name)}=${encodeURIComponent(f.value)}`).join('&')
  }
  return req.bodyText.trim() ? req.bodyText : null
}

function hasFileField(req: RunRequest): boolean {
  return !!req.bodyForm?.some((f) => f.type === 'file')
}

/** Leading comment (in the target's line-comment syntax) when files are dropped. */
function fileNote(req: RunRequest, token: string): string[] {
  return hasFileField(req) ? [`${token} ${FILE_NOTE}`, ''] : []
}

function splitUrl(raw: string): { host: string; path: string; https: boolean } {
  try {
    const u = new URL(raw)
    return { host: u.host, path: (u.pathname || '/') + u.search, https: u.protocol === 'https:' }
  } catch {
    return { host: raw, path: '/', https: raw.startsWith('https') }
  }
}

/** HTTPie one-liner. */
export function buildHttpie(req: RunRequest): string {
  const parts: string[] = [`http ${req.method} ${sq(req.url)}`]
  for (const [k, v] of req.headers) parts.push(`  ${sq(`${k}:${v}`)}`)
  const body = bodyString(req)
  if (body) parts.push(`  --raw ${sq(body)}`)
  const note = hasFileField(req) ? `# ${FILE_NOTE}\n` : ''
  return note + parts.join(' \\\n')
}

/** wget invocation. */
export function buildWget(req: RunRequest): string {
  const parts: string[] = [`wget --method=${req.method}`]
  for (const [k, v] of req.headers) parts.push(`  --header=${sq(`${k}: ${v}`)}`)
  const body = bodyString(req)
  if (body) parts.push(`  --body-data=${sq(body)}`)
  parts.push(`  -O - ${sq(req.url)}`)
  const note = hasFileField(req) ? `# ${FILE_NOTE}\n` : ''
  return note + parts.join(' \\\n')
}

/** JavaScript — Axios. */
export function buildAxios(req: RunRequest): string {
  const lines: string[] = [
    ...fileNote(req, '//'),
    `import axios from 'axios'`,
    '',
    'const res = await axios.request({',
    `  method: ${dq(req.method)},`,
    `  url: ${dq(req.url)},`
  ]
  if (req.headers.length) {
    lines.push('  headers: {')
    lines.push(req.headers.map(([k, v]) => `    ${dq(k)}: ${dq(v)}`).join(',\n'))
    lines.push('  },')
  }
  const body = bodyString(req)
  if (body) lines.push(`  data: ${dq(body)},`)
  lines.push('})', '', 'console.log(res.status, res.data)')
  return lines.join('\n')
}

/** Python — http.client (stdlib). */
export function buildPyHttpClient(req: RunRequest): string {
  const { host, path, https } = splitUrl(req.url)
  const body = bodyString(req)
  const lines: string[] = [
    ...fileNote(req, '#'),
    'import http.client',
    '',
    `conn = http.client.${https ? 'HTTPSConnection' : 'HTTPConnection'}(${dq(host)})`,
    '',
    body ? `payload = ${dq(body)}` : 'payload = None'
  ]
  lines.push('headers = {')
  if (req.headers.length)
    lines.push(req.headers.map(([k, v]) => `    ${dq(k)}: ${dq(v)}`).join(',\n'))
  lines.push('}')
  lines.push(
    '',
    `conn.request(${dq(req.method)}, ${dq(path)}, payload, headers)`,
    'res = conn.getresponse()',
    'print(res.status)',
    'print(res.read().decode("utf-8"))'
  )
  return lines.join('\n')
}

/** Go — net/http. */
export function buildGo(req: RunRequest): string {
  const body = bodyString(req)
  const imports = ['"fmt"', '"io"', '"net/http"']
  if (body) imports.push('"strings"')
  const lines: string[] = [
    ...fileNote(req, '//'),
    'package main',
    '',
    'import (',
    ...imports.map((i) => `\t${i}`),
    ')',
    '',
    'func main() {',
    `\turl := ${dq(req.url)}`
  ]
  if (body) {
    lines.push(`\tpayload := strings.NewReader(${dq(body)})`)
    lines.push(`\treq, _ := http.NewRequest(${dq(req.method)}, url, payload)`)
  } else {
    lines.push(`\treq, _ := http.NewRequest(${dq(req.method)}, url, nil)`)
  }
  for (const [k, v] of req.headers) lines.push(`\treq.Header.Set(${dq(k)}, ${dq(v)})`)
  lines.push(
    '',
    '\tres, _ := http.DefaultClient.Do(req)',
    '\tdefer res.Body.Close()',
    '',
    '\tbody, _ := io.ReadAll(res.Body)',
    '\tfmt.Println(res.Status)',
    '\tfmt.Println(string(body))',
    '}'
  )
  return lines.join('\n')
}

/** PHP — cURL. */
export function buildPhp(req: RunRequest): string {
  const lines: string[] = [
    '<?php',
    ...(hasFileField(req) ? [`// ${FILE_NOTE}`] : []),
    '',
    '$ch = curl_init();',
    `curl_setopt($ch, CURLOPT_URL, ${phpStr(req.url)});`,
    `curl_setopt($ch, CURLOPT_CUSTOMREQUEST, ${phpStr(req.method)});`,
    'curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);'
  ]
  if (req.headers.length) {
    lines.push('curl_setopt($ch, CURLOPT_HTTPHEADER, [')
    lines.push(req.headers.map(([k, v]) => `    ${phpStr(`${k}: ${v}`)},`).join('\n'))
    lines.push(']);')
  }
  const body = bodyString(req)
  if (body) lines.push(`curl_setopt($ch, CURLOPT_POSTFIELDS, ${phpStr(body)});`)
  lines.push('', '$response = curl_exec($ch);', 'curl_close($ch);', 'echo $response;')
  return lines.join('\n')
}

/** Ruby — net/http. */
export function buildRuby(req: RunRequest): string {
  const cls = 'Net::HTTP::' + req.method.charAt(0) + req.method.slice(1).toLowerCase()
  const lines: string[] = [
    ...fileNote(req, '#'),
    'require "uri"',
    'require "net/http"',
    '',
    `url = URI(${dq(req.url)})`,
    '',
    'http = Net::HTTP.new(url.host, url.port)',
    'http.use_ssl = url.scheme == "https"',
    '',
    `request = ${cls}.new(url)`
  ]
  for (const [k, v] of req.headers) lines.push(`request[${dq(k)}] = ${dq(v)}`)
  const body = bodyString(req)
  if (body) lines.push(`request.body = ${dq(body)}`)
  lines.push('', 'response = http.request(request)', 'puts response.code', 'puts response.body')
  return lines.join('\n')
}

/** Java — java.net.http.HttpClient (Java 11+). */
export function buildJava(req: RunRequest): string {
  const body = bodyString(req)
  const publisher = body
    ? `HttpRequest.BodyPublishers.ofString(${dq(body)})`
    : 'HttpRequest.BodyPublishers.noBody()'
  const lines: string[] = [
    ...fileNote(req, '//'),
    'import java.net.URI;',
    'import java.net.http.HttpClient;',
    'import java.net.http.HttpRequest;',
    'import java.net.http.HttpResponse;',
    '',
    'HttpClient client = HttpClient.newHttpClient();',
    'HttpRequest request = HttpRequest.newBuilder()',
    `    .uri(URI.create(${dq(req.url)}))`,
    `    .method(${dq(req.method)}, ${publisher})`
  ]
  for (const [k, v] of req.headers) lines.push(`    .header(${dq(k)}, ${dq(v)})`)
  lines.push(
    '    .build();',
    '',
    'HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());',
    'System.out.println(response.statusCode());',
    'System.out.println(response.body());'
  )
  return lines.join('\n')
}

/** C# — HttpClient. */
export function buildCSharp(req: RunRequest): string {
  const body = bodyString(req)
  const contentType = req.headers.find(([k]) => k.toLowerCase() === 'content-type')?.[1]
  const lines: string[] = [
    ...fileNote(req, '//'),
    'using System;',
    'using System.Net.Http;',
    'using System.Threading.Tasks;',
    '',
    'var client = new HttpClient();',
    `var request = new HttpRequestMessage(new HttpMethod(${dq(req.method)}), ${dq(req.url)});`
  ]
  for (const [k, v] of req.headers) {
    if (k.toLowerCase() === 'content-type') continue // carried on the content below
    lines.push(`request.Headers.TryAddWithoutValidation(${dq(k)}, ${dq(v)});`)
  }
  if (body) {
    if (contentType)
      lines.push(
        `request.Content = new StringContent(${dq(body)}, System.Text.Encoding.UTF8, ${dq(contentType.split(';')[0].trim())});`
      )
    else lines.push(`request.Content = new StringContent(${dq(body)});`)
  }
  lines.push(
    '',
    'var response = await client.SendAsync(request);',
    'Console.WriteLine((int)response.StatusCode);',
    'Console.WriteLine(await response.Content.ReadAsStringAsync());'
  )
  return lines.join('\n')
}

/** Rust — reqwest (async / tokio). */
export function buildRust(req: RunRequest): string {
  const body = bodyString(req)
  const lines: string[] = [
    ...fileNote(req, '//'),
    'use reqwest::Method;',
    '',
    '#[tokio::main]',
    'async fn main() -> Result<(), Box<dyn std::error::Error>> {',
    '    let client = reqwest::Client::new();',
    '    let res = client',
    `        .request(Method::from_bytes(b${dq(req.method)})?, ${dq(req.url)})`
  ]
  for (const [k, v] of req.headers) lines.push(`        .header(${dq(k)}, ${dq(v)})`)
  if (body) lines.push(`        .body(${dq(body)})`)
  lines.push(
    '        .send()',
    '        .await?;',
    '',
    '    println!("{}", res.status());',
    '    println!("{}", res.text().await?);',
    '    Ok(())',
    '}'
  )
  return lines.join('\n')
}
