import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import type { HttpMethod, Run } from '@shared/types'
import { useApp } from '@/stores/app'
import { useRuns } from '@/stores/runs'
import { useUi } from '@/stores/ui'
import { findRequest } from '@/lib/tree'
import { dayLabel, fmtBytes, fmtMs, prettyJson, runTime, timeOfDay, urlPath } from '@/lib/format'
import { CodeView } from '@/components/common/Code'
import { CopyMenu } from '@/components/common/CopyMenu'

const METHODS: (HttpMethod | 'all')[] = ['all', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'QUERY']

export function HistoryPage(): React.JSX.Element {
  const allRuns = useRuns((s) => s.allRuns)
  const loadAll = useRuns((s) => s.loadAll)
  const filterStatus = useRuns((s) => s.filterStatus)
  const setFilterStatus = useRuns((s) => s.setFilterStatus)
  const filterMethod = useRuns((s) => s.filterMethod)
  const setFilterMethod = useRuns((s) => s.setFilterMethod)
  const histSelectedId = useRuns((s) => s.histSelectedId)
  const selectHist = useRuns((s) => s.selectHist)
  const histDetail = useRuns((s) => s.histDetail)
  const [methodOpen, setMethodOpen] = useState(false)

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const grouped = useMemo(() => {
    const out: { label: string; runs: typeof allRuns }[] = []
    for (const run of allRuns) {
      const label = dayLabel(run.ts)
      const group = out[out.length - 1]
      if (group && group.label === label) group.runs.push(run)
      else out.push({ label, runs: [run] })
    }
    return out
  }, [allRuns])

  return (
    <div className="history-page">
      <div className="hist-list">
        <div className="hist-list-header">
          <span className="micro-label">ALL RUNS</span>
          <span className="hist-count">{allRuns.length} stored</span>
        </div>
        <div className="hist-filters">
          <button
            className={filterStatus === 'all' ? 'filter-chip filter-active' : 'filter-chip'}
            onClick={() => setFilterStatus('all')}
          >
            All
          </button>
          <button
            className={filterStatus === '2xx' ? 'filter-chip filter-active' : 'filter-chip'}
            onClick={() => setFilterStatus('2xx')}
          >
            2xx
          </button>
          <button
            className={filterStatus === '4xx' ? 'filter-chip filter-active' : 'filter-chip'}
            onClick={() => setFilterStatus('4xx')}
          >
            4xx+
          </button>
          <div className="method-filter-wrap">
            <button
              className={filterMethod !== 'all' ? 'filter-chip filter-active' : 'filter-chip'}
              onClick={() => setMethodOpen((v) => !v)}
            >
              {filterMethod === 'all' ? 'method' : filterMethod}
              <ChevronDown size={12} strokeWidth={2} />
            </button>
            {methodOpen && (
              <>
                <div className="click-away" onMouseDown={() => setMethodOpen(false)} />
                <div className="menu">
                  {METHODS.map((m) => (
                    <button
                      key={m}
                      className="menu-item"
                      onClick={() => {
                        setFilterMethod(m)
                        setMethodOpen(false)
                      }}
                    >
                      {m === 'all' ? 'Any method' : m}
                      {m === filterMethod && <Check className="menu-check" size={13} strokeWidth={2.5} />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="hist-rows">
          {grouped.map((group) => (
            <div key={group.label}>
              <div className="hist-day micro-label">{group.label}</div>
              {group.runs.map((run) => {
                const ok = !run.error && (run.status ?? 0) < 400
                return (
                  <button
                    key={run.id}
                    className={run.id === histSelectedId ? 'hist-row hist-row-active' : 'hist-row'}
                    onClick={() => void selectHist(run.id)}
                  >
                    <span className={`method method-${run.method.toLowerCase()}`}>{run.method}</span>
                    <span className="hist-path code-font">{urlPath(run.url)}</span>
                    <span className={`hist-code code-font ${ok ? 'ok' : 'err'}`}>{run.error ? 'ERR' : run.status}</span>
                    <span className="hist-time code-font">{runTime(run.ts)}</span>
                  </button>
                )
              })}
            </div>
          ))}
          {allRuns.length === 0 && <div className="hp-empty">No runs match these filters</div>}
        </div>
      </div>
      <div className="hist-detail">{histDetail ? <Snapshot run={histDetail} /> : <div className="center-empty">Select a run</div>}</div>
    </div>
  )
}

function Snapshot({ run }: { run: Run }): React.JSX.Element {
  const collections = useApp((s) => s.collections)
  const selectRequest = useApp((s) => s.selectRequest)
  const setView = useUi((s) => s.setView)
  const toast = useUi((s) => s.toast)

  const openInRunbook = (): void => {
    const collection = collections.find((c) => c.id === run.collectionId)
    const request = collection ? findRequest(collection.items, run.requestId) : null
    if (!collection || !request) {
      toast('This request no longer exists in the collection', 'error')
      return
    }
    selectRequest(collection.id, request.id)
    setView('runbook')
  }

  const ok = run.response && run.response.status < 400

  return (
    <>
      <div className="snap-header">
        <span className="chip chip-warn">READ-ONLY SNAPSHOT</span>
        <span className="snap-time code-font">{timeOfDay(run.ts)}</span>
        <div className="flex-spacer" />
        <button className="text-btn" onClick={openInRunbook}>
          ↩ Open in Runbook
        </button>
        <CopyMenu req={run.request} />
      </div>
      <div className="snap-cols">
        <div className="snap-col snap-col-left">
          <div className="snap-section">
            <div className="micro-label">REQUEST</div>
            <div className="snap-url">
              <span className={`method method-${run.request.method.toLowerCase()}`}>{run.request.method}</span>
              <span className="snap-url-text code-font">{run.request.url}</span>
            </div>
          </div>
          <div className="snap-section">
            <div className="micro-label">HEADERS</div>
            <KvGrid pairs={run.request.headers} />
          </div>
          <div className="snap-body">
            <div className="micro-label">BODY</div>
            <CodeView text={run.request.bodyText || '— no body —'} />
          </div>
        </div>
        <div className="snap-col">
          <div className="snap-section">
            <div className="micro-label">RESPONSE</div>
            <div className="snap-status">
              {run.response ? (
                <span className={`status-chip ${ok ? 'status-ok' : 'status-err'}`}>
                  {run.response.status} {run.response.statusText}
                </span>
              ) : (
                <span className="status-chip status-err">Network error</span>
              )}
              <span className="resp-meta">
                {fmtMs(run.durationMs)}
                {run.response ? ` · ${fmtBytes(run.response.sizeBytes)}` : ''}
              </span>
            </div>
          </div>
          <div className="snap-section">
            <div className="micro-label">HEADERS</div>
            {run.response ? <KvGrid pairs={run.response.headers} /> : <div className="hp-empty">{run.error}</div>}
          </div>
          <div className="snap-body">
            <div className="micro-label">BODY</div>
            <CodeView text={run.response ? prettyJson(run.response.bodyText) || '— no body —' : run.error || '— no body —'} />
          </div>
        </div>
      </div>
    </>
  )
}

function KvGrid({ pairs }: { pairs: [string, string][] }): React.JSX.Element {
  return (
    <div className="hdr-grid">
      {pairs.map(([k, v], i) => (
        <div key={i} className="hdr-row">
          <span className="hdr-key code-font">{k}</span>
          <span className="hdr-value code-font">{v}</span>
        </div>
      ))}
    </div>
  )
}
