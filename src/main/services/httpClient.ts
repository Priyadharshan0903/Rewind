import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { RunRequest, RunResponse } from '@shared/types'

const inflight = new Map<string, AbortController>()

const DEFAULT_TIMEOUT_MS = 30_000

export interface HttpResult {
  response?: RunResponse
  error?: string
  durationMs: number
}

export async function sendHttp(
  sendId: string,
  req: RunRequest,
  bodyLimitBytes: number
): Promise<HttpResult> {
  const controller = new AbortController()
  inflight.set(sendId, controller)
  const timer = setTimeout(
    () => controller.abort(new Error('Request timed out (30s)')),
    DEFAULT_TIMEOUT_MS
  )
  const started = performance.now()
  try {
    const headers = new Headers()
    for (const [k, v] of req.headers) headers.append(k, v)
    const noBodyMethod = ['GET', 'HEAD'].includes(req.method)
    let body: string | FormData | undefined
    if (req.bodyForm && !noBodyMethod) {
      const form = new FormData()
      for (const f of req.bodyForm) {
        if (f.type === 'file') {
          const buf = await fs.readFile(f.value)
          form.append(f.name, new Blob([buf]), path.basename(f.value))
        } else {
          form.append(f.name, f.value)
        }
      }
      body = form // fetch sets the multipart Content-Type with boundary
    } else if (req.bodyText.trim().length > 0 && !noBodyMethod) {
      body = req.bodyText
    }
    const res = await fetch(req.url, {
      method: req.method,
      headers,
      body,
      redirect: 'follow',
      signal: controller.signal
    })
    const raw = await res.text()
    const durationMs = Math.round(performance.now() - started)
    const sizeBytes = Buffer.byteLength(raw, 'utf8')
    const truncated = sizeBytes > bodyLimitBytes
    const resHeaders: [string, string][] = []
    res.headers.forEach((v, k) => resHeaders.push([k, v]))
    return {
      durationMs,
      response: {
        status: res.status,
        statusText: res.statusText || statusName(res.status),
        headers: resHeaders,
        bodyText: truncated ? raw.slice(0, bodyLimitBytes) : raw,
        bodyTruncated: truncated,
        sizeBytes
      }
    }
  } catch (err) {
    const durationMs = Math.round(performance.now() - started)
    return { durationMs, error: describeError(err) }
  } finally {
    clearTimeout(timer)
    inflight.delete(sendId)
  }
}

export function cancelSend(sendId: string): void {
  inflight.get(sendId)?.abort(new Error('Canceled'))
}

function describeError(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as { cause?: { code?: string; message?: string } }).cause
    if (cause?.code) return `${err.message} (${cause.code})`
    return err.message
  }
  return String(err)
}

function statusName(code: number): string {
  const names: Record<number, string> = {
    200: 'OK',
    201: 'Created',
    204: 'No Content',
    301: 'Moved Permanently',
    302: 'Found',
    400: 'Bad Request',
    401: 'Unauthorized',
    402: 'Payment Required',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable'
  }
  return names[code] ?? ''
}
