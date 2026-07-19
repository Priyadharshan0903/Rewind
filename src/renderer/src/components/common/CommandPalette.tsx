import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { Collection, HttpMethod, RunSummary, TreeNode } from '@shared/types'
import { useApp } from '@/stores/app'
import { useRuns } from '@/stores/runs'
import { useUi } from '@/stores/ui'
import { useImportOpenApi, useImportPostman } from '@/components/sidebar/Sidebar'
import { runTime } from '@/lib/format'

interface CmdItem {
  kind: 'command'
  id: string
  label: string
  hint?: string
  run: () => void | Promise<void>
}
interface ReqItem {
  kind: 'request'
  id: string
  label: string
  method: HttpMethod
  crumb: string
  url: string
  run: () => void
}
interface RunItem {
  kind: 'run'
  id: string
  label: string
  method: HttpMethod
  status?: number
  error?: string
  ts: number
  run: () => void | Promise<void>
}
type Item = CmdItem | ReqItem | RunItem

const SECTION_LABEL: Record<Item['kind'], string> = {
  command: 'Actions',
  request: 'Requests',
  run: 'History'
}

function collectRequests(collections: Collection[]): ReqItem[] {
  const out: ReqItem[] = []
  const walk = (items: TreeNode[], collection: Collection, folders: string[]): void => {
    for (const node of items) {
      if (node.type === 'request') {
        out.push({
          kind: 'request',
          id: node.id,
          label: node.name,
          method: node.method,
          url: node.url,
          crumb: [collection.name, ...folders].join(' / '),
          run: () => {
            useApp.getState().selectRequest(collection.id, node.id)
            useUi.getState().setView('runbook')
            useUi.getState().closePalette()
          }
        })
      } else {
        walk(node.children, collection, [...folders, node.name])
      }
    }
  }
  for (const c of collections) walk(c.items, c, [])
  return out
}

export function CommandPalette(): React.JSX.Element {
  const collections = useApp((s) => s.collections)
  const closePalette = useUi((s) => s.closePalette)
  const importOpenApi = useImportOpenApi()
  const importPostman = useImportPostman()
  const [query, setQuery] = useState('')
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    void window.rewind.listRuns({ limit: 50 }).then((r) => {
      if (!cancelled) setRuns(r)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const commands = useMemo<CmdItem[]>(() => {
    const ui = useUi.getState()
    const go =
      (fn: () => void): (() => void) =>
      () => {
        fn()
        ui.closePalette()
      }
    return [
      {
        kind: 'command',
        id: 'new-request',
        label: 'New request',
        hint: '⌘N',
        run: go(() => {
          const app = useApp.getState()
          const collectionId = app.selection?.collectionId ?? app.collections[0]?.id
          if (!collectionId) return
          app.addRequest(collectionId, null)
          ui.setView('runbook')
        })
      },
      {
        kind: 'command',
        id: 'go-runbook',
        label: 'Go to Runbook',
        run: go(() => ui.setView('runbook'))
      },
      {
        kind: 'command',
        id: 'go-history',
        label: 'Go to History',
        run: go(() => ui.setView('history'))
      },
      {
        kind: 'command',
        id: 'go-docs',
        label: 'Go to Docs',
        run: go(() => ui.setView('docs'))
      },
      {
        kind: 'command',
        id: 'env',
        label: 'Edit environments & variables',
        hint: '⌘E',
        run: go(() => ui.openEnvEditor())
      },
      {
        kind: 'command',
        id: 'prefs',
        label: 'Preferences',
        hint: '⌘,',
        run: go(() => ui.openPrefs())
      },
      {
        kind: 'command',
        id: 'shortcuts',
        label: 'Keyboard shortcuts',
        hint: '⌘/',
        run: go(() => ui.openShortcuts())
      },
      {
        kind: 'command',
        id: 'import-openapi',
        label: 'Import OpenAPI…',
        run: () => {
          ui.closePalette()
          void importOpenApi()
        }
      },
      {
        kind: 'command',
        id: 'import-postman',
        label: 'Import from Postman…',
        run: () => {
          ui.closePalette()
          void importPostman()
        }
      }
    ]
  }, [importOpenApi, importPostman])

  const allRequests = useMemo(() => collectRequests(collections), [collections])

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase()
    const cmd = commands.filter((c) => !q || c.label.toLowerCase().includes(q)).slice(0, 8)
    const reqs = allRequests
      .filter(
        (r) =>
          !q ||
          r.label.toLowerCase().includes(q) ||
          r.url.toLowerCase().includes(q) ||
          r.method.toLowerCase().includes(q) ||
          r.crumb.toLowerCase().includes(q)
      )
      .slice(0, 8)
    const runItems: RunItem[] = runs
      .filter(
        (r) =>
          !q ||
          r.requestName.toLowerCase().includes(q) ||
          r.method.toLowerCase().includes(q) ||
          String(r.status ?? '').includes(q)
      )
      .slice(0, 6)
      .map((r) => ({
        kind: 'run',
        id: r.id,
        label: r.requestName,
        method: r.method,
        status: r.status,
        error: r.error,
        ts: r.ts,
        run: async () => {
          const ui = useUi.getState()
          ui.setView('history')
          ui.closePalette()
          const rs = useRuns.getState()
          await rs.loadAll()
          await rs.selectHist(r.id)
        }
      }))
    return [...cmd, ...reqs, ...runItems]
  }, [query, commands, allRequests, runs])

  // Keep the highlighted row valid and in view.
  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, items.length - 1)))
  }, [items.length])

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => (items.length ? (a + 1) % items.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (items.length ? (a - 1 + items.length) % items.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      void items[active]?.run()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      closePalette()
    }
  }

  let lastKind: Item['kind'] | null = null

  return (
    <div className="palette-overlay" onMouseDown={closePalette}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette-input-row">
          <span className="palette-icon">⌕</span>
          <input
            className="palette-input"
            autoFocus
            spellCheck={false}
            placeholder="Search requests, history, or actions…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
          />
          <span className="palette-kbd">esc</span>
        </div>
        <div className="palette-results" ref={listRef}>
          {items.length === 0 && <div className="palette-empty">No matches</div>}
          {items.map((it, i) => {
            const header = it.kind !== lastKind ? SECTION_LABEL[it.kind] : null
            lastKind = it.kind
            return (
              <div key={`${it.kind}-${it.id}`}>
                {header && <div className="palette-section">{header}</div>}
                <button
                  data-idx={i}
                  className={`palette-item ${i === active ? 'palette-active' : ''}`}
                  onMouseMove={() => setActive(i)}
                  onClick={() => void it.run()}
                >
                  {it.kind === 'command' && (
                    <>
                      <ChevronRight className="palette-cmd-ic" size={14} strokeWidth={2} />
                      <span className="palette-label">{it.label}</span>
                      {it.hint && <span className="palette-hint">{it.hint}</span>}
                    </>
                  )}
                  {it.kind === 'request' && (
                    <>
                      <span className={`palette-m method-${it.method.toLowerCase()}`}>
                        {it.method}
                      </span>
                      <span className="palette-label">{it.label}</span>
                      <span className="palette-sub">{it.crumb}</span>
                    </>
                  )}
                  {it.kind === 'run' && (
                    <>
                      <span className={`palette-m method-${it.method.toLowerCase()}`}>
                        {it.method}
                      </span>
                      <span className="palette-label">{it.label}</span>
                      <span
                        className={`palette-status ${it.error || (it.status ?? 0) >= 400 ? 'bad' : 'ok'}`}
                      >
                        {it.error ? 'ERR' : it.status}
                      </span>
                      <span className="palette-sub">{runTime(it.ts)}</span>
                    </>
                  )}
                </button>
              </div>
            )
          })}
        </div>
        <div className="palette-foot">
          <span>
            <b>↑↓</b> navigate
          </span>
          <span>
            <b>↵</b> open
          </span>
          <span>
            <b>esc</b> close
          </span>
        </div>
      </div>
    </div>
  )
}
