import { useEffect, useMemo, useRef, useState } from 'react'

export interface VarItem {
  name: string
  value: string
  dynamic?: boolean
}

const DYNAMIC_ITEMS: VarItem[] = [
  { name: '$uuid', value: 'fresh UUID at send time', dynamic: true },
  { name: '$timestamp', value: 'unix seconds at send time', dynamic: true }
]

const TRIGGER_RE = /\{\{\s*(\$?[\w-]*)$/
const DROPDOWN_W = 280

let measureCtx: CanvasRenderingContext2D | null = null
function measureText(text: string, font: string): number {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')
  if (!measureCtx) return 0
  measureCtx.font = font
  return measureCtx.measureText(text).width
}

interface Options {
  vars: Record<string, string>
  mode: 'input' | 'textarea'
  font: string
  lineHeight?: number
  padTop?: number
  padLeft?: number
  /** Commit the completed text and restore the caret. */
  apply: (text: string, caret: number, el: HTMLInputElement | HTMLTextAreaElement) => void
}

interface SuggestState {
  start: number
  query: string
  x: number
  y: number
}

/**
 * Postman-style `{{` autocomplete for inputs and textareas. Call `check(el)`
 * on every change, route `onKeyDown` through it, render `dropdown`.
 */
export function useVarSuggest(opts: Options): {
  check: (el: HTMLInputElement | HTMLTextAreaElement) => void
  onKeyDown: (e: React.KeyboardEvent) => boolean
  onBlur: () => void
  dropdown: React.JSX.Element | null
} {
  const [state, setState] = useState<SuggestState | null>(null)
  const [active, setActive] = useState(0)
  const elRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const items = useMemo(() => {
    if (!state) return []
    const q = state.query.toLowerCase()
    const all: VarItem[] = [
      ...Object.entries(opts.vars).map(([name, value]) => ({ name, value })),
      ...DYNAMIC_ITEMS
    ]
    const filtered = q ? all.filter((it) => it.name.toLowerCase().includes(q)) : all
    return filtered.sort((a, b) => {
      const aw = a.name.toLowerCase().startsWith(q) ? 0 : 1
      const bw = b.name.toLowerCase().startsWith(q) ? 0 : 1
      return aw - bw || a.name.localeCompare(b.name)
    })
  }, [state, opts.vars])

  useEffect(() => setActive(0), [state?.query, state?.start])

  useEffect(() => {
    listRef.current?.querySelector('.var-item-active')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const close = (): void => setState(null)

  const check = (el: HTMLInputElement | HTMLTextAreaElement): void => {
    elRef.current = el
    const caret = el.selectionStart ?? 0
    const before = el.value.slice(0, caret)
    const m = TRIGGER_RE.exec(before)
    if (!m) {
      close()
      return
    }
    const query = m[1]
    const start = caret - query.length
    const rect = el.getBoundingClientRect()
    let x: number
    let y: number
    if (opts.mode === 'input') {
      const inner = (opts.padLeft ?? 12) + measureText(el.value.slice(0, start), opts.font) - el.scrollLeft
      x = rect.left + Math.max(0, Math.min(inner, rect.width - 40))
      y = rect.bottom + 4
    } else {
      const lines = before.split('\n')
      const row = lines.length - 1
      const col = lines[row].length
      const lineH = opts.lineHeight ?? 21
      const charW = measureText('0', opts.font)
      x = rect.left + (opts.padLeft ?? 0) + col * charW - el.scrollLeft
      y = rect.top + (opts.padTop ?? 12) + (row + 1) * lineH - el.scrollTop + 2
    }
    x = Math.max(8, Math.min(x, window.innerWidth - DROPDOWN_W - 8))
    if (y > window.innerHeight - 60) y = rect.top - 8 - 190
    setState({ start, query, x, y })
  }

  const pick = (item: VarItem): void => {
    const el = elRef.current
    if (!el || !state) return
    const caret = el.selectionStart ?? 0
    const after = el.value.slice(caret)
    const closing = after.startsWith('}}') ? '' : '}}'
    const text = el.value.slice(0, state.start) + item.name + closing + el.value.slice(caret)
    const newCaret = state.start + item.name.length + 2
    close()
    opts.apply(text, newCaret, el)
  }

  const onKeyDown = (e: React.KeyboardEvent): boolean => {
    if (!state || !items.length) return false
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActive((a) => (a + 1) % items.length)
        return true
      case 'ArrowUp':
        e.preventDefault()
        setActive((a) => (a - 1 + items.length) % items.length)
        return true
      case 'Enter':
      case 'Tab':
        e.preventDefault()
        pick(items[active])
        return true
      case 'Escape':
        e.preventDefault()
        e.stopPropagation()
        close()
        return true
      default:
        return false
    }
  }

  const dropdown =
    state && items.length ? (
      <div className="var-suggest" style={{ left: state.x, top: state.y }} ref={listRef}>
        {items.map((it, i) => (
          <button
            key={it.name}
            className={i === active ? 'var-item var-item-active' : 'var-item'}
            onMouseDown={(e) => {
              e.preventDefault()
              pick(it)
            }}
            onMouseEnter={() => setActive(i)}
          >
            <span className="var-item-name code-font">{`{{${it.name}}}`}</span>
            <span className="var-item-value">{it.dynamic ? it.value : truncate(it.value, 30) || '(empty)'}</span>
          </button>
        ))}
      </div>
    ) : null

  return { check, onKeyDown, onBlur: close, dropdown }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
