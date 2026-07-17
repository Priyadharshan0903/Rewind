export interface FindMatch {
  line: number
  col: number
}

export const MAX_MATCHES = 500

/** Case-insensitive positions of query in text, capped for perf. */
export function findMatches(text: string, query: string): FindMatch[] {
  if (!query) return []
  const out: FindMatch[] = []
  const haystack = text.toLowerCase()
  const needle = query.toLowerCase()
  let line = 0
  let lineStart = 0
  let from = 0
  while (out.length < MAX_MATCHES) {
    const at = haystack.indexOf(needle, from)
    if (at < 0) break
    // advance line/lineStart to the match position
    let nl = text.indexOf('\n', lineStart)
    while (nl !== -1 && nl < at) {
      line++
      lineStart = nl + 1
      nl = text.indexOf('\n', lineStart)
    }
    out.push({ line, col: at - lineStart })
    from = at + needle.length
  }
  return out
}

export function normIndex(idx: number, total: number): number {
  if (!total) return 0
  return ((idx % total) + total) % total
}

let measureCtx: CanvasRenderingContext2D | null = null
export function charWidth(font: string): number {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')
  if (!measureCtx) return 7.2
  measureCtx.font = font
  return measureCtx.measureText('0').width
}
