import { useEffect, useRef } from 'react'
import { useApp, useSelectedRequest } from '@/stores/app'
import { useRuns } from '@/stores/runs'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { RequestTitle, UrlRow } from '@/components/request/UrlBar'
import { RequestTabs } from '@/components/request/RequestTabs'
import { TabsBar } from '@/components/request/TabsBar'
import { ResponsePane } from '@/components/response/ResponsePane'
import { HistoryPanel } from '@/components/historyPanel/HistoryPanel'
import { VarPeekCard } from '@/components/common/VarPeek'

const SIDEBAR_DEFAULT_WIDTH = 236

export function RunbookView(): React.JSX.Element {
  const selected = useSelectedRequest()
  const historyPanelOpen = useApp((s) => s.settings.historyPanelOpen)
  const sidebarOpen = useApp((s) => s.settings.sidebarOpen)
  const responsePaneOpen = useApp((s) => s.settings.responsePaneOpen)
  const savedWidth = useApp((s) => s.settings.sidebarWidth)
  const patchSettings = useApp((s) => s.patchSettings)
  const loadForRequest = useRuns((s) => s.loadForRequest)
  const sending = useRuns((s) => s.sending)
  const rootRef = useRef<HTMLDivElement>(null)
  const requestId = selected?.request.id

  useEffect(() => {
    if (requestId) void loadForRequest(requestId)
  }, [requestId, loadForRequest])

  // Sending with the response pane hidden would look like nothing happened — reopen it.
  useEffect(() => {
    if (sending && !useApp.getState().settings.responsePaneOpen) patchSettings({ responsePaneOpen: true })
  }, [sending, patchSettings])

  // Drag writes the CSS variable straight to the DOM — re-rendering the whole
  // runbook per pointermove is what makes dragging stutter. State commits once,
  // when the drag ends. Pointer capture keeps the drag alive (and guarantees the
  // final up event) even when the cursor leaves the window.
  const startDrag = (e: React.PointerEvent): void => {
    e.preventDefault()
    const splitter = e.currentTarget as HTMLElement
    splitter.setPointerCapture(e.pointerId)
    const startX = e.clientX
    const startW = useApp.getState().settings.sidebarWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    let latest = startW
    let frame = 0
    const onMove = (ev: PointerEvent): void => {
      latest = Math.max(170, Math.min(startW + (ev.clientX - startX), Math.round(window.innerWidth * 0.45)))
      // Coalesce pointermove bursts to one layout per frame.
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0
          rootRef.current?.style.setProperty('--sidebar-w', `${latest}px`)
        })
      }
    }
    const finish = (): void => {
      splitter.removeEventListener('pointermove', onMove)
      splitter.removeEventListener('pointerup', finish)
      splitter.removeEventListener('lostpointercapture', finish)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      if (frame) cancelAnimationFrame(frame)
      rootRef.current?.style.setProperty('--sidebar-w', `${latest}px`)
      patchSettings({ sidebarWidth: latest })
    }
    splitter.addEventListener('pointermove', onMove)
    splitter.addEventListener('pointerup', finish)
    splitter.addEventListener('lostpointercapture', finish)
  }

  return (
    <div ref={rootRef} className="runbook" style={{ '--sidebar-w': `${savedWidth}px` } as React.CSSProperties}>
      {sidebarOpen && (
        <>
          <Sidebar />
          <div
            className="splitter splitter-v"
            title="Drag to resize · double-click to reset"
            onPointerDown={startDrag}
            onDoubleClick={() => patchSettings({ sidebarWidth: SIDEBAR_DEFAULT_WIDTH })}
          >
            <span className="splitter-grip" />
          </div>
        </>
      )}
      <div className="center-pane">
        <TabsBar />
        {selected ? (
          <>
            <RequestTitle request={selected.request} collection={selected.collection} />
            <UrlRow request={selected.request} />
            <RequestTabs request={selected.request} />
            {responsePaneOpen && <ResponsePane request={selected.request} />}
          </>
        ) : (
          <div className="center-empty">
            <div className="empty-state">
              <div className="empty-glyph">⌁</div>
              <div className="empty-title">No request open</div>
              <div className="empty-sub">Open a request from the sidebar, or create a new one.</div>
              <div className="empty-hints">
                <span className="kbd">⌘N</span> new request
                <span className="kbd">⌘P</span> search
              </div>
            </div>
          </div>
        )}
      </div>
      {historyPanelOpen && <HistoryPanel />}
      <VarPeekCard />
    </div>
  )
}
