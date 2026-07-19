import { useEffect, useRef, useState } from 'react'
import { useUi } from '@/stores/ui'

// Same icons as the Runbook FindBar, so the two find bars look identical.
const IconUp = (
  <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden>
    <path d="M3.5 10l4.5-4.5L12.5 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const IconDown = (
  <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden>
    <path d="M3.5 6l4.5 4.5L12.5 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const IconClose = (
  <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden>
    <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)
const IconSearch = (
  <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden>
    <circle cx="7" cy="7" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path d="M10.2 10.2L14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
)

const HL_ALL = 'rewind-find'
const HL_CUR = 'rewind-find-current'
const MAX_MATCHES = 500

// The CSS Custom Highlight API isn't in the TS DOM lib yet — narrow casts.
type HighlightRegistry = { set: (k: string, h: object) => void; delete: (k: string) => void }
const registry = (): HighlightRegistry | null =>
  (CSS as unknown as { highlights?: HighlightRegistry }).highlights ?? null
const HighlightCtor = (): (new (...ranges: Range[]) => object) | null =>
  (window as unknown as { Highlight?: new (...ranges: Range[]) => object }).Highlight ?? null

function clearHighlights(): void {
  const reg = registry()
  reg?.delete(HL_ALL)
  reg?.delete(HL_CUR)
}

/** Collect ranges for every case-insensitive match of `query` under `root`. */
function collectRanges(root: Element, query: string): Range[] {
  const out: Range[] = []
  const q = query.toLowerCase()
  if (!q) return out
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT
      // Don't highlight the find bar's own text.
      if (node.parentElement?.closest('.find-bar')) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    }
  })
  let node = walker.nextNode()
  while (node && out.length < MAX_MATCHES) {
    const text = (node.nodeValue ?? '').toLowerCase()
    let i = text.indexOf(q)
    while (i !== -1 && out.length < MAX_MATCHES) {
      const range = new Range()
      range.setStart(node, i)
      range.setEnd(node, i + query.length)
      out.push(range)
      i = text.indexOf(q, i + query.length)
    }
    node = walker.nextNode()
  }
  return out
}

/**
 * ⌘F for views without an editor find (History, Docs). Uses the CSS Custom
 * Highlight API styled to match the Runbook find marks, and the same find bar.
 */
export function InPageFind(): React.JSX.Element {
  const closePageFind = useUi((s) => s.closePageFind)
  const view = useUi((s) => s.view)
  const [query, setQuery] = useState('')
  const [idx, setIdx] = useState(0)
  const [count, setCount] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.select()
    return () => clearHighlights()
  }, [])

  // Re-run whenever the query or the current index changes.
  useEffect(() => {
    const root = document.querySelector('.history-page') ?? document.querySelector('.docs-view')
    const ranges = root ? collectRanges(root, query) : []
    setCount(ranges.length)
    const reg = registry()
    const Ctor = HighlightCtor()
    if (!reg || !Ctor || !ranges.length) {
      clearHighlights()
      return
    }
    const cur = ((idx % ranges.length) + ranges.length) % ranges.length
    reg.set(HL_ALL, new Ctor(...ranges))
    reg.set(HL_CUR, new Ctor(ranges[cur]))
    ranges[cur].startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [query, idx, view])

  const step = (dir: 1 | -1): void => setIdx((i) => i + dir)
  const shown = count ? ((((idx % count) + count) % count) + 1) : 0

  return (
    <div className="find-bar page-find-bar">
      <span className="find-icon">{IconSearch}</span>
      <input
        ref={inputRef}
        autoFocus
        placeholder="Find on page…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setIdx(0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            step(e.shiftKey ? -1 : 1)
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            closePageFind()
          }
        }}
        spellCheck={false}
      />
      <span className="find-count code-font">
        {query ? `${shown}/${count >= MAX_MATCHES ? `${MAX_MATCHES}+` : count}` : ''}
      </span>
      <button className="icon-btn" title="Previous (Shift+Enter)" disabled={!count} onClick={() => step(-1)}>
        {IconUp}
      </button>
      <button className="icon-btn" title="Next (Enter)" disabled={!count} onClick={() => step(1)}>
        {IconDown}
      </button>
      <button className="icon-btn" title="Close (Esc)" onClick={closePageFind}>
        {IconClose}
      </button>
    </div>
  )
}
