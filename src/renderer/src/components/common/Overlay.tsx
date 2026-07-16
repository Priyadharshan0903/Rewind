import type { ReactNode } from 'react'

/** Full-window click-away layer for menus and modals. */
export function Overlay({
  onClose,
  center,
  children
}: {
  onClose: () => void
  center?: boolean
  children: ReactNode
}): React.JSX.Element {
  return (
    <div className={center ? 'overlay overlay-center' : 'overlay'} onMouseDown={onClose}>
      <div onMouseDown={(e) => e.stopPropagation()} className="overlay-content">
        {children}
      </div>
    </div>
  )
}
