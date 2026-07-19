import type {
  Collection,
  Environment,
  FolderNode,
  FormField,
  HttpMethod,
  KV,
  RequestNode,
  TreeNode
} from '@shared/types'
import { newId } from '@shared/id'

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'QUERY']

/* ---------- Postman shapes (v2.x collection, v1 dump, environment) ---------- */

interface PmV2Collection {
  info?: {
    name?: string
    schema?: string
    version?: string | { major?: number }
  }
  item?: PmV2Item[]
  variable?: PmVariable[]
  auth?: PmAuth
}

interface PmV2Item {
  name?: string
  item?: PmV2Item[]
  request?: PmV2Request | string
  event?: PmEvent[]
}

interface PmV2Request {
  method?: string
  url?: string | PmUrl
  header?: PmHeader[]
  body?: PmBody
  auth?: PmAuth
}

interface PmUrl {
  raw?: string
  protocol?: string
  host?: string | string[]
  path?: string | string[]
  query?: { key?: string; value?: string; disabled?: boolean }[]
}

interface PmHeader {
  key?: string
  value?: string
  disabled?: boolean
}

interface PmBody {
  mode?: string
  raw?: string
  options?: { raw?: { language?: string } }
  urlencoded?: {
    key?: string
    value?: string
    disabled?: boolean
    type?: string
  }[]
  formdata?: {
    key?: string
    value?: string
    src?: string
    disabled?: boolean
    type?: string
  }[]
  graphql?: { query?: string; variables?: string }
}

/** v2.1 stores auth params as KV arrays, v2.0 as plain objects — normalize both. */
interface PmAuth {
  type?: string
  bearer?: { key?: string; value?: string }[] | { token?: string }
  basic?: { key?: string; value?: string }[] | { username?: string; password?: string }
  apikey?: { key?: string; value?: string }[] | { key?: string; value?: string; in?: string }
}

interface PmEvent {
  listen?: string
  script?: { exec?: string | string[] }
}

interface PmVariable {
  key?: string
  value?: unknown
  disabled?: boolean
}

interface PmEnvironment {
  name?: string
  values?: { key?: string; value?: unknown; enabled?: boolean }[]
  _postman_variable_scope?: string
}

interface PmV1Collection {
  name?: string
  folders?: PmV1Folder[]
  requests?: PmV1Request[]
  order?: string[]
  folders_order?: string[]
  variables?: PmVariable[]
}

interface PmV1Folder {
  id?: string
  name?: string
  order?: string[]
  folders_order?: string[]
}

interface PmV1Request {
  id?: string
  name?: string
  method?: string
  url?: string
  headers?: string
  headerData?: PmHeader[]
  dataMode?: string
  rawModeData?: unknown
  data?: { key?: string; value?: string; enabled?: boolean; type?: string }[] | string
  graphqlModeData?: { query?: string; variables?: string }
  tests?: string
  auth?: PmAuth
  folder?: string | null
}

interface PmDump {
  collections?: unknown[]
  environments?: PmEnvironment[]
  globals?: { key?: string; value?: unknown; enabled?: boolean }[]
}

export interface PostmanConversion {
  collections: Collection[]
  environments: Environment[]
  requestCount: number
  warnings: string[]
}

/* ---------- helpers ---------- */

function kv(key: string, value: string, enabled = true): KV {
  return { id: newId(6), key, value, enabled }
}

/** Postman and Rewind share `{{var}}` syntax; only dynamic variables need mapping. */
function mapVars(text: string): string {
  return text
    .replace(/\{\{\$(guid|randomUUID)\}\}/g, '{{$uuid}}')
    .replace(/\{\{\$(timestamp|isoTimestamp)\}\}/g, '{{$timestamp}}')
}

/** `/users/:id` → `/users/{{id}}` (Postman path variables → Rewind variables). */
function pathVarsToRelay(url: string): string {
  return url.replace(/(^|[/])(:)([A-Za-z_][\w-]*)(?=[/?#]|$)/g, '$1{{$3}}')
}

function authParam(source: PmAuth[keyof PmAuth], key: string): string {
  if (Array.isArray(source)) {
    const hit = source.find((p) => p && typeof p === 'object' && p.key === key)
    return typeof hit?.value === 'string' ? hit.value : ''
  }
  if (source && typeof source === 'object') {
    const value = (source as Record<string, unknown>)[key]
    return typeof value === 'string' ? value : ''
  }
  return ''
}

/** Postman scripts use the pm.* API, which Rewind's sandbox doesn't provide — keep them, commented. */
function commentedScript(lines: string[], origin: string): string {
  const body = lines.filter((l) => l.trim()).map((l) => `// ${l}`)
  if (!body.length) return ''
  return [
    `// Imported from Postman (${origin}). Postman's pm.* API is not available here —`,
    `// rewrite with vars.set("name", value) and assert(expr). Original script:`,
    ...body
  ].join('\n')
}

function applyAuth(auth: PmAuth | undefined, node: RequestNode, warnings: string[]): void {
  if (!auth?.type || auth.type === 'inherit') return
  switch (auth.type) {
    case 'noauth':
      node.auth = { mode: 'none' }
      break
    case 'bearer': {
      const token = authParam(auth.bearer, 'token')
      node.auth = { mode: 'bearer', token: mapVars(token) }
      break
    }
    case 'basic': {
      node.auth = {
        mode: 'basic',
        username: mapVars(authParam(auth.basic, 'username')),
        password: mapVars(authParam(auth.basic, 'password'))
      }
      break
    }
    case 'apikey': {
      const key = authParam(auth.apikey, 'key')
      if (key) {
        node.auth = {
          mode: 'apikey',
          key,
          value: mapVars(authParam(auth.apikey, 'value')),
          addTo: authParam(auth.apikey, 'in') === 'query' ? 'query' : 'header'
        }
      }
      break
    }
    default:
      warnings.push(`“${node.name}”: auth type "${auth.type}" isn't supported — left as inherit.`)
  }
}

function hasHeader(headers: KV[], name: string): boolean {
  return headers.some((h) => h.key.toLowerCase() === name.toLowerCase())
}

function formPairsToBody(
  pairs: {
    key?: string
    value?: string
    src?: string
    disabled?: boolean
    enabled?: boolean
    type?: string
  }[],
  node: RequestNode,
  isFormData: boolean
): void {
  const form: FormField[] = pairs
    .filter((p) => p.key)
    .map((p) => ({
      id: newId(6),
      key: p.key!,
      value: p.type === 'file' ? String(p.src ?? '') : mapVars(p.value ?? ''),
      enabled: !p.disabled && p.enabled !== false,
      type: isFormData && p.type === 'file' ? 'file' : 'text'
    }))
  node.body = { mode: isFormData ? 'formdata' : 'urlencoded', text: '', form }
}

function looksLikeJson(text: string): boolean {
  const t = text.trim()
  return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))
}

/* ---------- v2.x collection ---------- */

function urlOf(url: PmV2Request['url']): string {
  if (typeof url === 'string') return url
  if (!url) return ''
  if (url.raw) return url.raw
  const host = Array.isArray(url.host) ? url.host.join('.') : (url.host ?? '')
  const path = Array.isArray(url.path) ? url.path.join('/') : (url.path ?? '')
  const query = (url.query ?? [])
    .filter((q) => q.key && !q.disabled)
    .map((q) => `${q.key}=${q.value ?? ''}`)
    .join('&')
  const base = `${url.protocol ? `${url.protocol}://` : ''}${host}${path ? `/${path.replace(/^\/+/, '')}` : ''}`
  return query ? `${base}?${query}` : base
}

interface ConvertStats {
  requestCount: number
  warnings: string[]
}

function convertV2Request(item: PmV2Item, stats: ConvertStats): RequestNode | null {
  const req = typeof item.request === 'string' ? { url: item.request } : (item.request ?? {})
  const method = (req.method ?? 'GET').toUpperCase() as HttpMethod
  const name = item.name?.trim() || `${method} request`
  if (!METHODS.includes(method)) {
    stats.warnings.push(`“${name}”: method ${method} isn't supported — skipped.`)
    return null
  }

  const node: RequestNode = {
    id: newId(),
    type: 'request',
    name,
    method,
    url: mapVars(pathVarsToRelay(urlOf(req.url))),
    headers: (req.header ?? [])
      .filter((h) => h.key)
      .map((h) => kv(h.key!, mapVars(h.value ?? ''), !h.disabled)),
    body: { mode: 'none', text: '' },
    auth: { mode: 'inherit' },
    scripts: { postResponse: '' },
    examples: []
  }

  const body = req.body
  if (body?.mode === 'raw' && typeof body.raw === 'string' && body.raw.trim()) {
    const isJson = body.options?.raw?.language === 'json' || looksLikeJson(body.raw)
    node.body = { mode: isJson ? 'json' : 'text', text: mapVars(body.raw) }
  } else if (body?.mode === 'urlencoded' && body.urlencoded?.length) {
    formPairsToBody(body.urlencoded, node, false)
  } else if (body?.mode === 'formdata' && body.formdata?.length) {
    formPairsToBody(body.formdata, node, true)
  } else if (body?.mode === 'graphql' && body.graphql?.query) {
    let variables: unknown = {}
    try {
      variables = body.graphql.variables ? JSON.parse(body.graphql.variables) : {}
    } catch {
      /* keep {} */
    }
    node.body = {
      mode: 'json',
      text: JSON.stringify({ query: body.graphql.query, variables }, null, 2)
    }
    if (!hasHeader(node.headers, 'Content-Type'))
      node.headers.unshift(kv('Content-Type', 'application/json'))
  }

  applyAuth(req.auth, node, stats.warnings)

  const testExec = (item.event ?? [])
    .filter((ev) => ev.listen === 'test' && ev.script?.exec)
    .flatMap((ev) =>
      Array.isArray(ev.script!.exec) ? ev.script!.exec! : [ev.script!.exec as string]
    )
  node.scripts.postResponse = commentedScript(testExec, 'test script')

  stats.requestCount++
  return node
}

function convertV2Items(items: PmV2Item[], stats: ConvertStats): TreeNode[] {
  const out: TreeNode[] = []
  for (const item of items) {
    if (Array.isArray(item.item)) {
      const folder: FolderNode = {
        id: newId(),
        type: 'folder',
        name: item.name?.trim() || 'Folder',
        children: convertV2Items(item.item, stats)
      }
      out.push(folder)
    } else if (item.request !== undefined) {
      const node = convertV2Request(item, stats)
      if (node) out.push(node)
    }
  }
  return out
}

function convertV2Collection(pm: PmV2Collection, stats: ConvertStats): Collection {
  const variables = (pm.variable ?? [])
    .filter((v) => v.key)
    .map((v) => kv(v.key!, mapVars(String(v.value ?? '')), !v.disabled))
  // Collection-level bearer token → `token` variable, which Rewind's "inherit" auth picks up.
  if (pm.auth?.type === 'bearer') {
    const token = authParam(pm.auth.bearer, 'token')
    if (token && !variables.some((v) => v.key === 'token'))
      variables.push(kv('token', mapVars(token)))
  }
  return {
    id: newId(),
    name: pm.info?.name?.trim() || 'Postman import',
    version: 'v1',
    items: convertV2Items(pm.item ?? [], stats),
    ...(variables.length ? { variables } : {})
  }
}

/* ---------- v1 collection (Postman "Export data" dump) ---------- */

function convertV1Request(pm: PmV1Request, stats: ConvertStats): RequestNode | null {
  const method = (pm.method ?? 'GET').toUpperCase() as HttpMethod
  const name = pm.name?.trim() || `${method} request`
  if (!METHODS.includes(method)) {
    stats.warnings.push(`“${name}”: method ${method} isn't supported — skipped.`)
    return null
  }

  const headers: KV[] = []
  if (pm.headerData?.length) {
    for (const h of pm.headerData)
      if (h.key) headers.push(kv(h.key, mapVars(h.value ?? ''), !h.disabled))
  } else if (typeof pm.headers === 'string') {
    for (const line of pm.headers.split('\n')) {
      const idx = line.indexOf(':')
      if (idx <= 0) continue
      const key = line.slice(0, idx).trim()
      const disabled = key.startsWith('//')
      headers.push(kv(key.replace(/^\/\/\s*/, ''), mapVars(line.slice(idx + 1).trim()), !disabled))
    }
  }

  const node: RequestNode = {
    id: newId(),
    type: 'request',
    name,
    method,
    url: mapVars(pathVarsToRelay(pm.url ?? '')),
    headers,
    body: { mode: 'none', text: '' },
    auth: { mode: 'inherit' },
    scripts: { postResponse: '' },
    examples: []
  }

  if (pm.dataMode === 'raw') {
    const raw =
      typeof pm.rawModeData === 'string'
        ? pm.rawModeData
        : typeof pm.data === 'string'
          ? pm.data
          : ''
    if (raw.trim())
      node.body = {
        mode: looksLikeJson(raw) ? 'json' : 'text',
        text: mapVars(raw)
      }
  } else if (
    (pm.dataMode === 'urlencoded' || pm.dataMode === 'params') &&
    Array.isArray(pm.data) &&
    pm.data.length
  ) {
    formPairsToBody(pm.data, node, pm.dataMode === 'params')
  } else if (pm.dataMode === 'graphql' && pm.graphqlModeData?.query) {
    node.body = {
      mode: 'json',
      text: JSON.stringify({ query: pm.graphqlModeData.query, variables: {} }, null, 2)
    }
  }

  applyAuth(pm.auth, node, stats.warnings)
  if (pm.tests?.trim())
    node.scripts.postResponse = commentedScript(pm.tests.split('\n'), 'test script')

  stats.requestCount++
  return node
}

function convertV1Collection(pm: PmV1Collection, stats: ConvertStats): Collection {
  const requestsById = new Map<string, RequestNode>()
  const placed = new Set<string>()
  for (const req of pm.requests ?? []) {
    const node = convertV1Request(req, stats)
    if (node && req.id) requestsById.set(req.id, node)
  }

  const foldersById = new Map<string, FolderNode>()
  for (const f of pm.folders ?? []) {
    if (!f.id) continue
    foldersById.set(f.id, {
      id: newId(),
      type: 'folder',
      name: f.name?.trim() || 'Folder',
      children: []
    })
  }
  const childFolderIds = new Set<string>()
  for (const f of pm.folders ?? []) {
    const folder = f.id ? foldersById.get(f.id) : undefined
    if (!folder) continue
    for (const childId of f.folders_order ?? []) {
      const child = foldersById.get(childId)
      if (child) {
        folder.children.push(child)
        childFolderIds.add(childId)
      }
    }
    for (const reqId of f.order ?? []) {
      const req = requestsById.get(reqId)
      if (req) {
        folder.children.push(req)
        placed.add(reqId)
      }
    }
  }

  const items: TreeNode[] = []
  for (const folderId of pm.folders_order ?? []) {
    const folder = foldersById.get(folderId)
    if (folder && !childFolderIds.has(folderId)) items.push(folder)
  }
  for (const [id, folder] of foldersById) {
    if (!childFolderIds.has(id) && !items.includes(folder)) items.push(folder)
  }
  for (const reqId of pm.order ?? []) {
    const req = requestsById.get(reqId)
    if (req && !placed.has(reqId)) {
      items.push(req)
      placed.add(reqId)
    }
  }
  // Anything the order arrays missed still gets imported at the root.
  for (const [id, req] of requestsById) if (!placed.has(id)) items.push(req)

  const variables = (pm.variables ?? [])
    .filter((v) => v.key)
    .map((v) => kv(v.key!, mapVars(String(v.value ?? '')), !v.disabled))

  return {
    id: newId(),
    name: pm.name?.trim() || 'Postman import',
    version: 'v1',
    items,
    ...(variables.length ? { variables } : {})
  }
}

/* ---------- environments ---------- */

function convertEnvironment(pm: PmEnvironment, fallbackName: string): Environment {
  return {
    id: newId(),
    name: pm.name?.trim() || fallbackName,
    dotColor: 'ok',
    variables: (pm.values ?? [])
      .filter((v) => v.key)
      .map((v) => kv(v.key!, mapVars(String(v.value ?? '')), v.enabled !== false))
  }
}

/* ---------- entry point ---------- */

function isV2Collection(doc: Record<string, unknown>): boolean {
  const info = doc.info as PmV2Collection['info'] | undefined
  return !!info && Array.isArray(doc.item)
}

function isV1Collection(doc: Record<string, unknown>): boolean {
  return Array.isArray(doc.requests) && typeof doc.name === 'string'
}

function isEnvironment(doc: Record<string, unknown>): boolean {
  if (!Array.isArray(doc.values)) return false
  const scope = doc._postman_variable_scope
  return (
    scope === 'environment' ||
    scope === 'globals' ||
    (typeof doc.name === 'string' && !doc.requests && !doc.item)
  )
}

/**
 * Accepts any of Postman's JSON exports: a Collection v2.0/v2.1, an environment,
 * a globals file, or the full Settings → Data → "Export data" dump.
 */
export function convertPostman(raw: string): PostmanConversion {
  let doc: Record<string, unknown>
  try {
    doc = JSON.parse(raw) as Record<string, unknown>
  } catch {
    throw new Error(
      'File is not valid JSON. Export from Postman as JSON (Collection v2.x, environment, or data dump).'
    )
  }
  if (!doc || typeof doc !== 'object') throw new Error('File is not a Postman export.')

  const stats: ConvertStats = { requestCount: 0, warnings: [] }
  const collections: Collection[] = []
  const environments: Environment[] = []

  if (isV2Collection(doc)) {
    collections.push(convertV2Collection(doc as PmV2Collection, stats))
  } else if (isEnvironment(doc)) {
    environments.push(convertEnvironment(doc as PmEnvironment, 'Postman environment'))
  } else if (Array.isArray(doc.collections) || Array.isArray(doc.environments)) {
    const dump = doc as PmDump
    for (const c of dump.collections ?? []) {
      const col = c as Record<string, unknown>
      if (isV2Collection(col)) collections.push(convertV2Collection(col as PmV2Collection, stats))
      else if (isV1Collection(col))
        collections.push(convertV1Collection(col as PmV1Collection, stats))
    }
    for (const env of dump.environments ?? [])
      environments.push(convertEnvironment(env, 'Postman environment'))
    if (dump.globals?.length) {
      environments.push(
        convertEnvironment({ name: 'Postman globals', values: dump.globals }, 'Postman globals')
      )
    }
  } else if (isV1Collection(doc)) {
    collections.push(convertV1Collection(doc as PmV1Collection, stats))
  } else {
    throw new Error(
      'Not a Postman export (expected a Collection v2.x, an environment, or a data dump).'
    )
  }

  if (!collections.length && !environments.length) {
    throw new Error('Nothing importable found in this file.')
  }
  return {
    collections,
    environments,
    requestCount: stats.requestCount,
    warnings: stats.warnings
  }
}
