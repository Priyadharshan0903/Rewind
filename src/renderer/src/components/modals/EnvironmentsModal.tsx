import { useState } from 'react'
import { X } from 'lucide-react'
import type { Environment, KV } from '@shared/types'
import { newId } from '@shared/id'
import { useApp } from '@/stores/app'
import { useUi } from '@/stores/ui'
import { Overlay } from '@/components/common/Overlay'

const DOTS: Environment['dotColor'][] = ['ok', 'warn', 'err']

export function EnvironmentsModal(): React.JSX.Element {
  const environments = useApp((s) => s.environments)
  const workspace = useApp((s) => s.workspace)
  const updateEnvironments = useApp((s) => s.updateEnvironments)
  const addEnvironment = useApp((s) => s.addEnvironment)
  const removeEnvironment = useApp((s) => s.removeEnvironment)
  const setActiveEnv = useApp((s) => s.setActiveEnv)
  const closeOverlays = useUi((s) => s.closeOverlays)
  const preselectId = useUi((s) => s.envEditorSelectId)

  const [selectedId, setSelectedId] = useState(
    preselectId ?? workspace?.activeEnvironmentId ?? environments[0]?.id ?? ''
  )
  const env = environments.find((e) => e.id === selectedId) ?? environments[0]

  const patchEnv = (patch: Partial<Environment>): void => {
    if (!env) return
    updateEnvironments(environments.map((e) => (e.id === env.id ? { ...e, ...patch } : e)))
  }

  const patchVar = (id: string, patch: Partial<KV>): void => {
    if (!env) return
    patchEnv({ variables: env.variables.map((v) => (v.id === id ? { ...v, ...patch } : v)) })
  }

  return (
    <Overlay onClose={() => closeOverlays()} center>
      <div className="modal env-modal">
        <div className="modal-title-row">
          <span className="modal-title">Environments &amp; variables</span>
          <button className="icon-btn" onClick={() => closeOverlays()}>
            <X size={14} strokeWidth={2} />
          </button>
        </div>
        <div className="env-body">
          <div className="env-list">
            {environments.map((e) => (
              <button
                key={e.id}
                className={e.id === env?.id ? 'env-row env-row-active' : 'env-row'}
                onClick={() => setSelectedId(e.id)}
              >
                <span className={`dot dot-${e.dotColor}`} />
                <span className="env-row-name">{e.name}</span>
                {e.id === workspace?.activeEnvironmentId && <span className="env-active-tag">ACTIVE</span>}
              </button>
            ))}
            <button className="link-btn env-add" onClick={() => setSelectedId(addEnvironment())}>
              + New environment
            </button>
          </div>
          {env && (
            <div className="env-detail">
              <div className="env-detail-head">
                <input
                  className="env-name-input"
                  value={env.name}
                  onChange={(e) => patchEnv({ name: e.target.value })}
                  spellCheck={false}
                />
                <div className="env-dots">
                  {DOTS.map((d) => (
                    <button
                      key={d}
                      className={env.dotColor === d ? 'env-dot-pick env-dot-active' : 'env-dot-pick'}
                      title={d}
                      onClick={() => patchEnv({ dotColor: d })}
                    >
                      <span className={`dot dot-${d}`} />
                    </button>
                  ))}
                </div>
                {env.id !== workspace?.activeEnvironmentId ? (
                  <button className="text-btn" onClick={() => setActiveEnv(env.id)}>
                    Set active
                  </button>
                ) : (
                  <span className="env-active-tag">ACTIVE</span>
                )}
                <button
                  className="icon-btn"
                  title="Delete environment"
                  disabled={environments.length <= 1}
                  onClick={() => {
                    removeEnvironment(env.id)
                    setSelectedId(environments.find((e) => e.id !== env.id)?.id ?? '')
                  }}
                >
                  🗑
                </button>
              </div>
              <div className="var-grid">
                <div className="header-row header-labels">
                  <span />
                  <span className="micro-label">VARIABLE</span>
                  <span className="micro-label">VALUE</span>
                  <span />
                </div>
                {env.variables.map((v) => (
                  <div key={v.id} className={v.enabled ? 'header-row' : 'header-row header-off'}>
                    <input
                      type="checkbox"
                      checked={v.enabled}
                      onChange={(e) => patchVar(v.id, { enabled: e.target.checked })}
                    />
                    <input
                      className="header-key code-font"
                      placeholder="name"
                      value={v.key}
                      onChange={(e) => patchVar(v.id, { key: e.target.value })}
                      spellCheck={false}
                    />
                    <input
                      className="header-value code-font"
                      placeholder="value"
                      value={v.value}
                      onChange={(e) => patchVar(v.id, { value: e.target.value })}
                      spellCheck={false}
                    />
                    <button
                      className="icon-btn"
                      title="Remove variable"
                      onClick={() => patchEnv({ variables: env.variables.filter((x) => x.id !== v.id) })}
                    >
                      <X size={14} strokeWidth={2} />
                    </button>
                  </div>
                ))}
                <button
                  className="link-btn add-header"
                  onClick={() =>
                    patchEnv({ variables: [...env.variables, { id: newId(6), key: '', value: '', enabled: true }] })
                  }
                >
                  + Add variable
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer-note">
          <span className="dot dot-ok" />
          Reference variables as {'{{name}}'} in URLs, headers and bodies · stored locally in environments.json
        </div>
      </div>
    </Overlay>
  )
}
