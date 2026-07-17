import { useUi } from '@/stores/ui'
import { Overlay } from '@/components/common/Overlay'

const SHORTCUTS: [string, string][] = [
  ['⌘ ↩', 'Send request'],
  ['⌘ S', 'Save request changes'],
  ['⌘ N', 'New request'],
  ['⌘ P', 'Search collection'],
  ['⌘ F', 'Find in request / response'],
  ['⌘ E', 'Environments & variables'],
  ['⌘ B', 'Toggle sidebar'],
  ['⌘ J', 'Toggle response pane'],
  ['⌘ ⌥ B', 'Toggle history panel'],
  ['⌘ ,', 'Preferences'],
  ['⌘ /', 'Keyboard shortcuts'],
  ['Esc', 'Close dialogs & menus']
]

export function ShortcutsModal(): React.JSX.Element {
  const closeOverlays = useUi((s) => s.closeOverlays)
  return (
    <Overlay onClose={() => closeOverlays()} center>
      <div className="modal shortcuts-modal">
        <div className="modal-title-row">
          <span className="modal-title">Keyboard shortcuts</span>
          <button className="icon-btn" onClick={() => closeOverlays()}>
            ✕
          </button>
        </div>
        <div className="shortcut-list">
          {SHORTCUTS.map(([keys, label]) => (
            <div key={keys} className="shortcut-row">
              <span className="kbd">{keys}</span>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </Overlay>
  )
}
