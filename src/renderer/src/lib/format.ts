export function fmtBytes(n: number | undefined): string {
  if (n == null) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(2)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

export function fmtMs(n: number): string {
  if (n >= 10_000) return `${(n / 1000).toFixed(1)} s`
  return `${n} ms`
}

const pad = (n: number) => String(n).padStart(2, '0')

export function timeOfDay(ts: number): string {
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function daysAgo(ts: number): number {
  const today = startOfDay(Date.now())
  return Math.round((today - startOfDay(ts)) / 86_400_000)
}

/** Compact time for run rows: "10:42:18", "Yest 18:03", "Jul 12 18:03". */
export function runTime(ts: number): string {
  const ago = daysAgo(ts)
  const d = new Date(ts)
  if (ago === 0) return timeOfDay(ts)
  if (ago === 1) return `Yest ${pad(d.getHours())}:${pad(d.getMinutes())}`
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Group label for the History page: TODAY / YESTERDAY / JUL 12. */
export function dayLabel(ts: number): string {
  const ago = daysAgo(ts)
  if (ago === 0) return 'TODAY'
  if (ago === 1) return 'YESTERDAY'
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase()
}

/** Pretty-print JSON for display; non-JSON comes back untouched. */
export function prettyJson(text: string): string {
  const trimmed = text.trim()
  if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) return text
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

export function urlPath(url: string): string {
  try {
    const u = new URL(url)
    return u.pathname + u.search
  } catch {
    return url.replace(/^\w+:\/\/[^/]+/, '') || url
  }
}
