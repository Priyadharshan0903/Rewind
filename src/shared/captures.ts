import type { Capture } from './types'

/** The slice of a response a capture reads from — shared by main (real) and renderer (preview). */
export interface CaptureSource {
  status: number
  headers: [string, string][]
  bodyText: string
}

/** Strip friendly prefixes so `res.json.data.id`, `$.data.id`, and `data.id` all work. */
function normalizePath(path: string): string {
  return path
    .trim()
    .replace(/^\$\.?/, '')
    .replace(/^res\.(json|body)\.?/i, '')
    .replace(/^json\.?/i, '')
}

/** Parse `data.items[0].id` into ['data','items',0,'id']. */
function parsePath(path: string): (string | number)[] {
  const out: (string | number)[] = []
  const re = /([^.[\]]+)|\[(\d+)\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(path)) !== null) {
    if (m[2] !== undefined) out.push(Number(m[2]))
    else out.push(m[1])
  }
  return out
}

export function valueAtPath(root: unknown, path: string): unknown {
  const tokens = parsePath(normalizePath(path))
  let cur: unknown = root
  for (const t of tokens) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string | number, unknown>)[t]
  }
  return cur
}

function stringify(v: unknown): string {
  return typeof v === 'object' ? JSON.stringify(v) : String(v)
}

export interface CaptureEval {
  matched: boolean
  value?: string
}

/** Evaluate a single capture against a response. */
export function evalCapture(cap: Capture, resp: CaptureSource): CaptureEval {
  if (cap.source === 'status') return { matched: true, value: String(resp.status) }
  if (cap.source === 'header') {
    const name = cap.path.trim().toLowerCase()
    if (!name) return { matched: false }
    const hit = resp.headers.find(([k]) => k.toLowerCase() === name)
    return hit ? { matched: true, value: hit[1] } : { matched: false }
  }
  // body
  let json: unknown
  try {
    json = JSON.parse(resp.bodyText)
  } catch {
    return { matched: false }
  }
  const v = valueAtPath(json, cap.path)
  if (v === undefined || v === null) return { matched: false }
  return { matched: true, value: stringify(v) }
}

/** Run every enabled capture, returning the variable → value map to apply. */
export function runCaptures(captures: Capture[], resp: CaptureSource): Record<string, string> {
  const out: Record<string, string> = {}
  for (const cap of captures) {
    if (!cap.enabled || !cap.variable.trim()) continue
    const r = evalCapture(cap, resp)
    if (r.matched && r.value !== undefined) out[cap.variable.trim()] = r.value
  }
  return out
}
