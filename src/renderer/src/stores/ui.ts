import { create } from 'zustand'

export type View = 'runbook' | 'history'
export type RequestTab = 'params' | 'body' | 'headers' | 'auth' | 'scripts'

interface Toast {
  id: number
  text: string
  kind: 'info' | 'error'
}

export interface ContextItem {
  label?: string
  danger?: boolean
  sep?: boolean
  action?: () => void
}

export interface ContextMenuState {
  x: number
  y: number
  items: ContextItem[]
}

interface UiState {
  view: View
  tab: RequestTab
  shareOpen: boolean
  profileOpen: boolean
  prefsOpen: boolean
  shortcutsOpen: boolean
  envEditorOpen: boolean
  /** environment to preselect when the editor opens */
  envEditorSelectId: string | null
  /** collection whose variables modal is open */
  collectionVarsId: string | null
  newProfileOpen: boolean
  find: { open: boolean; query: string; scope: 'response' | 'request'; idx: number }
  toasts: Toast[]
  contextMenu: ContextMenuState | null
  /** id of the sidebar node currently being renamed inline */
  renamingId: string | null

  setView: (view: View) => void
  setTab: (tab: RequestTab) => void
  toggleShare: () => void
  toggleProfile: () => void
  openPrefs: () => void
  openShortcuts: () => void
  openEnvEditor: (selectId?: string) => void
  openCollectionVars: (collectionId: string) => void
  openNewProfile: () => void
  setFind: (patch: Partial<UiState['find']>) => void
  closeFind: () => void
  openContextMenu: (x: number, y: number, items: ContextItem[]) => void
  closeContextMenu: () => void
  setRenamingId: (id: string | null) => void
  closeOverlays: () => boolean
  toast: (text: string, kind?: 'info' | 'error') => void
  dismissToast: (id: number) => void
}

let toastSeq = 1

export const useUi = create<UiState>((set, get) => ({
  view: 'runbook',
  tab: 'body',
  shareOpen: false,
  profileOpen: false,
  prefsOpen: false,
  shortcutsOpen: false,
  envEditorOpen: false,
  envEditorSelectId: null,
  collectionVarsId: null,
  newProfileOpen: false,
  find: { open: false, query: '', scope: 'response', idx: 0 },
  toasts: [],
  contextMenu: null,
  renamingId: null,

  setView: (view) => set({ view }),
  setTab: (tab) => set({ tab }),
  toggleShare: () => set((s) => ({ shareOpen: !s.shareOpen, profileOpen: false })),
  toggleProfile: () => set((s) => ({ profileOpen: !s.profileOpen, shareOpen: false })),
  openPrefs: () => set({ prefsOpen: true, profileOpen: false, shareOpen: false }),
  openShortcuts: () => set({ shortcutsOpen: true, profileOpen: false, shareOpen: false }),
  openEnvEditor: (selectId) =>
    set({ envEditorOpen: true, envEditorSelectId: selectId ?? null, profileOpen: false, shareOpen: false }),
  openCollectionVars: (collectionId) =>
    set({ collectionVarsId: collectionId, profileOpen: false, shareOpen: false }),
  openNewProfile: () => set({ newProfileOpen: true, profileOpen: false, shareOpen: false }),
  setFind: (patch) => set((s) => ({ find: { ...s.find, ...patch } })),
  closeFind: () => set((s) => ({ find: { ...s.find, open: false } })),
  openContextMenu: (x, y, items) => set({ contextMenu: { x, y, items } }),
  closeContextMenu: () => set({ contextMenu: null }),
  setRenamingId: (renamingId) => set({ renamingId }),

  closeOverlays: () => {
    const s = get()
    const any =
      s.shareOpen ||
      s.profileOpen ||
      s.prefsOpen ||
      s.shortcutsOpen ||
      s.envEditorOpen ||
      !!s.collectionVarsId ||
      s.newProfileOpen ||
      s.find.open ||
      !!s.contextMenu
    if (any) {
      set({
        shareOpen: false,
        profileOpen: false,
        prefsOpen: false,
        shortcutsOpen: false,
        envEditorOpen: false,
        collectionVarsId: null,
        newProfileOpen: false,
        find: { ...s.find, open: false },
        contextMenu: null
      })
    }
    return any
  },

  toast: (text, kind = 'info') => {
    const id = toastSeq++
    set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }))
    setTimeout(() => get().dismissToast(id), 3200)
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))
