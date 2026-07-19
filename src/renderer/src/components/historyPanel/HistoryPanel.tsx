import { useMemo } from 'react'
import { ChevronDown } from 'lucide-react'
import { useRuns } from '@/stores/runs'
import { fmtBytes, fmtMs, runTime } from '@/lib/format'
import { jsonDiff, DIFF_GUTTER } from '@/lib/jsonDiff'

export function HistoryPanel(): React.JSX.Element {
  const panelRuns = useRuns((s) => s.panelRuns)
  const currentRun = useRuns((s) => s.currentRun)
  const compareId = useRuns((s) => s.compareId)
  const compareRun = useRuns((s) => s.compareRun)
  const setCompare = useRuns((s) => s.setCompare)

  const rows = useMemo(() => {
    if (!currentRun || !compareRun || compareRun.id === currentRun.id) return null
    const oldBody = compareRun.response?.bodyText ?? compareRun.error ?? ''
    const newBody = currentRun.response?.bodyText ?? currentRun.error ?? ''
    return jsonDiff(oldBody, newBody)
  }, [currentRun, compareRun])

  return (
    <div className="history-panel">
      <div className="hp-header">
        <span className="micro-label">HISTORY</span>
        <span className="hp-scope">
          this request <ChevronDown size={12} strokeWidth={2} />
        </span>
      </div>
      <div className="hp-runs">
        {panelRuns.slice(0, 8).map((run, idx) => {
          const isCurrent = idx === 0
          const isCompare = run.id === compareId && !isCurrent
          const ok = !run.error && (run.status ?? 0) < 400
          return (
            <button
              key={run.id}
              className={`run-row ${isCompare ? 'run-compare' : ''} ${isCurrent ? 'run-current' : ''}`}
              onClick={() => {
                if (!isCurrent) void setCompare(run.id)
              }}
            >
              <span className={`code-chip ${ok ? 'code-ok' : 'code-err'}`}>
                {run.error ? 'ERR' : run.status}
              </span>
              <span className="run-col">
                <span className="run-time code-font">{runTime(run.ts)}</span>
                <span className="run-meta">
                  {run.error ? run.error : `${fmtMs(run.durationMs)} · ${fmtBytes(run.sizeBytes)}`}
                </span>
              </span>
              <span className={`run-tag ${isCurrent ? 'tag-current' : 'tag-diff'}`}>
                {isCurrent ? 'CURRENT' : isCompare ? 'DIFF ◂' : ''}
              </span>
            </button>
          )
        })}
        {panelRuns.length === 0 && <div className="hp-empty">No runs yet for this request</div>}
      </div>
      <div className="hp-diff-header">
        <span className="micro-label">DIFF</span>
        {compareRun && compareRun.id !== currentRun?.id && (
          <span className="diff-label code-font">vs {runTime(compareRun.ts)}</span>
        )}
      </div>
      <div className="hp-diff">
        {rows ? (
          rows.map((row, i) => (
            <div key={i} className={`diff-row diff-${row.kind}`}>
              <span className="diff-gutter">{DIFF_GUTTER[row.kind]}</span>
              <span className="diff-text">{row.text}</span>
            </div>
          ))
        ) : (
          <div className="hp-empty">Pick an older run to diff against the current response</div>
        )}
      </div>
      <div className="hp-footer">
        <span className="dot dot-ok" />
        All runs stored locally — nothing leaves this machine
      </div>
    </div>
  )
}
