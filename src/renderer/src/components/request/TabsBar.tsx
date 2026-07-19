import { useEffect, useRef } from 'react'
import { X, Plus } from 'lucide-react'
import { useApp } from '@/stores/app'
import { findRequest } from '@/lib/tree'

/** Postman-style open-request tabs across the top of the center pane. */
export function TabsBar(): React.JSX.Element | null {
  const openTabs = useApp((s) => s.openTabs)
  const selection = useApp((s) => s.selection)
  const collections = useApp((s) => s.collections)
  const drafts = useApp((s) => s.drafts)
  const activeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [selection?.requestId])

  if (!openTabs.length) return null

  return (
    <div className="tabsbar">
      {openTabs.map((tab) => {
        const collection = collections.find((c) => c.id === tab.collectionId)
        const request = drafts[tab.requestId] ?? (collection ? findRequest(collection.items, tab.requestId) : null)
        if (!request) return null
        const active = selection?.requestId === tab.requestId
        return (
          <div
            key={tab.requestId}
            ref={active ? activeRef : undefined}
            className={active ? 'rtab rtab-active' : 'rtab'}
            title={request.name}
            onClick={() => useApp.getState().selectRequest(tab.collectionId, tab.requestId)}
            onAuxClick={(e) => {
              if (e.button === 1) useApp.getState().closeTab(tab.requestId)
            }}
          >
            <span className={`method method-${request.method.toLowerCase()}`}>{request.method}</span>
            <span className="rtab-name">{request.name}</span>
            {drafts[tab.requestId] && <span className="dirty-dot" title="Unsaved changes" />}
            <button
              className="rtab-close"
              title="Close tab (⌘W)"
              onClick={(e) => {
                e.stopPropagation()
                useApp.getState().closeTab(tab.requestId)
              }}
            >
              <X size={13} strokeWidth={2.2} />
            </button>
          </div>
        )
      })}
      <button
        className="rtab-add"
        title="New request (⌘N)"
        onClick={() => {
          const state = useApp.getState()
          const collectionId = state.selection?.collectionId ?? state.collections[0]?.id
          if (collectionId) state.addRequest(collectionId, null)
        }}
      >
        <Plus size={15} strokeWidth={2.2} />
      </button>
    </div>
  )
}
