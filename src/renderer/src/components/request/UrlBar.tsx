import { useMemo, useRef, useState } from 'react'
import type { Collection, HttpMethod, RequestNode } from '@shared/types'
import { interpolate, VAR_RE } from '@shared/interpolate'
import { parseCurl, type ParsedCurl } from '@shared/curlParse'
import { newId } from '@shared/id'
import { useApp, useMergedVars } from '@/stores/app'
import { useRuns } from '@/stores/runs'
import { useUi } from '@/stores/ui'
import { findParentFolder } from '@/lib/tree'
import { useVarSuggest } from '@/components/common/VarSuggest'

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

export function RequestTitle({
  request,
  collection
}: {
  request: RequestNode
  collection: Collection
}): React.JSX.Element {
  const updateRequest = useApp((s) => s.updateRequest)
  const saveDraft = useApp((s) => s.saveDraft)
  const discardDraft = useApp((s) => s.discardDraft)
  const dirty = useApp((s) => !!s.drafts[request.id])
  const folder = findParentFolder(collection.items, request.id)
  return (
    <div className="req-title-row">
      <input
        className="req-title-input"
        value={request.name}
        placeholder="Untitled request"
        onChange={(e) => updateRequest({ name: e.target.value })}
        spellCheck={false}
        title="Rename this request"
      />
      {dirty && (
        <span className="draft-controls">
          <span className="dirty-dot" title="Unsaved changes" />
          <button className="draft-btn draft-discard" onClick={discardDraft} title="Revert to last saved state">
            Discard
          </button>
          <button className="draft-btn draft-save" onClick={saveDraft}>
            Save
            <span className="send-kbd">⌘S</span>
          </button>
        </span>
      )}
      <span className="req-title-loc">{folder ? `${collection.name} / ${folder}` : collection.name}</span>
    </div>
  )
}

export function UrlRow({ request }: { request: RequestNode }): React.JSX.Element {
  const updateRequest = useApp((s) => s.updateRequest)
  const sending = useRuns((s) => s.sending)
  const send = useRuns((s) => s.send)
  const cancelSend = useRuns((s) => s.cancelSend)
  const toast = useUi((s) => s.toast)

  const importCurl = (parsed: ParsedCurl): void => {
    let body: RequestNode['body']
    if (parsed.formFields?.length) {
      body = {
        mode: 'formdata',
        text: '',
        form: parsed.formFields.map(([key, value]) => ({
          id: newId(6),
          key,
          value: value.startsWith('@') ? value.slice(1) : value,
          enabled: true,
          type: value.startsWith('@') ? ('file' as const) : ('text' as const)
        }))
      }
    } else if (!parsed.bodyText) {
      body = { mode: 'none', text: '' }
    } else {
      try {
        body = { mode: 'json', text: JSON.stringify(JSON.parse(parsed.bodyText), null, 2) }
      } catch {
        body = { mode: 'text', text: parsed.bodyText }
      }
    }
    const hasAuthHeader = parsed.headers.some(([k]) => k.toLowerCase() === 'authorization')
    updateRequest({
      method: parsed.method,
      url: parsed.url,
      headers: parsed.headers.map(([key, value]) => ({ id: newId(6), key, value, enabled: true })),
      body,
      // An explicit Authorization header replaces the inherited env auth.
      ...(hasAuthHeader ? { auth: { mode: 'none' as const } } : {})
    })
    toast(`Imported from cURL — ${parsed.method} · ${parsed.headers.length} headers${body.mode !== 'none' ? ' · body' : ''}`)
  }

  return (
    <div className="url-row">
      <MethodSelect method={request.method} onChange={(method) => updateRequest({ method })} />
      <UrlInput url={request.url} onChange={(url) => updateRequest({ url })} onImportCurl={importCurl} />
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

function UrlInput({
  url,
  onChange,
  onImportCurl
}: {
  url: string
  onChange: (v: string) => void
  onImportCurl: (parsed: ParsedCurl) => void
}): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const hlRef = useRef<HTMLDivElement>(null)

  const vars = useMergedVars()
  const resolved = useMemo(() => interpolate(url, vars, { dynamic: false }), [url, vars])

  const segments = useMemo(() => {
    const out: { text: string; kind: 'plain' | 'var' | 'missing' }[] = []
    let last = 0
    VAR_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = VAR_RE.exec(url))) {
      if (m.index > last) out.push({ text: url.slice(last, m.index), kind: 'plain' })
      const name = m[1] ?? m[2]
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

  const suggest = useVarSuggest({
    vars,
    mode: 'input',
    font: '500 12.5px "JetBrains Mono", monospace',
    apply: (text, caret, el) => {
      onChange(text)
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = caret
        sync()
      })
    }
  })

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
          suggest.check(e.target)
        }}
        onKeyDown={(e) => {
          suggest.onKeyDown(e)
        }}
        onBlur={suggest.onBlur}
        onScroll={sync}
        onPaste={(e) => {
          const text = e.clipboardData.getData('text')
          const parsed = parseCurl(text)
          if (parsed) {
            e.preventDefault()
            onImportCurl(parsed)
          }
        }}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        placeholder="https://… — or paste a cURL command"
      />
      {suggest.dropdown}
    </div>
  )
}
