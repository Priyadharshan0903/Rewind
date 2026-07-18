export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export interface KV {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

/** One urlencoded / form-data field; for `type: 'file'`, `value` is the file path. */
export interface FormField extends KV {
  type: "text" | "file";
}

export interface Workspace {
  schemaVersion: 1;
  id: string;
  name: string;
  activeEnvironmentId: string;
  createdAt: number;
}

export type ThemeSetting = "light" | "dark";
export type AccentId = "indigo" | "teal" | "amber" | "magenta";

export const ACCENTS: Record<AccentId, string> = {
  indigo: "#4e5dd3",
  teal: "#0f766e",
  amber: "#a85a14",
  magenta: "#b0366b",
};

export interface Settings {
  theme: ThemeSetting;
  accent: AccentId;
  historyPanelOpen: boolean;
  sidebarOpen: boolean;
  responsePaneOpen: boolean;
  responseBodyLimitBytes: number;
  /** Height of the request editor area (draggable splitter). */
  requestPaneHeight: number;
  /** Width of the collection sidebar (draggable splitter). */
  sidebarWidth: number;
}

export interface Environment {
  id: string;
  name: string;
  dotColor: "ok" | "warn" | "err";
  variables: KV[];
}

export interface RequestAuth {
  mode: "inherit" | "bearer" | "basic" | "apikey" | "none";
  token?: string;
  username?: string;
  password?: string;
  /** API key: header/param name and value. */
  key?: string;
  value?: string;
  addTo?: "header" | "query";
}

export interface RequestBody {
  mode: "none" | "json" | "text" | "urlencoded" | "formdata";
  text: string;
  /** Fields for the urlencoded / formdata modes. */
  form?: FormField[];
}

export interface SavedExample {
  id: string;
  name: string;
  status: number;
  headers: [string, string][];
  bodyText: string;
  savedAt: number;
}

/** Declarative chaining: pull a value out of this response into a variable. */
export interface Capture {
  id: string;
  enabled: boolean;
  /** Where to read from: the JSON body, a response header, or the status code. */
  source: "body" | "header" | "status";
  /** body: dot/bracket path (e.g. data.id, items[0].id); header: header name; status: ignored. */
  path: string;
  /** Environment variable to write the captured value into. */
  variable: string;
}

export interface RequestNode {
  id: string;
  type: "request";
  name: string;
  method: HttpMethod;
  url: string;
  headers: KV[];
  /** Query params, kept in two-way sync with the url's query string (disabled rows live only here). */
  params?: KV[];
  body: RequestBody;
  auth: RequestAuth;
  scripts: { postResponse: string };
  /** Response-to-variable captures run after each send (before the script). */
  captures?: Capture[];
  examples: SavedExample[];
}

export interface FolderNode {
  id: string;
  type: "folder";
  name: string;
  children: TreeNode[];
}

export type TreeNode = FolderNode | RequestNode;

export interface Collection {
  id: string;
  name: string;
  version: string;
  items: TreeNode[];
  /** Collection-level variables; environment variables win on name collision. */
  variables?: KV[];
}

export interface RunRequest {
  method: HttpMethod;
  url: string;
  headers: [string, string][];
  bodyText: string;
  /** Resolved multipart fields; when present the request is sent as multipart/form-data. */
  bodyForm?: { name: string; value: string; type: "text" | "file" }[];
}

export interface RunResponse {
  status: number;
  statusText: string;
  headers: [string, string][];
  bodyText: string;
  bodyTruncated: boolean;
  sizeBytes: number;
}

export interface RunAssertion {
  expr: string;
  pass: boolean;
  message?: string;
}

export interface RunScriptResult {
  assertions: RunAssertion[];
  varsSet: Record<string, string>;
  logs: string[];
  error?: string;
}

export interface Run {
  id: string;
  ts: number;
  requestId: string;
  requestName: string;
  collectionId: string;
  envId: string;
  envName: string;
  durationMs: number;
  request: RunRequest;
  response?: RunResponse;
  script?: RunScriptResult;
  /** Variables set by declarative captures (name → value), surfaced to the UI. */
  captured?: Record<string, string>;
  error?: string;
}

export interface RunSummary {
  id: string;
  ts: number;
  requestId: string;
  requestName: string;
  method: HttpMethod;
  url: string;
  status?: number;
  statusText?: string;
  durationMs: number;
  sizeBytes?: number;
  error?: string;
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
    error: run.error,
  };
}

export interface RelayBundle {
  format: "rewind-bundle";
  version: 1;
  exportedAt: number;
  workspace: Workspace;
  collections: Collection[];
  environments: Environment[];
  runs?: Run[];
}

export interface BootPayload {
  workspace: Workspace;
  settings: Settings;
  environments: Environment[];
  collections: Collection[];
}

export interface ProfileInfo {
  id: string;
  name: string;
  createdAt: number;
}

export interface ProfilesState {
  activeId: string;
  profiles: ProfileInfo[];
}

export interface SendPayload {
  sendId: string;
  collectionId: string;
  request: RequestNode;
}

export interface RunsQuery {
  requestId?: string;
  statusClass?: "all" | "2xx" | "4xx";
  method?: HttpMethod | "all";
  limit?: number;
}

export interface ExportResult {
  canceled?: boolean;
  path?: string;
  error?: string;
}

export interface OpenApiImportResult {
  canceled?: boolean;
  error?: string;
  collection?: Collection;
  counts?: { requests: number; folders: number };
}

export interface PostmanImportResult {
  canceled?: boolean;
  error?: string;
  collections?: Collection[];
  /** Full environment list after the import (existing + newly imported). */
  environments?: Environment[];
  counts?: { collections: number; environments: number; requests: number };
  warnings?: string[];
}

export interface ImportResult {
  canceled?: boolean;
  ok?: boolean;
  error?: string;
  counts?: { collections: number; environments: number; runs: number };
  boot?: BootPayload;
}
