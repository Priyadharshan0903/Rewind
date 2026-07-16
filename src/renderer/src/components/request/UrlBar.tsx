import { useMemo, useRef, useState } from 'react'
import type { HttpMethod, RequestNode } from '@shared/types'
import { interpolate, varsFromEnv, VAR_RE } from '@shared/interpolate'
import { useApp, useActiveEnv } from '@/stores/app'
import { useRuns } from '@/stores/runs'

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

export function UrlRow({ request }: { request: RequestNode }): React.JSX.Element {
  const updateRequest = useApp((s) => s.updateRequest)
  const sending = useRuns((s) => s.sending)
  const send = useRuns((s) => s.send)
  const cancelSend = useRuns((s) => s.cancelSend)

  return (
    <div className="url-row">
      <MethodSelect method={request.method} onChange={(method) => updateRequest({ method })} />
      <UrlInput url={request.url} onChange={(url) => updateRequest({ url })} />
      <button className="send-btn" onClick={() => (sending ? cancelSend() : void send())}>
        {sending ? 'Cancel' : 'Send'}
        {!sending && <span className="send-kbd">⌘↩</span>}
      </button>
    </div>
  )
}

function MethodSelect({
  method,
  onChange
}: {
  method: HttpMethod
  onChange: (m: HttpMethod) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <div className="method-wrap">
      <button className={`method-btn method-${method.toLowerCase()}`} onClick={() => setOpen((v) => !v)}>
        {method}
        <span className="caret">▾</span>
      </button>
      {open && (
        <>
          <div className="click-away" onMouseDown={() => setOpen(false)} />
          <div className="menu method-menu">
            {METHODS.map((m) => (
              <button
                key={m}
                className="menu-item"
                onClick={() => {
                  onChange(m)
                  setOpen(false)
                }}
              >
                <span className={`method method-${m.toLowerCase()}`}>{m}</span>
                {m === method && <span className="menu-check">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function UrlInput({ url, onChange }: { url: string; onChange: (v: string) => void }): React.JSX.Element {
  const env = useActiveEnv()
  const inputRef = useRef<HTMLInputElement>(null)
  const hlRef = useRef<HTMLDivElement>(null)

  const vars = useMemo(() => varsFromEnv(env?.variables ?? []), [env])
  const resolved = useMemo(() => interpolate(url, vars, { dynamic: false }), [url, vars])

  const segments = useMemo(() => {
    const out: { text: string; kind: 'plain' | 'var' | 'missing' }[] = []
    let last = 0
    VAR_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = VAR_RE.exec(url))) {
      if (m.index > last) out.push({ text: url.slice(last, m.index), kind: 'plain' })
      const name = m[1]
      const known = name.startsWith('$') || Object.prototype.hasOwnProperty.call(vars, name)
      out.push({ text: m[0], kind: known ? 'var' : 'missing' })
      last = m.index + m[0].length
    }
    if (last < url.length) out.push({ text: url.slice(last), kind: 'plain' })
    return out
  }, [url, vars])

  const sync = (): void => {
    if (hlRef.current && inputRef.current) {
      hlRef.current.style.transform = `translateX(${-inputRef.current.scrollLeft}px)`
    }
  }

  return (
    <div className="url-input-wrap" title={resolved.text}>
      <div className="url-hl-clip">
        <div className="url-hl code-font" ref={hlRef}>
          {segments.map((s, i) => (
            <span key={i} className={s.kind === 'plain' ? undefined : s.kind === 'var' ? 'url-var' : 'url-var-missing'}>
              {s.text}
            </span>
          ))}
        </div>
      </div>
      <input
        ref={inputRef}
        className="url-input code-font"
        value={url}
        onChange={(e) => {
          onChange(e.target.value)
          requestAnimationFrame(sync)
        }}
        onScroll={sync}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
      />
    </div>
  )
}
