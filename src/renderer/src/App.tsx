import { useEffect } from 'react'
import { useApp } from '@/stores/app'
import { useRuns } from '@/stores/runs'
import { useUi } from '@/stores/ui'
import { Titlebar } from '@/components/titlebar/Titlebar'
import { RunbookView } from '@/components/RunbookView'
import { HistoryPage } from '@/components/historyView/HistoryPage'
import { ShareModal } from '@/components/modals/ShareModal'
import { ProfileMenu } from '@/components/modals/ProfileMenu'
import { PreferencesModal } from '@/components/modals/PreferencesModal'
import { ShortcutsModal } from '@/components/modals/ShortcutsModal'
import { EnvironmentsModal } from '@/components/modals/EnvironmentsModal'
import { CollectionVarsModal } from '@/components/modals/CollectionVarsModal'
import { NewProfileModal } from '@/components/modals/NewProfileModal'
import { findParentFolderId } from '@/lib/tree'
import { Toasts } from '@/components/common/Toasts'
import { ContextMenu } from '@/components/common/ContextMenu'

export default function App(): React.JSX.Element {
  const booted = useApp((s) => s.booted)
  const hydrate = useApp((s) => s.hydrate)
  const theme = useApp((s) => s.settings.theme)
  const accent = useApp((s) => s.settings.accent)
  const view = useUi((s) => s.view)
  const shareOpen = useUi((s) => s.shareOpen)
  const profileOpen = useUi((s) => s.profileOpen)
  const prefsOpen = useUi((s) => s.prefsOpen)
  const shortcutsOpen = useUi((s) => s.shortcutsOpen)
  const envEditorOpen = useUi((s) => s.envEditorOpen)
  const collectionVarsId = useUi((s) => s.collectionVarsId)
  const newProfileOpen = useUi((s) => s.newProfileOpen)

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.accent = accent
  }, [theme, accent])

  useEffect(() => {
    return window.relay.onRunAppended((summary) => useRuns.getState().handleAppended(summary))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const ui = useUi.getState()
      if (e.key === 'Escape') {
        if (ui.closeOverlays()) e.preventDefault()
        return
      }
      if (!(e.metaKey || e.ctrlKey)) return
      switch (e.key) {
        case 'Enter':
          e.preventDefault()
          void useRuns.getState().send()
          break
        case 'p':
          e.preventDefault()
          ui.setView('runbook')
          window.dispatchEvent(new CustomEvent('relay:focus-search'))
          break
        case ',':
          e.preventDefault()
          ui.openPrefs()
          break
        case '/':
          e.preventDefault()
          ui.openShortcuts()
          break
        case 'e':
          e.preventDefault()
          ui.openEnvEditor()
          break
        case 's':
          e.preventDefault()
          useApp.getState().saveDraft()
          break
        case 'n': {
          e.preventDefault()
          const app = useApp.getState()
          const collectionId = app.selection?.collectionId ?? app.collections[0]?.id
          if (!collectionId) break
          const collection = app.collections.find((c) => c.id === collectionId)
          const folderId =
            app.selection && collection ? findParentFolderId(collection.items, app.selection.requestId) : null
          ui.setView('runbook')
          app.addRequest(collectionId, folderId)
          break
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!booted) return <div className="boot-screen" />

  return (
    <div className="app">
      <Titlebar />
      {view === 'runbook' ? <RunbookView /> : <HistoryPage />}
      {shareOpen && <ShareModal />}
      {profileOpen && <ProfileMenu />}
      {prefsOpen && <PreferencesModal />}
      {shortcutsOpen && <ShortcutsModal />}
      {envEditorOpen && <EnvironmentsModal />}
      {collectionVarsId && <CollectionVarsModal />}
      {newProfileOpen && <NewProfileModal />}
      <ContextMenu />
      <Toasts />
    </div>
  )
}
