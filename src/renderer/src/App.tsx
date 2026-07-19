import { useEffect } from 'react'
import { useApp } from '@/stores/app'
import { useRuns } from '@/stores/runs'
import { useUi } from '@/stores/ui'
import { Titlebar } from '@/components/titlebar/Titlebar'
import { RunbookView } from '@/components/RunbookView'
import { HistoryPage } from '@/components/historyView/HistoryPage'
import { DocsView } from '@/components/docs/DocsView'
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
import { CommandPalette } from '@/components/common/CommandPalette'
import { InPageFind } from '@/components/common/InPageFind'

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
  const paletteOpen = useUi((s) => s.paletteOpen)
  const pageFindOpen = useUi((s) => s.pageFind.open)

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.accent = accent
  }, [theme, accent])

  // Switching views dismisses the in-page find bar (and clears its highlights).
  useEffect(() => {
    useUi.getState().closePageFind()
  }, [view])

  useEffect(() => {
    return window.rewind.onRunAppended((summary) => useRuns.getState().handleAppended(summary))
  }, [])

  // ⌘W (File → Close Tab in the app menu) closes the active request tab.
  useEffect(() => {
    return window.rewind.onCloseActiveTab(() => {
      const app = useApp.getState()
      if (useUi.getState().view === 'runbook' && app.selection)
        app.closeTab(app.selection.requestId)
    })
  }, [])

  useEffect(() => {
    const newRequest = (): void => {
      const app = useApp.getState()
      const collectionId = app.selection?.collectionId ?? app.collections[0]?.id
      if (!collectionId) return
      const collection = app.collections.find((c) => c.id === collectionId)
      const folderId =
        app.selection && collection
          ? findParentFolderId(collection.items, app.selection.requestId)
          : null
      useUi.getState().setView('runbook')
      app.addRequest(collectionId, folderId)
    }

    const onKey = (e: KeyboardEvent): void => {
      const ui = useUi.getState()
      if (e.key === 'Escape') {
        if (ui.closeOverlays()) e.preventDefault()
        return
      }
      // ⌥↵ (Option+Enter) — New request. Handled before the ⌘/⌃ guard below,
      // since it uses ⌥ rather than the command/control modifier.
      if (
        e.altKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        (e.code === 'Enter' || e.code === 'NumpadEnter')
      ) {
        e.preventDefault()
        newRequest()
        return
      }
      if (!(e.metaKey || e.ctrlKey)) return
      // e.code, not e.key: ⌥ changes e.key on macOS (⌘⌥B would report '∫').
      if (e.code === 'KeyB') {
        e.preventDefault()
        const { settings, patchSettings } = useApp.getState()
        if (e.altKey) patchSettings({ historyPanelOpen: !settings.historyPanelOpen })
        else patchSettings({ sidebarOpen: !settings.sidebarOpen })
        return
      }
      if (e.code === 'KeyJ') {
        e.preventDefault()
        const { settings, patchSettings } = useApp.getState()
        patchSettings({ responsePaneOpen: !settings.responsePaneOpen })
        return
      }
      if (e.code === 'KeyK') {
        e.preventDefault()
        ui.togglePalette()
        return
      }
      switch (e.key) {
        case 'Enter':
          e.preventDefault()
          void useRuns.getState().send()
          break
        case 'p':
          e.preventDefault()
          ui.setView('runbook')
          window.dispatchEvent(new CustomEvent('rewind:focus-search'))
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
        case 'f': {
          e.preventDefault()
          if (ui.view === 'runbook') {
            // Context-aware: ⌘F inside the body editor finds in the request.
            const inEditor = document.activeElement?.classList.contains('ed-input')
            ui.setFind({
              open: true,
              scope: inEditor ? 'request' : 'response',
              idx: 0
            })
            if (inEditor) ui.setTab('body')
          } else {
            // History / Docs have no editor find — use the in-page find.
            ui.openPageFind()
          }
          break
        }
        case 'n': {
          e.preventDefault()
          newRequest()
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
      {view === 'runbook' ? <RunbookView /> : view === 'history' ? <HistoryPage /> : <DocsView />}
      {shareOpen && <ShareModal />}
      {profileOpen && <ProfileMenu />}
      {prefsOpen && <PreferencesModal />}
      {shortcutsOpen && <ShortcutsModal />}
      {envEditorOpen && <EnvironmentsModal />}
      {collectionVarsId && <CollectionVarsModal />}
      {newProfileOpen && <NewProfileModal />}
      {paletteOpen && <CommandPalette />}
      {pageFindOpen && <InPageFind />}
      <ContextMenu />
      <Toasts />
    </div>
  )
}
