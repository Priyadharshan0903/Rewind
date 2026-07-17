import { memo, useEffect, useMemo, useRef } from 'react'
import { tokenizeLine } from '@/lib/tokenize'
import { useMergedVars } from '@/stores/app'
import { useVarSuggest } from '@/components/common/VarSuggest'

export const CodeLine = memo(function CodeLine({
  text,
  language
}: {
  text: string
  language: 'json' | 'js'
}): React.JSX.Element {
  const toks = tokenizeLine(text, language)
  return (
    <>
      {toks.map((t, i) => (
        <span key={i} className={t.kind === 'plain' ? undefined : `tok-${t.kind}`}>
          {t.text}
        </span>
      ))}
      {'\n'}
    </>
  )
})

// Above these sizes, tokenizing into thousands of spans makes React choke —
// fall back to a plain <pre>, which the browser renders instantly.
const MAX_HIGHLIGHT_CHARS = 200_000
const MAX_HIGHLIGHT_LINES = 4_000
const MAX_LINE_CHARS = 8_000

/** Read-only tokenized code block (response bodies, snapshots). */
export function CodeView({ text, language = 'json' }: { text: string; language?: 'json' | 'js' }): React.JSX.Element {
  const lines = useMemo(() => text.split('\n'), [text])
  const plain =
    text.length > MAX_HIGHLIGHT_CHARS ||
    lines.length > MAX_HIGHLIGHT_LINES ||
    lines.some((l) => l.length > MAX_LINE_CHARS)
  if (plain) {
    return (
      <>
        <div className="truncate-note">Large body — syntax highlighting off for speed</div>
        <pre className="code-view">{text}</pre>
      </>
    )
  }
  return (
    <pre className="code-view">
      {lines.map((l, i) => (
        <CodeLine key={i} text={l} language={language} />
      ))}
    </pre>
  )
}

interface EditorProps {
  value: string
  onChange: (value: string) => void
  language: 'json' | 'js'
  placeholder?: string
  /** Offer {{variable}} autocomplete (request bodies — not scripts). */
  varSuggest?: boolean
}

/**
 * Transparent-textarea-over-highlighted-pre editor with a synced
 * line-number gutter. Font metrics of the textarea and the pre must match
 * exactly (same class), or the caret drifts from the highlight.
 */
export function CodeEditor({ value, onChange, language, placeholder, varSuggest }: EditorProps): React.JSX.Element {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const hlRef = useRef<HTMLPreElement>(null)
  const gutterRef = useRef<HTMLDivElement>(null)

  const lines = useMemo(() => value.split('\n'), [value])

  const sync = (): void => {
    const ta = taRef.current
    if (!ta) return
    if (hlRef.current) hlRef.current.style.transform = `translate(${-ta.scrollLeft}px, ${-ta.scrollTop}px)`
    if (gutterRef.current) gutterRef.current.style.transform = `translateY(${-ta.scrollTop}px)`
  }

  useEffect(sync, [value])

  const vars = useMergedVars()
  const suggest = useVarSuggest({
    vars,
    mode: 'textarea',
    font: '400 12px "JetBrains Mono", monospace',
    lineHeight: 21,
    padTop: 12,
    padLeft: 0,
    apply: (text, caret, el) => {
      onChange(text)
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = caret
        sync()
      })
    }
  })

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (varSuggest && suggest.onKeyDown(e)) return
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = e.currentTarget
      const { selectionStart, selectionEnd } = ta
      const next = value.slice(0, selectionStart) + '  ' + value.slice(selectionEnd)
      onChange(next)
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = selectionStart + 2
      })
    }
  }

  return (
    <div className="editor">
      <div className="ed-gutter">
        <div ref={gutterRef}>
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
      </div>
      <div className="ed-body">
        <pre className="ed-hl code-font" ref={hlRef} aria-hidden>
          {lines.map((l, i) => (
            <CodeLine key={i} text={l} language={language} />
          ))}
        </pre>
        <textarea
          ref={taRef}
          className="ed-input code-font"
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            if (varSuggest) suggest.check(e.target)
          }}
          onScroll={() => {
            sync()
            suggest.onBlur()
          }}
          onBlur={suggest.onBlur}
          onKeyDown={onKeyDown}
          spellCheck={false}
          wrap="off"
          placeholder={placeholder}
          autoCapitalize="off"
          autoCorrect="off"
        />
        {varSuggest && suggest.dropdown}
      </div>
    </div>
  )
}
