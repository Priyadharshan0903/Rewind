import { useMemo } from 'react'
import { create } from 'zustand'
import { varsFromEnv } from '@shared/interpolate'
import type {
  AccentId,
  BootPayload,
  Collection,
  Environment,
  KV,
  ProfileInfo,
  ProfilesState,
  RequestNode,
  Settings,
  ThemeSetting,
  Workspace
} from '@shared/types'
import { newId } from '@shared/id'
import type { FolderNode } from '@shared/types'
import {
  cloneNode,
  collectRequestIds,
  duplicateIn,
  findRequest,
  firstRequest,
  insertNode,
  mapRequest,
  removeNode,
  renameFolder
} from '@/lib/tree'

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
  /** Unsaved edits per request id — nothing hits disk until saveDraft(). */
  drafts: Record<string, RequestNode>
  profiles: ProfileInfo[]
  activeProfileId: string

  hydrate: () => Promise<void>
  applyBoot: (boot: BootPayload) => void
  setProfilesState: (state: ProfilesState) => void
  setTheme: (theme: ThemeSetting) => void
  setAccent: (accent: AccentId) => void
  patchSettings: (patch: Partial<Settings>) => void
  setActiveEnv: (envId: string) => void
  selectRequest: (collectionId: string, requestId: string) => void
  updateRequest: (patch: Partial<RequestNode>) => void
  saveDraft: () => void
  discardDraft: () => void
  replaceCollection: (collection: Collection) => void

  updateEnvironments: (environments: Environment[]) => void
  addEnvironment: () => string
  removeEnvironment: (envId: string) => void

  addCollection: () => void
  renameCollection: (collectionId: string, name: string) => void
  updateCollectionVariables: (collectionId: string, variables: KV[]) => void
  addFolder: (collectionId: string) => void
  renameFolderNode: (collectionId: string, folderId: string, name: string) => void
  renameRequest: (collectionId: string, requestId: string, name: string) => void
  addRequest: (collectionId: string, folderId: string | null) => void
  deleteNode: (collectionId: string, nodeId: string) => void
  duplicateNode: (collectionId: string, nodeId: string) => void
  duplicateCollection: (collectionId: string) => void
  deleteCollection: (collectionId: string) => void
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
  drafts: {},
  profiles: [],
  activeProfileId: '',

  hydrate: async () => {
    const [boot, profiles] = await Promise.all([window.relay.getBoot(), window.relay.listProfiles()])
    get().applyBoot(boot)
    get().setProfilesState(profiles)
  },

  setProfilesState: (state) => set({ profiles: state.profiles, activeProfileId: state.activeId }),

  applyBoot: (boot) => {
    const first = boot.collections[0]
    const req = first ? firstRequest(first.items) : null
    set({
      booted: true,
      workspace: boot.workspace,
      settings: boot.settings,
      environments: boot.environments,
      collections: boot.collections,
      selection: first && req ? { collectionId: first.id, requestId: req.id } : null,
      drafts: {}
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

  // Edits accumulate in a draft (Postman-style); disk is untouched until Save.
  updateRequest: (patch) => {
    const { selection, collections, drafts } = get()
    if (!selection) return
    const collection = collections.find((c) => c.id === selection.collectionId)
    const base = drafts[selection.requestId] ?? (collection ? findRequest(collection.items, selection.requestId) : null)
    if (!base) return
    set({ drafts: { ...drafts, [selection.requestId]: { ...base, ...patch } } })
  },

  saveDraft: () => {
    const { selection, collections, drafts } = get()
    if (!selection) return
    const draft = drafts[selection.requestId]
    if (!draft) return
    const next = collections.map((c) =>
      c.id === selection.collectionId ? { ...c, items: mapRequest(c.items, selection.requestId, () => draft) } : c
    )
    const rest = { ...drafts }
    delete rest[selection.requestId]
    set({ collections: next, drafts: rest })
    const collection = next.find((c) => c.id === selection.collectionId)
    if (collection) void window.relay.saveCollection(collection)
  },

  discardDraft: () => {
    const { selection, drafts } = get()
    if (!selection || !drafts[selection.requestId]) return
    const rest = { ...drafts }
    delete rest[selection.requestId]
    set({ drafts: rest })
  },

  replaceCollection: (collection) =>
    set({ collections: get().collections.map((c) => (c.id === collection.id ? collection : c)) }),

  updateEnvironments: (environments) => {
    set({ environments })
    scheduleEnvSave(get)
  },

  addEnvironment: () => {
    const env: Environment = {
      id: newId(),
      name: 'New environment',
      dotColor: 'ok',
      variables: [
        { id: newId(6), key: 'baseUrl', value: 'https://', enabled: true },
        { id: newId(6), key: 'token', value: '', enabled: true }
      ]
    }
    get().updateEnvironments([...get().environments, env])
    return env.id
  },

  removeEnvironment: (envId) => {
    const { environments, workspace } = get()
    if (environments.length <= 1) return
    const next = environments.filter((e) => e.id !== envId)
    get().updateEnvironments(next)
    if (workspace?.activeEnvironmentId === envId) get().setActiveEnv(next[0].id)
  },

  addCollection: () => {
    const collection: Collection = { id: newId(), name: 'New collection', version: 'v1', items: [] }
    set({ collections: [...get().collections, collection] })
    void window.relay.saveCollection(collection)
  },

  renameCollection: (collectionId, name) => mutateCollection(collectionId, (c) => ({ ...c, name }), set, get),

  updateCollectionVariables: (collectionId, variables) =>
    mutateCollection(collectionId, (c) => ({ ...c, variables }), set, get),

  addFolder: (collectionId) => {
    const folder: FolderNode = { id: newId(), type: 'folder', name: 'New folder', children: [] }
    mutateCollection(collectionId, (c) => ({ ...c, items: [...c.items, folder] }), set, get)
  },

  renameFolderNode: (collectionId, folderId, name) =>
    mutateCollection(collectionId, (c) => ({ ...c, items: renameFolder(c.items, folderId, name) }), set, get),

  // Sidebar rename saves immediately (structural), without committing draft edits.
  renameRequest: (collectionId, requestId, name) => {
    mutateCollection(
      collectionId,
      (c) => ({ ...c, items: mapRequest(c.items, requestId, (r) => ({ ...r, name })) }),
      set,
      get
    )
    const { drafts } = get()
    if (drafts[requestId]) set({ drafts: { ...drafts, [requestId]: { ...drafts[requestId], name } } })
  },

  addRequest: (collectionId, folderId) => {
    const request: RequestNode = {
      id: newId(),
      type: 'request',
      name: 'New request',
      method: 'GET',
      url: '{{baseUrl}}/',
      headers: [],
      body: { mode: 'none', text: '' },
      auth: { mode: 'inherit' },
      scripts: { postResponse: '' },
      examples: []
    }
    mutateCollection(collectionId, (c) => ({ ...c, items: insertNode(c.items, folderId, request) }), set, get)
    set({ selection: { collectionId, requestId: request.id } })
  },

  deleteNode: (collectionId, nodeId) => {
    mutateCollection(collectionId, (c) => ({ ...c, items: removeNode(c.items, nodeId) }), set, get)
    pruneDrafts(set, get)
    const { selection, collections } = get()
    if (selection?.collectionId === collectionId) {
      const collection = collections.find((c) => c.id === collectionId)
      if (!collection || !findRequest(collection.items, selection.requestId)) {
        const fallback = collection ? firstRequest(collection.items) : null
        set({ selection: fallback ? { collectionId, requestId: fallback.id } : null })
      }
    }
  },

  duplicateNode: (collectionId, nodeId) => {
    let createdId: string | null = null
    mutateCollection(
      collectionId,
      (c) => {
        const { items, created } = duplicateIn(c.items, nodeId)
        if (created?.type === 'request') createdId = created.id
        return { ...c, items }
      },
      set,
      get
    )
    if (createdId) set({ selection: { collectionId, requestId: createdId } })
  },

  duplicateCollection: (collectionId) => {
    const source = get().collections.find((c) => c.id === collectionId)
    if (!source) return
    const copy: Collection = {
      ...source,
      id: newId(),
      name: `${source.name} copy`,
      items: source.items.map((n) => cloneTree(n))
    }
    set({ collections: [...get().collections, copy] })
    void window.relay.saveCollection(copy)
  },

  deleteCollection: (collectionId) => {
    const next = get().collections.filter((c) => c.id !== collectionId)
    set({ collections: next })
    pruneDrafts(set, get)
    if (get().selection?.collectionId === collectionId) {
      const first = next[0]
      const req = first ? firstRequest(first.items) : null
      set({ selection: first && req ? { collectionId: first.id, requestId: req.id } : null })
    }
    void window.relay.deleteCollection(collectionId)
  }
}))

type SetApp = (partial: Partial<AppState>) => void
type GetApp = () => AppState

function cloneTree(node: Parameters<typeof cloneNode>[0]): ReturnType<typeof cloneNode> {
  return cloneNode(node, false)
}

function mutateCollection(collectionId: string, fn: (c: Collection) => Collection, set: SetApp, get: GetApp): void {
  set({ collections: get().collections.map((c) => (c.id === collectionId ? fn(c) : c)) })
  scheduleCollectionSave(collectionId, get)
}

/** Drop drafts whose request no longer exists anywhere. */
function pruneDrafts(set: SetApp, get: GetApp): void {
  const { drafts, collections } = get()
  const alive = new Set(collections.flatMap((c) => collectRequestIds(c.items)))
  const next = Object.fromEntries(Object.entries(drafts).filter(([id]) => alive.has(id)))
  if (Object.keys(next).length !== Object.keys(drafts).length) set({ drafts: next })
}

/** The request as the user sees it: draft if present, else the saved node. */
export function effectiveRequest(state: AppState, collectionId: string, requestId: string): RequestNode | null {
  const draft = state.drafts[requestId]
  if (draft) return draft
  const collection = state.collections.find((c) => c.id === collectionId)
  return collection ? findRequest(collection.items, requestId) : null
}

let envTimer: ReturnType<typeof setTimeout> | null = null
function scheduleEnvSave(get: GetApp): void {
  if (envTimer) clearTimeout(envTimer)
  envTimer = setTimeout(() => {
    envTimer = null
    void window.relay.saveEnvironments(get().environments)
  }, 300)
}

export function useActiveEnv(): Environment | null {
  const workspace = useApp((s) => s.workspace)
  const environments = useApp((s) => s.environments)
  return environments.find((e) => e.id === workspace?.activeEnvironmentId) ?? environments[0] ?? null
}

/** Merged variables for a state snapshot: collection first, env overrides. */
export function mergedVars(state: AppState, collectionId?: string | null): Record<string, string> {
  const colId = collectionId ?? state.selection?.collectionId
  const collection = state.collections.find((c) => c.id === colId)
  const env =
    state.environments.find((e) => e.id === state.workspace?.activeEnvironmentId) ?? state.environments[0] ?? null
  return { ...varsFromEnv(collection?.variables ?? []), ...varsFromEnv(env?.variables ?? []) }
}

/** Reactive merged variables for the current selection (collection + active env). */
export function useMergedVars(): Record<string, string> {
  const selection = useApp((s) => s.selection)
  const collections = useApp((s) => s.collections)
  const workspace = useApp((s) => s.workspace)
  const environments = useApp((s) => s.environments)
  return useMemo(() => {
    const collection = collections.find((c) => c.id === selection?.collectionId)
    const env = environments.find((e) => e.id === workspace?.activeEnvironmentId) ?? environments[0] ?? null
    return { ...varsFromEnv(collection?.variables ?? []), ...varsFromEnv(env?.variables ?? []) }
  }, [selection, collections, workspace, environments])
}

export function useSelectedRequest(): { collection: Collection; request: RequestNode; dirty: boolean } | null {
  const selection = useApp((s) => s.selection)
  const collections = useApp((s) => s.collections)
  const drafts = useApp((s) => s.drafts)
  if (!selection) return null
  const collection = collections.find((c) => c.id === selection.collectionId)
  if (!collection) return null
  const draft = drafts[selection.requestId]
  const request = draft ?? findRequest(collection.items, selection.requestId)
  return request ? { collection, request, dirty: !!draft } : null
}
