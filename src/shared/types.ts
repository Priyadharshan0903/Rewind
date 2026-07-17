export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface KV {
  id: string
  key: string
  value: string
  enabled: boolean
}

export interface Workspace {
  schemaVersion: 1
  id: string
  name: string
  activeEnvironmentId: string
  createdAt: number
}

export type ThemeSetting = 'light' | 'dark'
export type AccentId = 'indigo' | 'teal' | 'amber' | 'magenta'

export const ACCENTS: Record<AccentId, string> = {
  indigo: '#4e5dd3',
  teal: '#0f766e',
  amber: '#a85a14',
  magenta: '#b0366b'
}

export interface Settings {
  theme: ThemeSetting
  accent: AccentId
  historyPanelOpen: boolean
  sidebarOpen: boolean
  responsePaneOpen: boolean
  responseBodyLimitBytes: number
  /** Height of the request editor area (draggable splitter). */
  requestPaneHeight: number
  /** Width of the collection sidebar (draggable splitter). */
  sidebarWidth: number
}

export interface Environment {
  id: string
  name: string
  dotColor: 'ok' | 'warn' | 'err'
  variables: KV[]
}

export interface RequestAuth {
  mode: 'inherit' | 'bearer' | 'none'
  token?: string
}

export interface RequestBody {
  mode: 'none' | 'json' | 'text'
  text: string
}

export interface SavedExample {
  id: string
  name: string
  status: number
  headers: [string, string][]
  bodyText: string
  savedAt: number
}

export interface RequestNode {
  id: string
  type: 'request'
  name: string
  method: HttpMethod
  url: string
  headers: KV[]
  body: RequestBody
  auth: RequestAuth
  scripts: { postResponse: string }
  examples: SavedExample[]
}

export interface FolderNode {
  id: string
  type: 'folder'
  name: string
  children: TreeNode[]
}

export type TreeNode = FolderNode | RequestNode

export interface Collection {
  id: string
  name: string
  version: string
  items: TreeNode[]
  /** Collection-level variables; environment variables win on name collision. */
  variables?: KV[]
}

export interface RunRequest {
  method: HttpMethod
  url: string
  headers: [string, string][]
  bodyText: string
}

export interface RunResponse {
  status: number
  statusText: string
  headers: [string, string][]
  bodyText: string
  bodyTruncated: boolean
  sizeBytes: number
}

export interface RunAssertion {
  expr: string
  pass: boolean
  message?: string
}

export interface RunScriptResult {
  assertions: RunAssertion[]
  varsSet: Record<string, string>
  logs: string[]
  error?: string
}

export interface Run {
  id: string
  ts: number
  requestId: string
  requestName: string
  collectionId: string
  envId: string
  envName: string
  durationMs: number
  request: RunRequest
  response?: RunResponse
  script?: RunScriptResult
  error?: string
}

export interface RunSummary {
  id: string
  ts: number
  requestId: string
  requestName: string
  method: HttpMethod
  url: string
  status?: number
  statusText?: string
  durationMs: number
  sizeBytes?: number
  error?: string
}

export function toSummary(run: Run): RunSummary {
  return {
    id: run.id,
    ts: run.ts,
    requestId: run.requestId,
    requestName: run.requestName,
    method: run.request.method,
    url: run.request.url,
    status: run.response?.status,
    statusText: run.response?.statusText,
    durationMs: run.durationMs,
    sizeBytes: run.response?.sizeBytes,
    error: run.error
  }
}

export interface RelayBundle {
  format: 'relay-bundle'
  version: 1
  exportedAt: number
  workspace: Workspace
  collections: Collection[]
  environments: Environment[]
  runs?: Run[]
}

export interface BootPayload {
  workspace: Workspace
  settings: Settings
  environments: Environment[]
  collections: Collection[]
}

export interface ProfileInfo {
  id: string
  name: string
  createdAt: number
}

export interface ProfilesState {
  activeId: string
  profiles: ProfileInfo[]
}

export interface SendPayload {
  sendId: string
  collectionId: string
  request: RequestNode
}

export interface RunsQuery {
  requestId?: string
  statusClass?: 'all' | '2xx' | '4xx'
  method?: HttpMethod | 'all'
  limit?: number
}

export interface ExportResult {
  canceled?: boolean
  path?: string
  error?: string
}

export interface OpenApiImportResult {
  canceled?: boolean
  error?: string
  collection?: Collection
  counts?: { requests: number; folders: number }
}

export interface PostmanImportResult {
  canceled?: boolean
  error?: string
  collections?: Collection[]
  /** Full environment list after the import (existing + newly imported). */
  environments?: Environment[]
  counts?: { collections: number; environments: number; requests: number }
  warnings?: string[]
}

export interface ImportResult {
  canceled?: boolean
  ok?: boolean
  error?: string
  counts?: { collections: number; environments: number; runs: number }
  boot?: BootPayload
}
