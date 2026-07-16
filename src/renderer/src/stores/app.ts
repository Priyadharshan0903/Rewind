import { create } from 'zustand'
import type {
  AccentId,
  BootPayload,
  Collection,
  Environment,
  RequestNode,
  Settings,
  ThemeSetting,
  Workspace
} from '@shared/types'
import { findRequest, firstRequest, mapRequest } from '@/lib/tree'

export interface Selection {
  collectionId: string
  requestId: string
}

interface AppState {
  booted: boolean
  workspace: Workspace | null
  settings: Settings
  environments: Environment[]
  collections: Collection[]
  selection: Selection | null

  hydrate: () => Promise<void>
  applyBoot: (boot: BootPayload) => void
  setTheme: (theme: ThemeSetting) => void
  setAccent: (accent: AccentId) => void
  patchSettings: (patch: Partial<Settings>) => void
  setActiveEnv: (envId: string) => void
  selectRequest: (collectionId: string, requestId: string) => void
  updateRequest: (patch: Partial<RequestNode>) => void
  replaceCollection: (collection: Collection) => void
}

const DEFAULT_SETTINGS: Settings = {
  theme: 'light',
  accent: 'indigo',
  historyPanelOpen: true,
  responseBodyLimitBytes: 1024 * 1024
}

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()

function scheduleCollectionSave(collectionId: string, get: () => AppState): void {
  const prior = saveTimers.get(collectionId)
  if (prior) clearTimeout(prior)
  saveTimers.set(
    collectionId,
    setTimeout(() => {
      saveTimers.delete(collectionId)
      const collection = get().collections.find((c) => c.id === collectionId)
      if (collection) void window.relay.saveCollection(collection)
    }, 400)
  )
}

export const useApp = create<AppState>((set, get) => ({
  booted: false,
  workspace: null,
  settings: DEFAULT_SETTINGS,
  environments: [],
  collections: [],
  selection: null,

  hydrate: async () => {
    const boot = await window.relay.getBoot()
    get().applyBoot(boot)
  },

  applyBoot: (boot) => {
    const first = boot.collections[0]
    const req = first ? firstRequest(first.items) : null
    set({
      booted: true,
      workspace: boot.workspace,
      settings: boot.settings,
      environments: boot.environments,
      collections: boot.collections,
      selection: first && req ? { collectionId: first.id, requestId: req.id } : null
    })
  },

  setTheme: (theme) => get().patchSettings({ theme }),
  setAccent: (accent) => get().patchSettings({ accent }),

  patchSettings: (patch) => {
    const settings = { ...get().settings, ...patch }
    set({ settings })
    void window.relay.saveSettings(settings)
  },

  setActiveEnv: (envId) => {
    const ws = get().workspace
    if (!ws) return
    set({ workspace: { ...ws, activeEnvironmentId: envId } })
    void window.relay.setActiveEnv(envId)
  },

  selectRequest: (collectionId, requestId) => set({ selection: { collectionId, requestId } }),

  updateRequest: (patch) => {
    const { selection, collections } = get()
    if (!selection) return
    set({
      collections: collections.map((c) =>
        c.id === selection.collectionId
          ? { ...c, items: mapRequest(c.items, selection.requestId, (r) => ({ ...r, ...patch })) }
          : c
      )
    })
    scheduleCollectionSave(selection.collectionId, get)
  },

  replaceCollection: (collection) =>
    set({ collections: get().collections.map((c) => (c.id === collection.id ? collection : c)) })
}))

export function useActiveEnv(): Environment | null {
  const workspace = useApp((s) => s.workspace)
  const environments = useApp((s) => s.environments)
  return environments.find((e) => e.id === workspace?.activeEnvironmentId) ?? environments[0] ?? null
}

export function useSelectedRequest(): { collection: Collection; request: RequestNode } | null {
  const selection = useApp((s) => s.selection)
  const collections = useApp((s) => s.collections)
  if (!selection) return null
  const collection = collections.find((c) => c.id === selection.collectionId)
  if (!collection) return null
  const request = findRequest(collection.items, selection.requestId)
  return request ? { collection, request } : null
}
