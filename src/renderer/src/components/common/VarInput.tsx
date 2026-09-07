import { useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import { VAR_RE } from '@shared/interpolate'

/**
 * Theme-aware `{{variable}}` highlighting for single-line inputs.
 *
 * Same trick as the URL bar: a transparent-text input with a highlighted
 * layer pinned on top of it. The layer copies the input's own font and box
 * metrics at runtime, so a field only needs to hand over its usual class —
 * no per-field duplication of padding or font sizes.
 */

export type VarSegKind = 'plain' | 'var' | 'missing'

export interface VarSeg {
  text: string
  kind: VarSegKind
}

/** Split text into plain runs and `{{var}}` tokens, flagging unknown names. */
export function varSegments(text: string, vars: Record<string, string>): VarSeg[] {
  const out: VarSeg[] = []
  let last = 0
  VAR_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = VAR_RE.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), kind: 'plain' })
    const name = m[1] ?? m[2]
    const known = name.startsWith('$') || Object.prototype.hasOwnProperty.call(vars, name)
    out.push({ text: m[0], kind: known ? 'var' : 'missing' })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last), kind: 'plain' })
  return out
}

export function varTokenClass(kind: VarSegKind): string | undefined {
  if (kind === 'plain') return undefined
  return kind === 'var' ? 'var-tok' : 'var-tok var-tok-bad'
}

export function VarTokens({ segs }: { segs: VarSeg[] }): React.JSX.Element {
  return (
    <>
      {segs.map((s, i) => (
        <span key={i} className={varTokenClass(s.kind)}>
          {s.text}
        </span>
      ))}
    </>
  )
}

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'ref'>

export interface VarInputProps extends InputProps {
  value: string
  vars: Record<string, string>
  /** Class for the wrapper, which takes the input's old layout slot. */
  wrapClassName?: string
  inputRef?: React.RefObject<HTMLInputElement>
}

/**
 * A plain `<input>` until the value actually contains a variable — then the
 * highlight layer switches on. Fields without variables render exactly as
 * they did before, so nothing can drift out of alignment in the common case.
 */
export function VarInput({
  value,
  vars,
  wrapClassName,
  className,
  inputRef,
  onScroll,
  ...rest
}: VarInputProps): React.JSX.Element {
  const ownRef = useRef<HTMLInputElement>(null)
  const ref = inputRef ?? ownRef
  const layerRef = useRef<HTMLSpanElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)

  const segs = useMemo(() => varSegments(value, vars), [value, vars])
  // Masked fields render dots, so a character-aligned overlay is meaningless.
  const on = rest.type !== 'password' && segs.some((s) => s.kind !== 'plain')

  /** Mirror the input's box metrics, then follow its horizontal scroll. */
  const sync = useCallback((): void => {
    const input = ref.current
    const layer = layerRef.current
    const text = textRef.current
    if (!input || !layer || !text) return
    const cs = getComputedStyle(input)
    layer.style.fontFamily = cs.fontFamily
    layer.style.fontSize = cs.fontSize
    layer.style.fontWeight = cs.fontWeight
    layer.style.fontStyle = cs.fontStyle
    layer.style.lineHeight = cs.lineHeight
    layer.style.letterSpacing = cs.letterSpacing
    layer.style.textIndent = cs.textIndent
    layer.style.paddingTop = cs.paddingTop
    layer.style.paddingRight = cs.paddingRight
    layer.style.paddingBottom = cs.paddingBottom
    layer.style.paddingLeft = cs.paddingLeft
    layer.style.borderTopWidth = cs.borderTopWidth
    layer.style.borderRightWidth = cs.borderRightWidth
    layer.style.borderBottomWidth = cs.borderBottomWidth
    layer.style.borderLeftWidth = cs.borderLeftWidth
    text.style.transform = `translateX(${-input.scrollLeft}px)`
  }, [ref])

  useLayoutEffect(() => {
    if (on) sync()
  }, [on, value, sync])

  return (
    <span className={`var-hl-wrap${wrapClassName ? ` ${wrapClassName}` : ''}`}>
      <input
        {...rest}
        ref={ref}
        value={value}
        className={`${className ?? ''}${on ? ' var-hl-input' : ''}`}
        onScroll={(e) => {
          sync()
          onScroll?.(e)
        }}
      />
      {on && (
        <span className="var-hl-layer" ref={layerRef} aria-hidden>
          <span className="var-hl-text" ref={textRef}>
            <VarTokens segs={segs} />
          </span>
        </span>
      )}
    </span>
  )
}
