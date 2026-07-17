import type { RequestNode } from '@shared/types'
import { useApp, useMergedVars } from '@/stores/app'
import { useRuns } from '@/stores/runs'
import { useUi } from '@/stores/ui'
import { fmtBytes, fmtMs } from '@/lib/format'
import { resolveForCodegen } from '@/lib/resolve'
import { CodeView } from '@/components/common/Code'
import { CopyMenu } from '@/components/common/CopyMenu'

export function ResponsePane({ request }: { request: RequestNode }): React.JSX.Element {
  const run = useRuns((s) => s.currentRun)
  const sending = useRuns((s) => s.sending)
  const sendError = useRuns((s) => s.sendError)
  const send = useRuns((s) => s.send)
  const replaceCollection = useApp((s) => s.replaceCollection)
  const patchSettings = useApp((s) => s.patchSettings)
  const historyPanelOpen = useApp((s) => s.settings.historyPanelOpen)
  const vars = useMergedVars()
  const toast = useUi((s) => s.toast)

  // Snippets always reflect the request as currently edited, resolved
  // against collection + environment variables (not a stale stored run).
  const codegenReq = resolveForCodegen(request, vars)

  const saveExample = async (): Promise<void> => {
    if (!run) return
    const updated = await window.relay.saveExample(run.id)
    if (updated) {
      replaceCollection(updated)
      toast('Example saved to request')
    } else {
      toast('Could not save example for this run', 'error')
    }
  }

  const failedAsserts = run?.script?.assertions.filter((a) => !a.pass).length ?? 0

  return (
    <div className="response-pane">
      <div className="resp-header">
        {sending ? (
          <span className="status-chip status-pending">Sending…</span>
        ) : run?.response ? (
          <span className={`status-chip ${run.response.status < 400 ? 'status-ok' : 'status-err'}`}>
            {run.response.status} {run.response.statusText}
          </span>
        ) : run?.error ? (
          <span className="status-chip status-err">Network error</span>
        ) : (
          <span className="status-chip status-idle">No response</span>
        )}
        {run && !sending && (
          <span className="resp-meta">
            {fmtMs(run.durationMs)}
            {run.response ? ` · ${fmtBytes(run.response.sizeBytes)}` : ''}
          </span>
        )}
        {run?.script && !sending && (
          <span
            className={failedAsserts || run.script.error ? 'assert-chip assert-fail' : 'assert-chip assert-pass'}
            title={
              run.script.error ??
              run.script.assertions.map((a) => `${a.pass ? '✓' : '✗'} ${a.expr}`).join('\n')
            }
          >
            {run.script.error
              ? 'script error'
              : failedAsserts
                ? `✗ ${failedAsserts} assert${failedAsserts > 1 ? 's' : ''} failed`
                : `✓ ${run.script.assertions.length || 'script'} ok`}
          </span>
        )}
        {run?.error && !sending && (
          <button className="text-btn retry-btn" onClick={() => void send()}>
            ↻ Retry
          </button>
        )}
        <div className="flex-spacer" />
        <button
          className="text-btn"
          title={historyPanelOpen ? 'Hide history panel' : 'Show history panel'}
          onClick={() => patchSettings({ historyPanelOpen: !historyPanelOpen })}
        >
          ◨
        </button>
        <CopyMenu req={codegenReq} />
        <button className="text-btn" onClick={() => void saveExample()} disabled={!run?.response}>
          ◇ Save example
        </button>
      </div>
      <div className="resp-body">
        {sendError && <div className="resp-error">IPC error: {sendError}</div>}
        {!run && !sending && !sendError && (
          <div className="resp-empty">
            Send the request to see a response here. <span className="kbd">⌘↩</span>
          </div>
        )}
        {run?.error && <div className="resp-error">{run.error}</div>}
        {run?.response && (
          <>
            {run.response.bodyTruncated && (
              <div className="truncate-note">
                Body truncated for display — full size {fmtBytes(run.response.sizeBytes)}
              </div>
            )}
            <CodeView text={run.response.bodyText || '— empty body —'} />
          </>
        )}
      </div>
    </div>
  )
}
