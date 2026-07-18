import type { Collection, HttpMethod, RequestBody, RequestNode, Run, TreeNode } from '@shared/types'
import { splitUrl } from '@shared/params'

/** A single observed parameter — captured from the request definition, not a spec. */
export interface DocParam {
  name: string
  location: 'path' | 'query' | 'body'
  example?: string
}

/** The best example we could find for an endpoint: a real run, or a saved snapshot. */
export interface DocExample {
  source: 'history' | 'saved'
  ts?: number
  status?: number
  statusText?: string
  durationMs?: number
  reqMethod: HttpMethod
  reqUrl: string
  reqHeaders: [string, string][]
  reqBody: string
  resBody?: string
}

export interface DocEndpoint {
  requestId: string
  name: string
  method: HttpMethod
  urlTemplate: string
  path: string
  authLabel: string
  bodyMode: RequestBody['mode']
  params: DocParam[]
  example?: DocExample
  runCount: number
}

export interface DocGroup {
  id: string
  /** null = requests sitting directly under the collection root. */
  name: string | null
  endpoints: DocEndpoint[]
}

export interface DocVariable {
  key: string
  value: string
  secret: boolean
}

export interface CollectionDocs {
  collectionId: string
  name: string
  version: string
  variables: DocVariable[]
  groups: DocGroup[]
  endpointCount: number
  exampleCount: number
}

const VAR_TOKEN = /\{\{\s*(\$?[A-Za-z_][\w-]*)\s*\}\}/g
const SECRET_RE = /token|secret|password|passwd|api[-_]?key|auth|bearer|credential/i

function isSecret(key: string): boolean {
  return SECRET_RE.test(key)
}

/** Strip a leading `{{baseUrl}}`-style token so the route reads as `/charges/{{id}}`. */
function displayPath(urlTemplate: string): string {
  const { base } = splitUrl(urlTemplate)
  let path = base.replace(/^\{\{\s*[$A-Za-z_][\w-]*\s*\}\}/, '')
  // Also strip a bare scheme+host if someone typed a literal URL.
  path = path.replace(/^https?:\/\/[^/]+/i, '')
  if (!path) path = '/'
  if (!path.startsWith('/')) path = '/' + path
  return path
}

/** Pull the concrete value of each `{{pathVar}}` by aligning template and example URL segments. */
function matchPathValues(template: string, concrete: string): Record<string, string> {
  const t = splitUrl(template).base.split('/')
  const c = splitUrl(concrete).base.split('/')
  const out: Record<string, string> = {}
  for (let i = 0; i < t.length; i++) {
    const m = /^\{\{\s*([$A-Za-z_][\w-]*)\s*\}\}$/.exec(t[i] ?? '')
    if (m && c[i] != null) out[m[1]] = c[i]
  }
  return out
}

function authLabel(node: RequestNode): string {
  const a = node.auth
  switch (a.mode) {
    case 'inherit':
      return 'Inherited — Bearer {{token}} from the active environment'
    case 'bearer':
      return 'Bearer token'
    case 'basic':
      return 'Basic auth'
    case 'apikey':
      return `API key — ${a.key || 'key'} in ${a.addTo === 'query' ? 'query' : 'header'}`
    default:
      return 'None'
  }
}

function bodyParams(body: RequestBody): DocParam[] {
  if (body.mode === 'json') {
    try {
      const parsed = JSON.parse(body.text)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return Object.entries(parsed as Record<string, unknown>).map(([name, v]) => ({
          name,
          location: 'body' as const,
          example: typeof v === 'object' ? JSON.stringify(v) : String(v)
        }))
      }
    } catch {
      // Body has unresolved {{vars}} or isn't valid JSON yet — skip silently.
    }
    return []
  }
  if (body.mode === 'urlencoded' || body.mode === 'formdata') {
    return (body.form ?? [])
      .filter((f) => f.enabled && f.key.trim())
      .map((f) => ({ name: f.key, location: 'body' as const, example: f.value }))
  }
  return []
}

function endpointFrom(
  node: RequestNode,
  latestRun: Run | undefined,
  runCount: number
): DocEndpoint {
  const pathValues = latestRun ? matchPathValues(node.url, latestRun.request.url) : {}

  // Path params: {{tokens}} in the URL path (before the query).
  const seen = new Set<string>()
  const pathParams: DocParam[] = []
  const base = splitUrl(node.url).base
  for (const m of base.matchAll(VAR_TOKEN)) {
    const name = m[1]
    if (name.startsWith('$') || seen.has(name)) continue
    seen.add(name)
    pathParams.push({ name, location: 'path', example: pathValues[name] })
  }

  // Query params: enabled rows from the request.
  const query: DocParam[] = (node.params ?? [])
    .filter((p) => p.enabled && p.key.trim())
    .map((p) => ({ name: p.key, location: 'query' as const, example: p.value || undefined }))

  const params = [...pathParams, ...query, ...bodyParams(node.body)]

  let example: DocExample | undefined
  if (latestRun) {
    example = {
      source: 'history',
      ts: latestRun.ts,
      status: latestRun.response?.status,
      statusText: latestRun.response?.statusText,
      durationMs: latestRun.durationMs,
      reqMethod: latestRun.request.method,
      reqUrl: latestRun.request.url,
      reqHeaders: latestRun.request.headers,
      reqBody: latestRun.request.bodyText,
      resBody: latestRun.response?.bodyText
    }
  } else if (node.examples.length) {
    const ex = node.examples[0]
    example = {
      source: 'saved',
      ts: ex.savedAt,
      status: ex.status,
      reqMethod: node.method,
      reqUrl: node.url,
      reqHeaders: node.headers.filter((h) => h.enabled && h.key.trim()).map((h) => [h.key, h.value] as [string, string]),
      reqBody: node.body.text,
      resBody: ex.bodyText
    }
  }

  return {
    requestId: node.id,
    name: node.name,
    method: node.method,
    urlTemplate: node.url,
    path: displayPath(node.url),
    authLabel: authLabel(node),
    bodyMode: node.body.mode,
    params,
    example,
    runCount
  }
}

/** Walk the collection tree, grouping requests by their containing folder. */
function walk(
  items: TreeNode[],
  groupName: string | null,
  groupId: string,
  latest: Map<string, Run>,
  counts: Map<string, number>,
  groups: DocGroup[]
): void {
  const direct: DocEndpoint[] = []
  for (const node of items) {
    if (node.type === 'request') {
      direct.push(endpointFrom(node, latest.get(node.id), counts.get(node.id) ?? 0))
    }
  }
  if (direct.length) {
    const existing = groups.find((g) => g.id === groupId)
    if (existing) existing.endpoints.push(...direct)
    else groups.push({ id: groupId, name: groupName, endpoints: direct })
  }
  for (const node of items) {
    if (node.type === 'folder') walk(node.children, node.name, node.id, latest, counts, groups)
  }
}

export function buildDocs(
  collection: Collection,
  latest: Map<string, Run>,
  counts: Map<string, number>
): CollectionDocs {
  const groups: DocGroup[] = []
  walk(collection.items, null, '__root__', latest, counts, groups)

  const variables: DocVariable[] = (collection.variables ?? [])
    .filter((v) => v.key.trim())
    .map((v) => ({ key: v.key, value: v.value, secret: isSecret(v.key) }))

  const endpointCount = groups.reduce((n, g) => n + g.endpoints.length, 0)
  const exampleCount = groups.reduce((n, g) => n + g.endpoints.filter((e) => e.example).length, 0)

  return {
    collectionId: collection.id,
    name: collection.name,
    version: collection.version,
    variables,
    groups,
    endpointCount,
    exampleCount
  }
}

/** Choose the example run per request: newest successful, else newest of any. */
export function pickLatestRuns(
  summaries: { id: string; requestId: string; status?: number; error?: string }[]
): { chosen: Map<string, string>; counts: Map<string, number> } {
  const counts = new Map<string, number>()
  for (const s of summaries) counts.set(s.requestId, (counts.get(s.requestId) ?? 0) + 1)

  const chosen = new Map<string, string>()
  // summaries arrive newest-first; first pass prefers 2xx.
  for (const s of summaries) {
    const ok = !s.error && (s.status ?? 0) >= 200 && (s.status ?? 0) < 400
    if (ok && !chosen.has(s.requestId)) chosen.set(s.requestId, s.id)
  }
  for (const s of summaries) {
    if (!chosen.has(s.requestId)) chosen.set(s.requestId, s.id)
  }
  return { chosen, counts }
}

// ---------- Standalone HTML export ----------

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
}

function maskValue(v: DocVariable): string {
  return v.secret ? '••••••••' : v.value
}

/** Render a shareable, self-contained HTML document from the docs model. */
export function renderDocsHtml(docs: CollectionDocs): string {
  const endpoint = (e: DocEndpoint): string => {
    const params = e.params.length
      ? `<table class="p"><thead><tr><th>Parameter</th><th>In</th><th>Example</th></tr></thead><tbody>${e.params
          .map(
            (p) =>
              `<tr><td><code>${esc(p.name)}</code></td><td>${p.location}</td><td>${
                p.example != null ? `<code>${esc(String(p.example))}</code>` : '<span class="muted">—</span>'
              }</td></tr>`
          )
          .join('')}</tbody></table>`
      : '<p class="muted">No parameters.</p>'

    const example = e.example
      ? `<div class="ex"><div class="ex-h">Example request${
          e.example.source === 'history' ? ' <span class="tag">captured</span>' : ' <span class="tag">saved</span>'
        }</div><pre>${esc(e.example.reqMethod + ' ' + e.example.reqUrl)}${
          e.example.reqBody ? '\n\n' + esc(e.example.reqBody) : ''
        }</pre>${
          e.example.resBody != null
            ? `<div class="ex-h">Example response${
                e.example.status ? ` <span class="status">${e.example.status}${e.example.statusText ? ' ' + esc(e.example.statusText) : ''}</span>` : ''
              }</div><pre>${esc(e.example.resBody)}</pre>`
            : ''
        }</div>`
      : '<p class="muted">No example captured yet — send this request once and it appears here.</p>'

    return `<section id="${esc(e.requestId)}" class="endpoint">
      <h3><span class="m m-${e.method.toLowerCase()}">${e.method}</span> <code class="route">${esc(e.path)}</code></h3>
      <p class="name">${esc(e.name)}</p>
      <p class="auth"><b>Auth:</b> ${esc(e.authLabel)}</p>
      ${params}
      ${example}
    </section>`
  }

  const groups = docs.groups
    .map(
      (g) =>
        `${g.name ? `<h2 class="group">${esc(g.name)}</h2>` : ''}${g.endpoints.map(endpoint).join('')}`
    )
    .join('')

  const vars = docs.variables.length
    ? `<div class="vars"><h2 class="group">Variables</h2><table class="p"><tbody>${docs.variables
        .map((v) => `<tr><td><code>{{${esc(v.key)}}}</code></td><td><code>${esc(maskValue(v))}</code></td></tr>`)
        .join('')}</tbody></table></div>`
    : ''

  const nav = docs.groups
    .map(
      (g) =>
        `${g.name ? `<div class="nav-g">${esc(g.name)}</div>` : ''}${g.endpoints
          .map((e) => `<a href="#${esc(e.requestId)}"><span class="m m-${e.method.toLowerCase()}">${e.method}</span>${esc(e.path)}</a>`)
          .join('')}`
    )
    .join('')

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(docs.name)} — API Docs</title>
<style>
  :root{--bg:#f4f3ef;--surface:#fff;--text:#1b1b22;--text2:#55555f;--muted:#8c8c96;--border:#e6e3dc;--accent:#5a5fe0;--code:#f6f5f1;--get:#2f9e6b;--post:#3b6fd4;--put:#c0872a;--del:#d0503f}
  @media(prefers-color-scheme:dark){:root{--bg:#151517;--surface:#1d1d21;--text:#ececf0;--text2:#a2a2ad;--muted:#6a6a76;--border:#2c2c33;--accent:#8b8ef5;--code:#191920;--get:#4ec38c;--post:#6f9df0;--put:#e0aa54;--del:#ec6d5c}}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  .wrap{display:grid;grid-template-columns:250px minmax(0,1fr);max-width:1180px;margin:0 auto}
  nav{position:sticky;top:0;align-self:start;height:100vh;overflow:auto;padding:28px 18px;border-right:1px solid var(--border);font-size:13px}
  nav a{display:flex;gap:8px;align-items:baseline;padding:4px 8px;border-radius:6px;color:var(--text2);text-decoration:none}
  nav a:hover{background:var(--code);color:var(--text)}
  .nav-g{font:600 11px ui-monospace,monospace;letter-spacing:.6px;text-transform:uppercase;color:var(--muted);margin:16px 0 6px 8px}
  main{padding:40px clamp(20px,4vw,56px) 120px;min-width:0}
  h1{font-size:34px;letter-spacing:-1px;margin:0 0 6px}
  .sub{color:var(--text2);margin:0 0 8px}.count{color:var(--muted);font-size:14px;margin:0 0 32px}
  h2.group{font-size:13px;text-transform:uppercase;letter-spacing:1px;color:var(--accent);border-bottom:1px solid var(--border);padding-bottom:8px;margin:44px 0 20px}
  .endpoint{margin:0 0 36px;padding:0 0 8px}
  .endpoint h3{font-size:19px;margin:0 0 2px;display:flex;gap:10px;align-items:center}
  .route{font-size:15px;background:var(--code);border:1px solid var(--border);border-radius:6px;padding:2px 8px}
  .name{color:var(--text2);margin:0 0 8px}.auth{font-size:14px;color:var(--text2);margin:0 0 14px}
  code{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:.86em;background:var(--code);border:1px solid var(--border);border-radius:5px;padding:1px 5px}
  pre{font-family:ui-monospace,Menlo,monospace;font-size:13px;line-height:1.55;background:var(--code);border:1px solid var(--border);border-radius:9px;padding:14px 16px;overflow-x:auto;margin:0 0 14px}
  pre code{background:none;border:none;padding:0}
  table.p{width:100%;border-collapse:collapse;font-size:14px;margin:0 0 16px}
  table.p th{text-align:left;font:600 11px ui-monospace,monospace;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);padding:6px 10px;border-bottom:1px solid var(--border)}
  table.p td{padding:7px 10px;border-bottom:1px solid var(--border);vertical-align:top}
  .muted{color:var(--muted)}
  .m{font:700 11px ui-monospace,monospace}.m-get{color:var(--get)}.m-post{color:var(--post)}.m-put,.m-patch{color:var(--put)}.m-delete{color:var(--del)}
  .ex-h{font:600 11px ui-monospace,monospace;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);margin:0 0 6px}
  .tag{background:var(--accent);color:#fff;border-radius:4px;padding:1px 6px;font-size:9px;letter-spacing:.5px}
  .status{color:var(--get);font-weight:700}
  @media(max-width:820px){.wrap{grid-template-columns:1fr}nav{position:static;height:auto;border-right:none;border-bottom:1px solid var(--border)}}
</style></head><body><div class="wrap">
<nav>${nav}</nav>
<main>
  <h1>${esc(docs.name)}</h1>
  <p class="sub">Version ${esc(docs.version)}</p>
  <p class="count">${docs.endpointCount} endpoints · ${docs.exampleCount} with captured examples</p>
  ${vars}
  ${groups}
</main></div></body></html>`
}
