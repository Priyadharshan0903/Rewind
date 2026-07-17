import { useEffect } from 'react'
import { useApp, useSelectedRequest } from '@/stores/app'
import { useRuns } from '@/stores/runs'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { RequestTitle, UrlRow } from '@/components/request/UrlBar'
import { RequestTabs } from '@/components/request/RequestTabs'
import { ResponsePane } from '@/components/response/ResponsePane'
import { HistoryPanel } from '@/components/historyPanel/HistoryPanel'

export function RunbookView(): React.JSX.Element {
  const selected = useSelectedRequest()
  const historyPanelOpen = useApp((s) => s.settings.historyPanelOpen)
  const loadForRequest = useRuns((s) => s.loadForRequest)
  const requestId = selected?.request.id

  useEffect(() => {
    if (requestId) void loadForRequest(requestId)
  }, [requestId, loadForRequest])

  return (
    <div className="runbook">
      <Sidebar />
      <div className="center-pane">
        {selected ? (
          <>
            <RequestTitle request={selected.request} collection={selected.collection} />
            <UrlRow request={selected.request} />
            <RequestTabs request={selected.request} />
            <ResponsePane request={selected.request} />
          </>
        ) : (
          <div className="center-empty">Select a request from the collection</div>
        )}
      </div>
      {historyPanelOpen && <HistoryPanel />}
    </div>
  )
}
