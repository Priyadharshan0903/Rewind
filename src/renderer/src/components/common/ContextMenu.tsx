import { useUi } from '@/stores/ui'

const MENU_WIDTH = 200

/** Global right-click menu, rendered once in App and driven by the ui store. */
export function ContextMenu(): React.JSX.Element | null {
  const menu = useUi((s) => s.contextMenu)
  const close = useUi((s) => s.closeContextMenu)
  if (!menu) return null

  const x = Math.min(menu.x, window.innerWidth - MENU_WIDTH - 8)
  const maxH = menu.items.length * 30 + 16
  const y = Math.min(menu.y, window.innerHeight - maxH - 8)

  return (
    <div className="ctx-overlay" onMouseDown={close} onContextMenu={(e) => e.preventDefault()}>
      <div
        className="menu ctx-menu"
        style={{ left: x, top: y }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {menu.items.map((item, i) =>
          item.sep ? (
            <div key={i} className="menu-sep" />
          ) : (
            <button
              key={i}
              className={item.danger ? 'menu-item menu-danger' : 'menu-item'}
              onClick={() => {
                close()
                item.action?.()
              }}
            >
              {item.label}
            </button>
          )
        )}
      </div>
    </div>
  )
}
