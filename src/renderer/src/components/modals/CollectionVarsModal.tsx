import { X } from 'lucide-react'
import type { KV } from '@shared/types'
import { newId } from '@shared/id'
import { useApp } from '@/stores/app'
import { useUi } from '@/stores/ui'
import { Overlay } from '@/components/common/Overlay'

export function CollectionVarsModal(): React.JSX.Element | null {
  const collectionId = useUi((s) => s.collectionVarsId)
  const closeOverlays = useUi((s) => s.closeOverlays)
  const collection = useApp((s) => s.collections.find((c) => c.id === collectionId))
  const updateCollectionVariables = useApp((s) => s.updateCollectionVariables)

  if (!collection) return null
  const variables = collection.variables ?? []

  const patchVar = (id: string, patch: Partial<KV>): void =>
    updateCollectionVariables(
      collection.id,
      variables.map((v) => (v.id === id ? { ...v, ...patch } : v))
    )

  return (
    <Overlay onClose={() => closeOverlays()} center>
      <div className="modal col-vars-modal">
        <div className="modal-title-row">
          <span className="modal-title">Collection variables — {collection.name}</span>
          <button className="icon-btn" onClick={() => closeOverlays()}>
            <X size={14} strokeWidth={2} />
          </button>
        </div>
        <div className="var-grid">
          <div className="header-row header-labels">
            <span />
            <span className="micro-label">VARIABLE</span>
            <span className="micro-label">VALUE</span>
            <span />
          </div>
          {variables.map((v) => (
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
                onClick={() =>
                  updateCollectionVariables(
                    collection.id,
                    variables.filter((x) => x.id !== v.id)
                  )
                }
              >
                <X size={14} strokeWidth={2} />
              </button>
            </div>
          ))}
          {variables.length === 0 && (
            <div className="hp-empty">
              No collection variables yet — they apply to every request in “{collection.name}”.
            </div>
          )}
          <button
            className="link-btn add-header"
            onClick={() =>
              updateCollectionVariables(collection.id, [
                ...variables,
                { id: newId(6), key: '', value: '', enabled: true }
              ])
            }
          >
            + Add variable
          </button>
        </div>
        <div className="modal-footer-note">
          <span className="dot dot-ok" />
          Referenced as {'{{name}}'} · environment variables override collection variables on name
          collision
        </div>
      </div>
    </Overlay>
  )
}
