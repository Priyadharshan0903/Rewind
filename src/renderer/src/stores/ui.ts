import { create } from 'zustand'

export type View = 'runbook' | 'history'
export type RequestTab = 'body' | 'headers' | 'auth' | 'scripts'

interface Toast {
  id: number
  text: string
  kind: 'info' | 'error'
}

interface UiState {
  view: View
  tab: RequestTab
  shareOpen: boolean
  profileOpen: boolean
  prefsOpen: boolean
  shortcutsOpen: boolean
  toasts: Toast[]

  setView: (view: View) => void
  setTab: (tab: RequestTab) => void
  toggleShare: () => void
  toggleProfile: () => void
  openPrefs: () => void
  openShortcuts: () => void
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
  toasts: [],

  setView: (view) => set({ view }),
  setTab: (tab) => set({ tab }),
  toggleShare: () => set((s) => ({ shareOpen: !s.shareOpen, profileOpen: false })),
  toggleProfile: () => set((s) => ({ profileOpen: !s.profileOpen, shareOpen: false })),
  openPrefs: () => set({ prefsOpen: true, profileOpen: false, shareOpen: false }),
  openShortcuts: () => set({ shortcutsOpen: true, profileOpen: false, shareOpen: false }),

  closeOverlays: () => {
    const s = get()
    const any = s.shareOpen || s.profileOpen || s.prefsOpen || s.shortcutsOpen
    if (any) set({ shareOpen: false, profileOpen: false, prefsOpen: false, shortcutsOpen: false })
    return any
  },

  toast: (text, kind = 'info') => {
    const id = toastSeq++
    set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }))
    setTimeout(() => get().dismissToast(id), 3200)
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))
