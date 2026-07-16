import { diffLines } from 'diff'

export type DiffKind = 'same' | 'add' | 'del' | 'chg'

export interface DiffRow {
  kind: DiffKind
  text: string
}

function normalize(text: string): string {
  try {
    // Do NOT sort keys: order changes in an API response are real changes.
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

function splitLines(value: string): string[] {
  const lines = value.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

const isWord = (ch: string | undefined): boolean => !!ch && /[\w.]/.test(ch)

/** Merge an old/new line pair into the compact "prefix old → new suffix" form. */
function mergeChanged(a: string, b: string): string {
  let p = 0
  while (p < a.length && p < b.length && a[p] === b[p]) p++
  // Back off to a token boundary so "2000 → 2500" never renders as "20 → 500".
  while (p > 0 && isWord(a[p - 1]) && (isWord(a[p]) || isWord(b[p]))) p--
  let s = 0
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++
  while (s > 0 && isWord(a[a.length - s]) && (isWord(a[a.length - s - 1]) || isWord(b[b.length - s - 1]))) s--
  const oldMid = a.slice(p, a.length - s).trim()
  const newMid = b.slice(p, b.length - s).trim()
  if (!oldMid && !newMid) return a
  return `${a.slice(0, p)}${oldMid || '∅'} → ${newMid || '∅'}${a.slice(a.length - s)}`
}

/**
 * Line diff between two (JSON) bodies. Adjacent removed+added hunks are
 * paired positionally into `chg` rows — the design's four row states.
 */
export function jsonDiff(oldText: string, newText: string): DiffRow[] {
  const parts = diffLines(normalize(oldText), normalize(newText))
  const rows: DiffRow[] = []
  let pendingDel: string[] = []

  const flushDel = (): void => {
    for (const line of pendingDel) rows.push({ kind: 'del', text: line })
    pendingDel = []
  }

  for (const part of parts) {
    const lines = splitLines(part.value)
    if (part.removed) {
      flushDel()
      pendingDel = lines
    } else if (part.added) {
      const n = Math.min(pendingDel.length, lines.length)
      for (let i = 0; i < n; i++) rows.push({ kind: 'chg', text: mergeChanged(pendingDel[i], lines[i]) })
      for (let i = n; i < pendingDel.length; i++) rows.push({ kind: 'del', text: pendingDel[i] })
      for (let i = n; i < lines.length; i++) rows.push({ kind: 'add', text: lines[i] })
      pendingDel = []
    } else {
      flushDel()
      for (const line of lines) rows.push({ kind: 'same', text: line })
    }
  }
  flushDel()
  return rows
}

export const DIFF_GUTTER: Record<DiffKind, string> = { same: ' ', add: '+', del: '−', chg: '~' }
