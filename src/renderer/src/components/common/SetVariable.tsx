import { useEffect, useMemo, useRef, useState } from 'react'
import { create } from 'zustand'
import { newId } from '@shared/id'
import { charWidth } from '@/lib/find'
import { useApp, useActiveEnv } from '@/stores/app'
import { useUi } from '@/stores/ui'

/**
 * Postman-style "Set as variable": select text in the URL bar, a header/
 * param/auth field or the body editor, right-click, and turn the selection
 * into an environment or collection variable — the field's text is then
 * replaced with `{{name}}`.
 */

interface SetVarCtx {
  x: number
  y: number
  value: string
  start: number
  end: number
  onReplace: (newValue: string) => void
  /** The field the selection came from — kept so we can redraw a highlight
   *  over the exact selected span while the prompt is open (the native
   *  selection disappears once focus moves to the menu/prompt). */
  el: HTMLInputElement | HTMLTextAreaElement
  /** Set for textareas — lets the highlight wrap across lines. */
  multiline?: { lineHeight: number; padTop: number }
}

interface SetVarState {
  ctx: SetVarCtx | null
}

export const useSetVar = create<SetVarState>(() => ({ ctx: null }))

const NAME_RE = /^[A-Za-z_][\w-]*$/

/**
 * Wire this onto an input/textarea's `onContextMenu`. If there's a
 * non-empty selection it opens the "Set as variable" menu and swallows the
 * event; otherwise it does nothing, leaving the native context menu (or any
 * other handler) in place.
 */
export function useVarContextMenu<T extends HTMLInputElement | HTMLTextAreaElement>(
  onReplace: (newValue: string) => void,
  opts?: { multiline?: { lineHeight: number; padTop: number } }
): (e: React.MouseEvent<T>) => void {
  return (e) => {
    const el = e.currentTarget
    // Password inputs throw on selectionStart/End access in Chromium.
    if (el instanceof HTMLInputElement && el.type === 'password') return
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    if (start === end) return
    const selected = el.value.slice(start, end)
    if (!selected.trim()) return
    e.preventDefault()
    useUi
      .getState()
      .openContextMenu(e.clientX, e.clientY, [
        {
          label: 'Set as variable…',
          action: () =>
            useSetVar.setState({
              ctx: {
                x: e.clientX,
                y: e.clientY,
                value: el.value,
                start,
                end,
                onReplace,
                el,
                multiline: opts?.multiline
              }
            })
        }
      ])
  }
}

const CARD_W = 320

export function SetVariablePrompt(): React.JSX.Element | null {
  const ctx = useSetVar((s) => s.ctx)
  if (!ctx) return null
  return (
    <>
      <SelectionHighlight ctx={ctx} />
      <Card ctx={ctx} />
    </>
  )
}

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

/** Where the source field's `{{selection}}` would be drawn, in viewport space. */
function selectionRects(ctx: SetVarCtx): Rect[] {
  const el = ctx.el
  const rect = el.getBoundingClientRect()
  const font = getComputedStyle(el).font
  const padLeft = parseFloat(getComputedStyle(el).paddingLeft) || 0
  const charW = charWidth(font)

  if (!ctx.multiline) {
    return [
      {
        left: rect.left + padLeft + ctx.start * charW - el.scrollLeft,
        top: rect.top,
        width: (ctx.end - ctx.start) * charW,
        height: rect.height
      }
    ]
  }

  const { lineHeight, padTop } = ctx.multiline
  const lines = ctx.value.split('\n')
  const posOf = (idx: number): { line: number; col: number } => {
    let offset = 0
    for (let i = 0; i < lines.length; i++) {
      if (idx <= offset + lines[i].length) return { line: i, col: idx - offset }
      offset += lines[i].length + 1
    }
    return { line: lines.length - 1, col: lines[lines.length - 1].length }
  }
  const from = posOf(ctx.start)
  const to = posOf(ctx.end)
  const out: Rect[] = []
  for (let line = from.line; line <= to.line; line++) {
    const colStart = line === from.line ? from.col : 0
    const colEnd = line === to.line ? to.col : lines[line].length
    out.push({
      left: rect.left + padLeft + colStart * charW - el.scrollLeft,
      top: rect.top + padTop + line * lineHeight - el.scrollTop,
      width: Math.max(0, (colEnd - colStart) * charW),
      height: lineHeight
    })
  }
  return out
}

/** Redraws the field's selection as a fixed overlay — the real selection
 *  is lost once focus moves to the context menu / this prompt. */
function SelectionHighlight({ ctx }: { ctx: SetVarCtx }): React.JSX.Element {
  const rects = useMemo(() => selectionRects(ctx), [ctx])
  return (
    <>
      {rects.map((r, i) => (
        <div key={i} className="setvar-selmark" style={r} />
      ))}
    </>
  )
}

function Card({ ctx }: { ctx: SetVarCtx }): React.JSX.Element {
  const env = useActiveEnv()
  const environments = useApp((s) => s.environments)
  const updateEnvironments = useApp((s) => s.updateEnvironments)
  const updateCollectionVariables = useApp((s) => s.updateCollectionVariables)
  const collection = useApp((s) => s.collections.find((c) => c.id === s.selection?.collectionId))
  const toast = useUi((s) => s.toast)
  const inputRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState('')
  const [scope, setScope] = useState<'env' | 'col'>(env ? 'env' : 'col')

  useEffect(() => {
    setName('')
    setScope(env ? 'env' : 'col')
    requestAnimationFrame(() => inputRef.current?.focus())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx])

  const close = (): void => useSetVar.setState({ ctx: null })

  const selected = ctx.value.slice(ctx.start, ctx.end)
  const key = name.trim()
  const valid = NAME_RE.test(key)

  const save = (): void => {
    if (!valid) return
    if (scope === 'env' && env) {
      updateEnvironments(
        environments.map((e) =>
          e.id === env.id
            ? { ...e, variables: [...e.variables, { id: newId(6), key, value: selected, enabled: true }] }
            : e
        )
      )
      toast(`{{${key}}} added to ${env.name}`)
    } else if (scope === 'col' && collection) {
      updateCollectionVariables(collection.id, [
        ...(collection.variables ?? []),
        { id: newId(6), key, value: selected, enabled: true }
      ])
      toast(`{{${key}}} added to ${collection.name}`)
    } else {
      return
    }
    const nextValue = ctx.value.slice(0, ctx.start) + `{{${key}}}` + ctx.value.slice(ctx.end)
    ctx.onReplace(nextValue)
    close()
  }

  const left = Math.min(ctx.x, window.innerWidth - CARD_W - 12)
  const top = Math.min(ctx.y + 8, window.innerHeight - 220)

  return (
    <div className="ctx-overlay" onMouseDown={close} onContextMenu={(e) => e.preventDefault()}>
      <div
        className="var-peek setvar-peek"
        style={{ left, top, width: CARD_W }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="var-peek-head">
          <span className="var-peek-name code-font">Set as variable</span>
        </div>
        <div className="setvar-preview code-font" title={selected}>
          {selected}
        </div>
        <input
          ref={inputRef}
          className="var-peek-input setvar-name-input code-font"
          value={name}
          placeholder="variable name"
          spellCheck={false}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') close()
          }}
        />
        {env && collection && (
          <div className="setvar-scope">
            <button
              className={scope === 'env' ? 'setvar-scope-btn setvar-scope-on' : 'setvar-scope-btn'}
              onClick={() => setScope('env')}
            >
              {env.name}
            </button>
            <button
              className={scope === 'col' ? 'setvar-scope-btn setvar-scope-on' : 'setvar-scope-btn'}
              onClick={() => setScope('col')}
            >
              {collection.name}
            </button>
          </div>
        )}
        <div className="var-peek-edit">
          <button className="var-peek-save setvar-save" onClick={save} disabled={!valid}>
            {scope === 'env' && env
              ? `Add to ${env.name}`
              : scope === 'col' && collection
                ? `Add to ${collection.name}`
                : 'Add'}
          </button>
        </div>
      </div>
    </div>
  )
}
