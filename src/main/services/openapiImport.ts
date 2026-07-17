import { parse as parseYaml } from 'yaml'
import type { Collection, FolderNode, HttpMethod, KV, RequestNode, TreeNode } from '@shared/types'
import { newId } from '@shared/id'

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

interface OpenApiDoc {
  openapi?: string
  swagger?: string
  info?: { title?: string; version?: string }
  servers?: { url?: string }[]
  host?: string
  basePath?: string
  schemes?: string[]
  paths?: Record<string, Record<string, Operation>>
  components?: { schemas?: Record<string, Schema> }
  definitions?: Record<string, Schema>
}

interface Operation {
  summary?: string
  operationId?: string
  tags?: string[]
  parameters?: Param[]
  requestBody?: {
    content?: Record<string, { schema?: Schema; example?: unknown }>
  }
  consumes?: string[]
}

interface Param {
  name?: string
  in?: string
  required?: boolean
  schema?: Schema
  type?: string
  example?: unknown
}

interface Schema {
  $ref?: string
  type?: string
  format?: string
  properties?: Record<string, Schema>
  items?: Schema
  required?: string[]
  example?: unknown
  default?: unknown
  enum?: unknown[]
  oneOf?: Schema[]
  anyOf?: Schema[]
  allOf?: Schema[]
  additionalProperties?: Schema | boolean
}

export interface OpenApiConversion {
  collection: Collection
  requestCount: number
  folderCount: number
}

export function parseSpec(raw: string): OpenApiDoc {
  // YAML is a superset of JSON, so one parser covers both.
  const doc = parseYaml(raw) as OpenApiDoc
  if (!doc || typeof doc !== 'object') throw new Error('File is not valid JSON or YAML.')
  if (!doc.openapi && !doc.swagger) throw new Error('Not an OpenAPI document (missing "openapi" or "swagger" field).')
  if (!doc.paths || typeof doc.paths !== 'object') throw new Error('OpenAPI document has no paths.')
  return doc
}

function kv(key: string, value: string): KV {
  return { id: newId(6), key, value, enabled: true }
}

function baseUrlOf(doc: OpenApiDoc): string {
  const server = doc.servers?.find((s) => s.url)?.url
  if (server) return server.replace(/\/+$/, '')
  if (doc.host) {
    const scheme = doc.schemes?.includes('https') ? 'https' : (doc.schemes?.[0] ?? 'https')
    return `${scheme}://${doc.host}${doc.basePath ?? ''}`.replace(/\/+$/, '')
  }
  return 'https://'
}

function resolveRef(schema: Schema | undefined, doc: OpenApiDoc): Schema | undefined {
  if (!schema?.$ref) return schema
  const name = schema.$ref.split('/').pop() ?? ''
  return doc.components?.schemas?.[name] ?? doc.definitions?.[name]
}

function exampleFromSchema(schema: Schema | undefined, doc: OpenApiDoc, depth = 0): unknown {
  if (!schema || depth > 5) return null
  schema = resolveRef(schema, doc) ?? schema
  if (schema.example !== undefined) return schema.example
  if (schema.default !== undefined) return schema.default
  if (schema.enum?.length) return schema.enum[0]
  if (schema.allOf?.length) {
    const merged: Record<string, unknown> = {}
    for (const part of schema.allOf) {
      const v = exampleFromSchema(part, doc, depth + 1)
      if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(merged, v)
    }
    return merged
  }
  if (schema.oneOf?.length) return exampleFromSchema(schema.oneOf[0], doc, depth + 1)
  if (schema.anyOf?.length) return exampleFromSchema(schema.anyOf[0], doc, depth + 1)
  switch (schema.type) {
    case 'object':
    case undefined: {
      if (!schema.properties) return {}
      const out: Record<string, unknown> = {}
      for (const [key, prop] of Object.entries(schema.properties)) {
        out[key] = exampleFromSchema(prop, doc, depth + 1)
      }
      return out
    }
    case 'array':
      return [exampleFromSchema(schema.items, doc, depth + 1)]
    case 'string':
      switch (schema.format) {
        case 'email':
          return 'user@example.com'
        case 'uuid':
          return '00000000-0000-0000-0000-000000000000'
        case 'date':
          return '2026-01-01'
        case 'date-time':
          return '2026-01-01T00:00:00Z'
        case 'uri':
          return 'https://example.com'
        default:
          return 'string'
      }
    case 'integer':
    case 'number':
      return 0
    case 'boolean':
      return true
    default:
      return null
  }
}

/** `/users/{id}/orders` → `/users/{{id}}/orders` (our variable syntax). */
function pathToUrl(p: string): string {
  return p.replace(/\{([^}]+)\}/g, '{{$1}}')
}

function buildRequest(method: HttpMethod, path: string, op: Operation, doc: OpenApiDoc): RequestNode {
  const params = op.parameters ?? []
  const requiredQuery = params.filter((x) => x.in === 'query' && x.required && x.name)
  const query = requiredQuery.length
    ? '?' + requiredQuery.map((x) => `${x.name}={{${x.name}}}`).join('&')
    : ''

  const headers: KV[] = []
  for (const h of params.filter((x) => x.in === 'header' && x.required && x.name)) {
    headers.push(kv(h.name!, `{{${h.name}}}`))
  }

  let bodyText = ''
  let bodyMode: RequestNode['body']['mode'] = 'none'
  const content = op.requestBody?.content
  if (content) {
    const jsonType = Object.keys(content).find((t) => t.includes('json')) ?? Object.keys(content)[0]
    const media = jsonType ? content[jsonType] : undefined
    if (media) {
      const example = media.example ?? exampleFromSchema(media.schema, doc)
      bodyText = JSON.stringify(example, null, 2) ?? ''
      bodyMode = 'json'
      headers.unshift(kv('Content-Type', jsonType ?? 'application/json'))
    }
  } else if (op.consumes?.length && ['POST', 'PUT', 'PATCH'].includes(method)) {
    headers.unshift(kv('Content-Type', op.consumes[0]))
  }

  return {
    id: newId(),
    type: 'request',
    name: op.summary?.trim() || op.operationId || `${method} ${path}`,
    method,
    url: `{{baseUrl}}${pathToUrl(path)}${query}`,
    headers,
    body: { mode: bodyMode, text: bodyText },
    auth: { mode: 'inherit' },
    scripts: { postResponse: '' },
    examples: []
  }
}

export function convertToCollection(doc: OpenApiDoc): OpenApiConversion {
  const folders = new Map<string, FolderNode>()
  const rootItems: TreeNode[] = []
  let requestCount = 0

  for (const [path, ops] of Object.entries(doc.paths ?? {})) {
    for (const [methodKey, op] of Object.entries(ops ?? {})) {
      const method = methodKey.toUpperCase() as HttpMethod
      if (!METHODS.includes(method) || !op || typeof op !== 'object') continue
      const request = buildRequest(method, path, op, doc)
      requestCount++
      const tag = op.tags?.[0] ?? path.split('/').filter(Boolean)[0] ?? ''
      if (!tag) {
        rootItems.push(request)
        continue
      }
      let folder = folders.get(tag)
      if (!folder) {
        folder = { id: newId(), type: 'folder', name: tag, children: [] }
        folders.set(tag, folder)
        rootItems.push(folder)
      }
      folder.children.push(request)
    }
  }

  if (!requestCount) throw new Error('No importable operations found in this spec.')

  const version = doc.info?.version ? `v${String(doc.info.version).replace(/^v/i, '')}` : 'v1'
  const collection: Collection = {
    id: newId(),
    name: doc.info?.title?.trim() || 'Imported API',
    version: version.slice(0, 12),
    items: rootItems,
    variables: [kv('baseUrl', baseUrlOf(doc))]
  }
  return { collection, requestCount, folderCount: folders.size }
}
