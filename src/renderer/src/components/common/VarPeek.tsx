import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { VAR_RE, varName } from '@shared/interpolate'
import { newId } from '@shared/id'
import { charWidth } from '@/lib/find'
import { useApp, useActiveEnv } from '@/stores/app'
import { useUi } from '@/stores/ui'

/**
 * Postman-style variable peek: hover a `{{variable}}` in the URL bar, a
 * header value or the body editor to see its resolved value and scope,
 * and edit it in place.
 */

interface Peek {
  name: string
  x: number
  y: number
}

interface VarPeekState {
  peek: Peek | null
}

export const useVarPeek = create<VarPeekState>(() => ({ peek: null }))

let showTimer: ReturnType<typeof setTimeout> | null = null
let hideTimer: ReturnType<typeof setTimeout> | null = null

function scheduleShow(name: string, x: number, y: number): void {
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = null
  const current = useVarPeek.getState().peek
  if (current?.name === name) return // already showing this one — don't jitter
  if (showTimer) clearTimeout(showTimer)
  showTimer = setTimeout(() => useVarPeek.setState({ peek: { name, x, y } }), 180)
}

export function scheduleHide(): void {
  if (showTimer) clearTimeout(showTimer)
  showTimer = null
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => useVarPeek.setState({ peek: null }), 220)
}

function cancelHide(): void {
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = null
}

interface HoverOpts {
  font: string
  /** For textareas: line metrics to map the cursor to a character. */
  multiline?: { lineHeight: number; padTop: number }
}

/** Mouse handlers that map the cursor to a `{{var}}` token in an input/textarea. */
export function varHoverHandlers(opts: HoverOpts): {
  onMouseMove: (e: React.MouseEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  onMouseLeave: () => void
} {
  return {
    onMouseMove: (e) => {
      const el = e.currentTarget
      const text = el.value
      const rect = el.getBoundingClientRect()
      const padLeft = parseFloat(getComputedStyle(el).paddingLeft) || 0
      const cw = charWidth(opts.font)
      const xCh = (e.clientX - rect.left - padLeft + el.scrollLeft) / cw

      let index: number
      if (opts.multiline) {
        const { lineHeight, padTop } = opts.multiline
        const lineNo = Math.floor((e.clientY - rect.top - padTop + el.scrollTop) / lineHeight)
        const lines = text.split('\n')
        if (lineNo < 0 || lineNo >= lines.length) return scheduleHide()
        const col = Math.floor(xCh)
        if (col < 0 || col > lines[lineNo].length) return scheduleHide()
        let offset = 0
        for (let i = 0; i < lineNo; i++) offset += lines[i].length + 1
        index = offset + col
      } else {
        const col = Math.floor(xCh)
        if (col < 0 || col > text.length) return scheduleHide()
        index = col
      }

      VAR_RE.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = VAR_RE.exec(text))) {
        if (index >= m.index && index < m.index + m[0].length) {
          scheduleShow(varName(m), e.clientX, e.clientY)
          return
        }
      }
      scheduleHide()
    },
    onMouseLeave: () => scheduleHide()
  }
}

const CARD_W = 300

export function VarPeekCard(): React.JSX.Element | null {
  const peek = useVarPeek((s) => s.peek)
  if (!peek) return null
  return <Card key={peek.name} peek={peek} />
}

function Card({ peek }: { peek: Peek }): React.JSX.Element {
  const env = useActiveEnv()
  const updateEnvironments = useApp((s) => s.updateEnvironments)
  const updateCollectionVariables = useApp((s) => s.updateCollectionVariables)
  const environments = useApp((s) => s.environments)
  const collection = useApp((s) => s.collections.find((c) => c.id === s.selection?.collectionId))
  const toast = useUi((s) => s.toast)

  const name = peek.name
  const dynamic = name.startsWith('$')
  const envVar = env?.variables.find((v) => v.key === name && v.enabled)
  const colVar = !envVar ? collection?.variables?.find((v) => v.key === name && v.enabled) : undefined

  const scope = dynamic
    ? 'Dynamic'
    : envVar
      ? `Environment · ${env!.name}`
      : colVar
        ? `Collection · ${collection!.name}`
        : 'Unresolved'
  const current = envVar?.value ?? colVar?.value ?? ''
  const [draft, setDraft] = useState(current)

  // Keep the draft in sync if the underlying value changes while open.
  useEffect(() => setDraft(current), [current])

  const save = (): void => {
    if (dynamic) return
    if (envVar && env) {
      updateEnvironments(
        environments.map((e) =>
          e.id === env.id
            ? { ...e, variables: e.variables.map((v) => (v.key === name && v.enabled ? { ...v, value: draft } : v)) }
            : e
        )
      )
      toast(`{{${name}}} updated in ${env.name}`)
    } else if (colVar && collection) {
      updateCollectionVariables(
        collection.id,
        (collection.variables ?? []).map((v) => (v.key === name && v.enabled ? { ...v, value: draft } : v))
      )
      toast(`{{${name}}} updated in ${collection.name}`)
    } else if (env) {
      updateEnvironments(
        environments.map((e) =>
          e.id === env.id ? { ...e, variables: [...e.variables, { id: newId(6), key: name, value: draft, enabled: true }] } : e
        )
      )
      toast(`{{${name}}} added to ${env.name}`)
    }
    useVarPeek.setState({ peek: null })
  }

  const left = Math.min(peek.x, window.innerWidth - CARD_W - 12)
  const top = Math.min(peek.y + 16, window.innerHeight - 140)

  return (
    <div
      className="var-peek"
      style={{ left, top, width: CARD_W }}
      onMouseEnter={cancelHide}
      onMouseLeave={scheduleHide}
    >
      <div className="var-peek-head">
        <span className="var-peek-name code-font">{`{{${name}}}`}</span>
        <span className={`var-peek-scope ${scope === 'Unresolved' ? 'var-peek-missing' : ''}`}>{scope}</span>
      </div>
      {dynamic ? (
        <div className="var-peek-note">
          {name === '$uuid'
            ? 'Resolves to a fresh random UUID at send time.'
            : name === '$timestamp'
              ? 'Resolves to the current unix timestamp at send time.'
              : 'Resolves at send time.'}
        </div>
      ) : (
        <div className="var-peek-edit">
          <input
            className="var-peek-input code-font"
            value={draft}
            placeholder={scope === 'Unresolved' ? 'set a value…' : 'value'}
            autoFocus={false}
            spellCheck={false}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') useVarPeek.setState({ peek: null })
            }}
          />
          <button className="var-peek-save" onClick={save} disabled={!envVar && !colVar && !env}>
            {envVar || colVar ? 'Save' : `Add to ${env?.name ?? 'env'}`}
          </button>
        </div>
      )}
    </div>
  )
}
