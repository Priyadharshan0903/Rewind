import { memo, useEffect, useMemo, useRef } from 'react'
import { tokenizeLine } from '@/lib/tokenize'

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

/** Read-only tokenized code block (response bodies, snapshots). */
export function CodeView({ text, language = 'json' }: { text: string; language?: 'json' | 'js' }): React.JSX.Element {
  const lines = useMemo(() => text.split('\n'), [text])
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
}

/**
 * Transparent-textarea-over-highlighted-pre editor with a synced
 * line-number gutter. Font metrics of the textarea and the pre must match
 * exactly (same class), or the caret drifts from the highlight.
 */
export function CodeEditor({ value, onChange, language, placeholder }: EditorProps): React.JSX.Element {
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

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
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
          onChange={(e) => onChange(e.target.value)}
          onScroll={sync}
          onKeyDown={onKeyDown}
          spellCheck={false}
          wrap="off"
          placeholder={placeholder}
          autoCapitalize="off"
          autoCorrect="off"
        />
      </div>
    </div>
  )
}
