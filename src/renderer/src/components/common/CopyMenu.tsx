import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Clipboard, ChevronDown } from 'lucide-react'
import type { RunRequest } from '@shared/types'
import {
  buildCurl,
  buildHttpie,
  buildWget,
  buildNode,
  buildAxios,
  buildPython,
  buildPyHttpClient,
  buildGo,
  buildPhp,
  buildRuby,
  buildJava,
  buildCSharp,
  buildRust
} from '@shared/codegen'
import { useUi } from '@/stores/ui'

type Build = (req: RunRequest) => string
interface Group {
  group: string
  items: { key: string; label: string; build: Build }[]
}

// Grouped by language so the (long) list stays scannable.
const GROUPS: Group[] = [
  {
    group: 'Shell',
    items: [
      { key: 'curl', label: 'cURL', build: buildCurl },
      { key: 'httpie', label: 'HTTPie', build: buildHttpie },
      { key: 'wget', label: 'wget', build: buildWget }
    ]
  },
  {
    group: 'JavaScript',
    items: [
      { key: 'fetch', label: 'Fetch', build: buildNode },
      { key: 'axios', label: 'Axios', build: buildAxios }
    ]
  },
  {
    group: 'Python',
    items: [
      { key: 'requests', label: 'requests', build: buildPython },
      { key: 'httpclient', label: 'http.client', build: buildPyHttpClient }
    ]
  },
  { group: 'Go', items: [{ key: 'go', label: 'net/http', build: buildGo }] },
  { group: 'PHP', items: [{ key: 'php', label: 'cURL', build: buildPhp }] },
  { group: 'Ruby', items: [{ key: 'ruby', label: 'net/http', build: buildRuby }] },
  { group: 'Java', items: [{ key: 'java', label: 'HttpClient', build: buildJava }] },
  { group: 'C#', items: [{ key: 'csharp', label: 'HttpClient', build: buildCSharp }] },
  { group: 'Rust', items: [{ key: 'rust', label: 'reqwest', build: buildRust }] }
]

interface PopupPos {
  width: number
  left?: number
  right?: number
  top?: number
  bottom?: number
}

const MAX_MENU_H = 340

/**
 * "Copy as" dropdown — code snippets for a resolved request across many
 * languages. Rendered through a portal with fixed positioning (like Select)
 * so the tall menu is never clipped by a scrolling ancestor, and it flips up
 * or anchors left/right to stay on screen.
 */
export function CopyMenu({
  req,
  disabled,
  compact,
  align = 'right'
}: {
  req: RunRequest | null
  disabled?: boolean
  /** Icon-only trigger (no label), for tight spots like the URL row. */
  compact?: boolean
  /** Which edge of the trigger the menu aligns to. */
  align?: 'left' | 'right'
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<PopupPos | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const toast = useUi((s) => s.toast)

  const place = (): void => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const below = window.innerHeight - r.bottom
    const vert: Pick<PopupPos, 'top' | 'bottom'> =
      below < MAX_MENU_H && r.top > below
        ? { bottom: window.innerHeight - r.top + 5 }
        : { top: r.bottom + 5 }
    const horiz = align === 'left' ? { left: r.left } : { right: window.innerWidth - r.right }
    setPos({ width: r.width, ...vert, ...horiz })
  }

  useLayoutEffect(() => {
    if (open) place()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    const onScrollResize = (): void => place()
    window.addEventListener('scroll', onScrollResize, true)
    window.addEventListener('resize', onScrollResize)
    return () => {
      window.removeEventListener('scroll', onScrollResize, true)
      window.removeEventListener('resize', onScrollResize)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const copy = async (build: Build, label: string): Promise<void> => {
    if (!req) return
    await navigator.clipboard.writeText(build(req))
    setOpen(false)
    toast(`Copied as ${label}`)
  }

  return (
    <div className="copy-menu-wrap">
      <button
        ref={triggerRef}
        className={`text-btn copy-trigger${compact ? ' copy-icon-btn' : ''}`}
        title="Copy as code — cURL, Go, Python, Node, and more"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled || !req}
        onClick={() => setOpen((v) => !v)}
      >
        <Clipboard size={15} strokeWidth={2} />
        {!compact && (
          <>
            Copy as <ChevronDown size={13} strokeWidth={2} className="copy-caret" />
          </>
        )}
      </button>
      {open &&
        pos &&
        createPortal(
          <>
            <div className="click-away" onMouseDown={() => setOpen(false)} />
            <div
              className="menu copy-menu"
              role="menu"
              style={{ left: pos.left, right: pos.right, top: pos.top, bottom: pos.bottom }}
            >
              {GROUPS.map((g) => (
                <div key={g.group} className="copy-group">
                  <div className="copy-group-label micro-label">{g.group}</div>
                  {g.items.map((f) => (
                    <button
                      key={f.key}
                      role="menuitem"
                      className="menu-item copy-item"
                      onClick={() => void copy(f.build, `${g.group} · ${f.label}`)}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </>,
          document.body
        )}
    </div>
  )
}
