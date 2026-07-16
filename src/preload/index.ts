import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type {
  BootPayload,
  Collection,
  Environment,
  ExportResult,
  ImportResult,
  Run,
  RunsQuery,
  RunSummary,
  SendPayload,
  Settings
} from '../shared/types'

const api = {
  getBoot: (): Promise<BootPayload> => ipcRenderer.invoke(IPC.workspaceGet),
  renameWorkspace: (name: string): Promise<void> => ipcRenderer.invoke(IPC.workspaceRename, name),
  saveSettings: (settings: Settings): Promise<void> => ipcRenderer.invoke(IPC.settingsSave, settings),
  saveCollection: (collection: Collection): Promise<void> => ipcRenderer.invoke(IPC.collectionSave, collection),
  saveEnvironments: (envs: Environment[]): Promise<void> => ipcRenderer.invoke(IPC.envSave, envs),
  setActiveEnv: (envId: string): Promise<void> => ipcRenderer.invoke(IPC.envSetActive, envId),
  send: (payload: SendPayload): Promise<Run> => ipcRenderer.invoke(IPC.httpSend, payload),
  cancel: (sendId: string): Promise<void> => ipcRenderer.invoke(IPC.httpCancel, sendId),
  listRuns: (query?: RunsQuery): Promise<RunSummary[]> => ipcRenderer.invoke(IPC.runsList, query ?? {}),
  getRun: (id: string): Promise<Run | null> => ipcRenderer.invoke(IPC.runsGet, id),
  saveExample: (runId: string): Promise<Collection | null> => ipcRenderer.invoke(IPC.runsSaveExample, runId),
  exportBundle: (opts: { includeHistory: boolean }): Promise<ExportResult> =>
    ipcRenderer.invoke(IPC.transferExport, opts),
  importBundle: (): Promise<ImportResult> => ipcRenderer.invoke(IPC.transferImport),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke(IPC.shellOpenExternal, url),
  onRunAppended: (cb: (summary: RunSummary) => void): (() => void) => {
    const listener = (_e: unknown, summary: RunSummary): void => cb(summary)
    ipcRenderer.on(IPC.runsAppended, listener)
    return () => ipcRenderer.removeListener(IPC.runsAppended, listener)
  }
}

export type RelayApi = typeof api

contextBridge.exposeInMainWorld('relay', api)
