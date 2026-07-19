import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check } from 'lucide-react'

export interface SelectOption<T extends string = string> {
  value: T
  label: string
  /** optional muted hint shown to the right of the label */
  hint?: string
}

interface SelectProps<T extends string = string> {
  value: T
  options: SelectOption<T>[]
  onChange: (value: T) => void
  /** placeholder shown when no option matches `value` */
  placeholder?: string
  disabled?: boolean
  className?: string
  /** minimum width of the popup; defaults to matching the trigger */
  menuMinWidth?: number
  ariaLabel?: string
}

interface PopupPos {
  left: number
  width: number
  /** set when opening downward */
  top?: number
  /** set when flipping upward (distance from viewport bottom) */
  bottom?: number
}

const MAX_MENU_H = 300

/**
 * Themed replacement for a native <select>. The popup is rendered in a portal
 * with fixed positioning so it's never clipped by a scrolling ancestor (the
 * request tab panel, modals, etc.). Styled with the app's `.menu` look, so
 * dropdowns are consistent across the app in both light and dark themes.
 */
export function Select<T extends string = string>({
  value,
  options,
  onChange,
  placeholder = 'Select…',
  disabled,
  className,
  menuMinWidth,
  ariaLabel
}: SelectProps<T>): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState<PopupPos | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const selectedIdx = options.findIndex((o) => o.value === value)
  const selected = selectedIdx >= 0 ? options[selectedIdx] : null

  const place = (): void => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const below = window.innerHeight - r.bottom
    // Flip up when there isn't room below but there is above.
    if (below < MAX_MENU_H && r.top > below) {
      setPos({ left: r.left, width: r.width, bottom: window.innerHeight - r.top + 5 })
    } else {
      setPos({ left: r.left, width: r.width, top: r.bottom + 5 })
    }
  }

  // Position before paint so the popup never flashes in the wrong spot.
  useLayoutEffect(() => {
    if (open) place()
  }, [open])

  // Reposition on scroll/resize while open (any ancestor scroll bubbles here).
  useEffect(() => {
    if (!open) return
    const onScrollResize = (): void => place()
    window.addEventListener('scroll', onScrollResize, true)
    window.addEventListener('resize', onScrollResize)
    return () => {
      window.removeEventListener('scroll', onScrollResize, true)
      window.removeEventListener('resize', onScrollResize)
    }
  }, [open])

  useEffect(() => {
    if (open) setActive(selectedIdx >= 0 ? selectedIdx : 0)
  }, [open, selectedIdx])

  const commit = (idx: number): void => {
    const opt = options[idx]
    if (opt) onChange(opt.value)
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (disabled) return
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(options.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      commit(active)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div className={className ? `select ${className}` : 'select'}>
      <button
        ref={triggerRef}
        type="button"
        className={open ? 'select-trigger select-open' : 'select-trigger'}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={onKeyDown}
      >
        <span className={selected ? 'select-value' : 'select-value select-placeholder'}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className="select-caret" size={14} strokeWidth={2} />
      </button>
      {open &&
        pos &&
        createPortal(
          <>
            <div className="click-away" onMouseDown={() => setOpen(false)} />
            <div
              className="menu select-menu"
              role="listbox"
              style={{
                left: pos.left,
                top: pos.top,
                bottom: pos.bottom,
                minWidth: Math.max(pos.width, menuMinWidth ?? 0)
              }}
            >
              {options.map((opt, i) => (
                <button
                  type="button"
                  key={opt.value}
                  role="option"
                  aria-selected={opt.value === value}
                  className={i === active ? 'menu-item select-item-active' : 'menu-item'}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => commit(i)}
                >
                  <span>{opt.label}</span>
                  {opt.hint && <span className="select-hint">{opt.hint}</span>}
                  {opt.value === value && <Check className="menu-check" size={13} strokeWidth={2.5} />}
                </button>
              ))}
            </div>
          </>,
          document.body
        )}
    </div>
  )
}
