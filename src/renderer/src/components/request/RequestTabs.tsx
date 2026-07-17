import type { KV, RequestNode } from '@shared/types'
import { newId } from '@shared/id'
import { useApp, useActiveEnv, useMergedVars } from '@/stores/app'
import { useUi, type RequestTab } from '@/stores/ui'
import { CodeEditor } from '@/components/common/Code'
import { useVarSuggest } from '@/components/common/VarSuggest'

const TABS: { key: RequestTab; label: string }[] = [
  { key: 'body', label: 'Body' },
  { key: 'headers', label: 'Headers' },
  { key: 'auth', label: 'Auth' },
  { key: 'scripts', label: 'Scripts' }
]

export function RequestTabs({ request }: { request: RequestNode }): React.JSX.Element {
  const tab = useUi((s) => s.tab)
  const setTab = useUi((s) => s.setTab)
  const vars = useMergedVars()
  const inheritsAuth = request.auth.mode === 'inherit' && !!vars.token
  const headerCount = request.headers.filter((h) => h.enabled && h.key.trim()).length + (inheritsAuth ? 1 : 0)

  return (
    <>
      <div className="tabs-row">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'tab tab-active' : 'tab'} onClick={() => setTab(t.key)}>
            {t.label}
            {t.key === 'headers' && headerCount > 0 && <span className="tab-count">{headerCount}</span>}
          </button>
        ))}
      </div>
      <div className="tab-content">
        {tab === 'body' && <BodyTab request={request} />}
        {tab === 'headers' && <HeadersTab request={request} />}
        {tab === 'auth' && <AuthTab request={request} />}
        {tab === 'scripts' && <ScriptsTab request={request} />}
      </div>
    </>
  )
}

function BodyTab({ request }: { request: RequestNode }): React.JSX.Element {
  const updateRequest = useApp((s) => s.updateRequest)
  if (request.body.mode === 'none') {
    return (
      <div className="tab-empty">
        <span>This request has no body.</span>
        <button
          className="link-btn"
          onClick={() => updateRequest({ body: { mode: 'json', text: '{\n  \n}' } })}
        >
          Add JSON body
        </button>
      </div>
    )
  }
  return (
    <CodeEditor
      value={request.body.text}
      onChange={(text) => updateRequest({ body: { ...request.body, text } })}
      language="json"
      varSuggest
    />
  )
}

function HeadersTab({ request }: { request: RequestNode }): React.JSX.Element {
  const updateRequest = useApp((s) => s.updateRequest)
  const vars = useMergedVars()
  const inheritsAuth = request.auth.mode === 'inherit' && !!vars.token

  const patchHeader = (id: string, patch: Partial<KV>): void => {
    updateRequest({ headers: request.headers.map((h) => (h.id === id ? { ...h, ...patch } : h)) })
  }
  const removeHeader = (id: string): void => {
    updateRequest({ headers: request.headers.filter((h) => h.id !== id) })
  }
  const addHeader = (): void => {
    updateRequest({ headers: [...request.headers, { id: newId(6), key: '', value: '', enabled: true }] })
  }

  return (
    <div className="headers-grid">
      <div className="header-row header-labels">
        <span />
        <span className="micro-label">KEY</span>
        <span className="micro-label">VALUE</span>
        <span />
      </div>
      {inheritsAuth && (
        <div className="header-row header-inherited">
          <span />
          <span className="header-key code-font">Authorization</span>
          <span className="header-value code-font">Bearer {'{{token}}'} · from env</span>
          <span />
        </div>
      )}
      {request.headers.map((h) => (
        <HeaderRow key={h.id} header={h} patchHeader={patchHeader} removeHeader={removeHeader} />
      ))}
      <button className="link-btn add-header" onClick={addHeader}>
        + Add header
      </button>
    </div>
  )
}

function HeaderRow({
  header: h,
  patchHeader,
  removeHeader
}: {
  header: KV
  patchHeader: (id: string, patch: Partial<KV>) => void
  removeHeader: (id: string) => void
}): React.JSX.Element {
  const vars = useMergedVars()
  const suggest = useVarSuggest({
    vars,
    mode: 'input',
    font: '400 12px "JetBrains Mono", monospace',
    padLeft: 0,
    apply: (text, caret, el) => {
      patchHeader(h.id, { value: text })
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = caret
      })
    }
  })

  return (
    <div className={h.enabled ? 'header-row' : 'header-row header-off'}>
      <input type="checkbox" checked={h.enabled} onChange={(e) => patchHeader(h.id, { enabled: e.target.checked })} />
      <input
        className="header-key code-font"
        placeholder="Header"
        value={h.key}
        onChange={(e) => patchHeader(h.id, { key: e.target.value })}
        spellCheck={false}
      />
      <input
        className="header-value code-font"
        placeholder="Value"
        value={h.value}
        onChange={(e) => {
          patchHeader(h.id, { value: e.target.value })
          suggest.check(e.target)
        }}
        onKeyDown={(e) => {
          suggest.onKeyDown(e)
        }}
        onBlur={suggest.onBlur}
        spellCheck={false}
      />
      <button className="icon-btn" title="Remove header" onClick={() => removeHeader(h.id)}>
        ✕
      </button>
      {suggest.dropdown}
    </div>
  )
}

function maskToken(token: string): string {
  if (token.length <= 12) return '••••••••'
  return `${token.slice(0, 8)} •••••••••••• ${token.slice(-4)}`
}

function AuthTab({ request }: { request: RequestNode }): React.JSX.Element {
  const updateRequest = useApp((s) => s.updateRequest)
  const env = useActiveEnv()
  const vars = useMergedVars()
  const envToken = vars.token ?? ''
  const fromEnv = env?.variables.some((v) => v.key === 'token' && v.enabled)
  const tokenSource = fromEnv ? `environment · ${env?.name ?? '—'}` : 'collection variables'
  const mode = request.auth.mode

  return (
    <div className="auth-tab">
      <div className="auth-row">
        <select
          className="auth-mode"
          value={mode}
          onChange={(e) => updateRequest({ auth: { ...request.auth, mode: e.target.value as typeof mode } })}
        >
          <option value="inherit">Inherit from environment</option>
          <option value="bearer">Bearer token</option>
          <option value="none">No auth</option>
        </select>
      </div>
      {mode === 'inherit' && (
        <div className="auth-detail">
          <span className="chip chip-accent">Bearer</span>
          <span className="auth-token code-font">{envToken ? maskToken(envToken) : 'no token variable'}</span>
          <span className="auth-note">{envToken ? `inherited from ${tokenSource}` : 'add a {{token}} variable to inherit auth'}</span>
        </div>
      )}
      {mode === 'bearer' && (
        <div className="auth-detail">
          <span className="chip chip-accent">Bearer</span>
          <input
            className="auth-input code-font"
            placeholder="token or {{token}}"
            value={request.auth.token ?? ''}
            onChange={(e) => updateRequest({ auth: { ...request.auth, token: e.target.value } })}
            spellCheck={false}
          />
        </div>
      )}
      {mode === 'none' && <div className="auth-detail auth-note">No Authorization header will be sent.</div>}
    </div>
  )
}

function ScriptsTab({ request }: { request: RequestNode }): React.JSX.Element {
  const updateRequest = useApp((s) => s.updateRequest)
  return (
    <CodeEditor
      value={request.scripts.postResponse}
      onChange={(postResponse) => updateRequest({ scripts: { postResponse } })}
      language="js"
      placeholder={'// post-response\nvars.set("chargeId", res.json.id)\nassert(res.status === 201)'}
    />
  )
}
