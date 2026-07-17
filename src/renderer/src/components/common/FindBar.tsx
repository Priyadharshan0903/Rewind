import { useEffect, useRef } from 'react'
import { useSelectedRequest } from '@/stores/app'
import { useRuns } from '@/stores/runs'
import { useUi } from '@/stores/ui'
import { findMatches, normIndex, MAX_MATCHES, type FindMatch } from '@/lib/find'
import { prettyJson } from '@/lib/format'

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

/**
 * Single ⌘F bar anchored top-right of the request area, with Response |
 * Request scope tabs. Matches highlight in whichever pane is scoped.
 */
export function FindBar(): React.JSX.Element | null {
  const find = useUi((s) => s.find)
  const setFind = useUi((s) => s.setFind)
  const closeFind = useUi((s) => s.closeFind)
  const setTab = useUi((s) => s.setTab)
  const run = useRuns((s) => s.currentRun)
  const selected = useSelectedRequest()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (find.open) inputRef.current?.select()
  }, [find.open])

  if (!find.open) return null

  const responseText = run?.response ? prettyJson(run.response.bodyText) : (run?.error ?? '')
  const requestText = selected?.request.body.text ?? ''
  const text = find.scope === 'response' ? responseText : requestText
  const total = findMatches(text, find.query).length
  const idx = normIndex(find.idx, total)

  const step = (dir: 1 | -1): void => setFind({ idx: idx + dir })

  return (
    <div className="find-bar">
      <span className="find-icon">{IconSearch}</span>
      <input
        ref={inputRef}
        autoFocus
        placeholder={find.scope === 'response' ? 'Find in response…' : 'Find in request body…'}
        value={find.query}
        onChange={(e) => setFind({ query: e.target.value, idx: 0 })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            step(e.shiftKey ? -1 : 1)
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            closeFind()
          }
        }}
        spellCheck={false}
      />
      <span className="find-count code-font">
        {find.query ? `${total ? idx + 1 : 0}/${total >= MAX_MATCHES ? `${MAX_MATCHES}+` : total}` : ''}
      </span>
      <button className="icon-btn" title="Previous (Shift+Enter)" disabled={!total} onClick={() => step(-1)}>
        {IconUp}
      </button>
      <button className="icon-btn" title="Next (Enter)" disabled={!total} onClick={() => step(1)}>
        {IconDown}
      </button>
      <div className="seg find-seg">
        <button
          className={find.scope === 'response' ? 'seg-btn seg-active' : 'seg-btn'}
          onClick={() => setFind({ scope: 'response', idx: 0 })}
        >
          Response
        </button>
        <button
          className={find.scope === 'request' ? 'seg-btn seg-active' : 'seg-btn'}
          onClick={() => {
            setFind({ scope: 'request', idx: 0 })
            setTab('body')
          }}
        >
          Request
        </button>
      </div>
      <button className="icon-btn" title="Close (Esc)" onClick={closeFind}>
        {IconClose}
      </button>
    </div>
  )
}

/** Absolutely-positioned highlight rectangles behind monospace text. */
export function FindMarksLayer({
  matches,
  current,
  queryLen,
  charW,
  lineH,
  padTop = 0,
  padLeft = 0
}: {
  matches: FindMatch[]
  current: number
  queryLen: number
  charW: number
  lineH: number
  padTop?: number
  padLeft?: number
}): React.JSX.Element {
  return (
    <>
      {matches.map((m, i) => (
        <span
          key={i}
          className={i === current ? 'find-mark find-mark-current' : 'find-mark'}
          style={{
            top: padTop + m.line * lineH,
            left: padLeft + m.col * charW,
            width: queryLen * charW,
            height: lineH
          }}
        />
      ))}
    </>
  )
}
