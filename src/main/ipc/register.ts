import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { promises as fs } from 'node:fs'
import { files as filesPaths } from '../services/paths'
import {
  createProfile,
  deleteProfile,
  listProfiles,
  renameProfile,
  switchProfile
} from '../services/profiles'
import { convertToCollection, parseSpec } from '../services/openapiImport'
import { convertPostman } from '../services/postmanImport'
import { IPC } from '@shared/ipc'
import type {
  Collection,
  Environment,
  ExportResult,
  ImportResult,
  OpenApiImportResult,
  PostmanImportResult,
  RelayBundle,
  RequestNode,
  Run,
  RunRequest,
  RunsQuery,
  SendPayload,
  Settings,
  TreeNode
} from '@shared/types'
import { toSummary } from '@shared/types'
import { interpolate, varsFromEnv } from '@shared/interpolate'
import { runCaptures } from '@shared/captures'
import { newId } from '@shared/id'
import { cancelSend, sendHttp } from '../services/httpClient'
import { runScript } from '../services/scriptRunner'
import { appendRun, allRuns, getRun, listRuns } from '../services/runLog'
import { dayKey } from '../services/seed'
import {
  getEnvironments,
  getSettings,
  getWorkspace,
  loadBoot,
  loadCollections,
  replaceAll,
  saveCollection,
  saveEnvironments,
  saveSettings,
  saveWorkspace
} from '../services/workspaceStore'

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, payload)
}

function findRequest(items: TreeNode[], requestId: string): RequestNode | null {
  for (const node of items) {
    if (node.type === 'request' && node.id === requestId) return node
    if (node.type === 'folder') {
      const hit = findRequest(node.children, requestId)
      if (hit) return hit
    }
  }
  return null
}

export function registerIpc(onThemeChange: (settings: Settings) => void): void {
  ipcMain.handle(IPC.workspaceGet, () => loadBoot())

  ipcMain.handle(IPC.workspaceRename, async (_e, name: string) => {
    const ws = await getWorkspace()
    await saveWorkspace({ ...ws, name })
  })

  ipcMain.handle(IPC.settingsSave, async (_e, settings: Settings) => {
    await saveSettings(settings)
    onThemeChange(settings)
  })

  ipcMain.handle(IPC.collectionSave, (_e, collection: Collection) => saveCollection(collection))

  ipcMain.handle(IPC.collectionDelete, (_e, collectionId: string) =>
    fs.rm(filesPaths.collection(collectionId), { force: true })
  )

  ipcMain.handle(IPC.collectionExport, async (e, collectionId: string): Promise<ExportResult> => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const collections = await loadCollections()
    const collection = collections.find((c) => c.id === collectionId)
    if (!collection) return { error: 'Collection not found' }
    const safeName = collection.name.replace(/[^\w.-]+/g, '-').toLowerCase()
    const { canceled, filePath } = await dialog.showSaveDialog(win!, {
      title: 'Export collection',
      defaultPath: `${safeName}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (canceled || !filePath) return { canceled: true }
    try {
      await fs.writeFile(filePath, JSON.stringify(collection, null, 2) + '\n', 'utf8')
      return { path: filePath }
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC.envSave, (_e, envs: Environment[]) => saveEnvironments(envs))

  ipcMain.handle(IPC.envSetActive, async (_e, envId: string) => {
    const ws = await getWorkspace()
    await saveWorkspace({ ...ws, activeEnvironmentId: envId })
  })

  ipcMain.handle(IPC.httpSend, async (_e, payload: SendPayload): Promise<Run> => {
    const [workspace, environments, settings, collections] = await Promise.all([
      getWorkspace(),
      getEnvironments(),
      getSettings(),
      loadCollections()
    ])
    const env = environments.find((x) => x.id === workspace.activeEnvironmentId) ?? environments[0]
    const collection = collections.find((c) => c.id === payload.collectionId)
    // Postman precedence: environment overrides collection variables.
    const vars = {
      ...varsFromEnv(collection?.variables ?? []),
      ...varsFromEnv(env?.variables ?? [])
    }
    const req = payload.request

    let url = interpolate(req.url, vars).text
    const headers: [string, string][] = []
    for (const h of req.headers) {
      if (!h.enabled || !h.key.trim()) continue
      headers.push([interpolate(h.key, vars).text, interpolate(h.value, vars).text])
    }
    const hasAuthHeader = headers.some(([k]) => k.toLowerCase() === 'authorization')
    if (!hasAuthHeader) {
      if (req.auth.mode === 'inherit' && vars.token)
        headers.unshift(['Authorization', `Bearer ${vars.token}`])
      else if (req.auth.mode === 'bearer' && req.auth.token) {
        headers.unshift(['Authorization', `Bearer ${interpolate(req.auth.token, vars).text}`])
      } else if (req.auth.mode === 'basic') {
        const user = interpolate(req.auth.username ?? '', vars).text
        const pass = interpolate(req.auth.password ?? '', vars).text
        if (user || pass)
          headers.unshift([
            'Authorization',
            `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`
          ])
      }
    }
    if (req.auth.mode === 'apikey' && req.auth.key?.trim()) {
      const key = interpolate(req.auth.key, vars).text
      const value = interpolate(req.auth.value ?? '', vars).text
      if (req.auth.addTo === 'query') url += `${url.includes('?') ? '&' : '?'}${key}=${value}`
      else headers.unshift([key, value])
    }

    const hasContentType = (): boolean => headers.some(([k]) => k.toLowerCase() === 'content-type')
    let bodyText = ''
    let bodyForm: RunRequest['bodyForm']
    const fields = (req.body.form ?? []).filter((f) => f.enabled && f.key.trim())
    if (req.body.mode === 'json' || req.body.mode === 'text') {
      bodyText = interpolate(req.body.text, vars).text
    } else if (req.body.mode === 'urlencoded') {
      bodyText = fields
        .map(
          (f) =>
            `${encodeURIComponent(interpolate(f.key, vars).text)}=${encodeURIComponent(interpolate(f.value, vars).text)}`
        )
        .join('&')
      if (!hasContentType()) headers.push(['Content-Type', 'application/x-www-form-urlencoded'])
    } else if (req.body.mode === 'formdata') {
      bodyForm = fields.map((f) => ({
        name: interpolate(f.key, vars).text,
        value: f.type === 'file' ? f.value : interpolate(f.value, vars).text,
        type: f.type
      }))
      // Human-readable stand-in for the run log; the real multipart body is built at send time.
      bodyText = `[multipart/form-data] ${bodyForm.map((f) => (f.type === 'file' ? `${f.name}=@${f.value}` : `${f.name}=${f.value}`)).join('; ')}`
    }

    const resolved: RunRequest = {
      method: req.method,
      url,
      headers,
      bodyText,
      ...(bodyForm ? { bodyForm } : {})
    }
    const result = await sendHttp(payload.sendId, resolved, settings.responseBodyLimitBytes)

    const run: Run = {
      id: newId(),
      ts: Date.now(),
      requestId: req.id,
      requestName: req.name,
      collectionId: payload.collectionId,
      envId: env?.id ?? '',
      envName: env?.name ?? '',
      durationMs: result.durationMs,
      request: resolved,
      response: result.response,
      error: result.error
    }

    if (result.response) {
      // Declarative captures run first; the post-response script can then override.
      const varsToSet: Record<string, string> = {}
      if (req.captures?.length) {
        const captured = runCaptures(req.captures, result.response)
        if (Object.keys(captured).length) run.captured = captured
        Object.assign(varsToSet, captured)
      }
      if (req.scripts.postResponse.trim()) {
        run.script = runScript(req.scripts.postResponse, result.response)
        Object.assign(varsToSet, run.script.varsSet)
      }
      const entries = Object.entries(varsToSet)
      if (entries.length && env) {
        for (const [key, value] of entries) {
          const existing = env.variables.find((v) => v.key === key)
          if (existing) existing.value = value
          else env.variables.push({ id: newId(6), key, value, enabled: true })
        }
        await saveEnvironments(environments)
      }
    }

    await appendRun(run)
    broadcast(IPC.runsAppended, toSummary(run))
    return run
  })

  ipcMain.handle(IPC.httpCancel, (_e, sendId: string) => cancelSend(sendId))

  ipcMain.handle(IPC.runsList, (_e, query: RunsQuery) => listRuns(query))

  ipcMain.handle(IPC.runsGet, (_e, id: string) => getRun(id))

  ipcMain.handle(IPC.runsSaveExample, async (_e, runId: string): Promise<Collection | null> => {
    const run = await getRun(runId)
    if (!run?.response) return null
    const collections = await loadCollections()
    const collection = collections.find((c) => c.id === run.collectionId)
    if (!collection) return null
    const request = findRequest(collection.items, run.requestId)
    if (!request) return null
    request.examples.push({
      id: newId(),
      name: `${run.response.status} · ${new Date(run.ts).toLocaleString()}`,
      status: run.response.status,
      headers: run.response.headers,
      bodyText: run.response.bodyText,
      savedAt: Date.now()
    })
    await saveCollection(collection)
    return collection
  })

  ipcMain.handle(
    IPC.transferExport,
    async (e, opts: { includeHistory: boolean }): Promise<ExportResult> => {
      const win = BrowserWindow.fromWebContents(e.sender)
      const workspace = await getWorkspace()
      const safeName = workspace.name.replace(/[^\w.-]+/g, '-').toLowerCase()
      const { canceled, filePath } = await dialog.showSaveDialog(win!, {
        title: 'Export workspace',
        defaultPath: `${safeName}.rewind`,
        filters: [{ name: 'Rewind bundle', extensions: ['rewind'] }]
      })
      if (canceled || !filePath) return { canceled: true }
      const bundle: RelayBundle = {
        format: 'rewind-bundle',
        version: 1,
        exportedAt: Date.now(),
        workspace,
        collections: await loadCollections(),
        environments: await getEnvironments(),
        ...(opts.includeHistory ? { runs: await allRuns() } : {})
      }
      try {
        await fs.writeFile(filePath, JSON.stringify(bundle, null, 2) + '\n', 'utf8')
        return { path: filePath }
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle(IPC.transferImport, async (e): Promise<ImportResult> => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
      title: 'Import workspace',
      filters: [
        { name: 'Rewind bundle', extensions: ['rewind', 'json'] },
        { name: 'All files', extensions: ['*'] }
      ],
      properties: ['openFile']
    })
    if (canceled || !filePaths[0]) return { canceled: true }
    let bundle: RelayBundle
    try {
      bundle = JSON.parse(await fs.readFile(filePaths[0], 'utf8')) as RelayBundle
    } catch {
      return { error: 'That file is not valid JSON.' }
    }
    if (bundle?.format !== 'rewind-bundle' || bundle.version !== 1) {
      return {
        error: 'Not a Rewind bundle (expected format "rewind-bundle", version 1).'
      }
    }
    if (
      !bundle.workspace ||
      !Array.isArray(bundle.collections) ||
      !Array.isArray(bundle.environments)
    ) {
      return {
        error: 'Bundle is missing workspace, collections or environments.'
      }
    }
    const { response } = await dialog.showMessageBox(win!, {
      type: 'warning',
      buttons: ['Replace', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      message: `Replace this workspace with “${bundle.workspace.name}”?`,
      detail: bundle.runs
        ? `Collections, environments and ${bundle.runs.length} runs of history will replace the current workspace.`
        : 'Collections and environments will replace the current workspace. Run history is untouched.'
    })
    if (response !== 0) return { canceled: true }

    let runsByDay: Record<string, string[]> | undefined
    if (bundle.runs) {
      runsByDay = {}
      for (const run of [...bundle.runs].sort((a, b) => a.ts - b.ts)) {
        ;(runsByDay[dayKey(run.ts)] ??= []).push(JSON.stringify(run))
      }
    }
    await replaceAll({
      workspace: bundle.workspace,
      environments: bundle.environments,
      collections: bundle.collections,
      runsByDay
    })
    return {
      ok: true,
      counts: {
        collections: bundle.collections.length,
        environments: bundle.environments.length,
        runs: bundle.runs?.length ?? 0
      },
      boot: await loadBoot()
    }
  })

  ipcMain.handle(IPC.dialogPickFile, async (e): Promise<string | null> => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
      title: 'Choose file',
      properties: ['openFile']
    })
    return canceled ? null : (filePaths[0] ?? null)
  })

  ipcMain.handle(IPC.shellOpenExternal, (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) return shell.openExternal(url)
    return undefined
  })

  ipcMain.handle(IPC.profilesList, () => listProfiles())

  ipcMain.handle(IPC.profilesCreate, async (_e, name: string) => {
    const state = await createProfile(name.trim() || 'New profile')
    return { ...state, boot: await loadBoot() }
  })

  ipcMain.handle(IPC.profilesSwitch, async (_e, id: string) => {
    const state = await switchProfile(id)
    return { ...state, boot: await loadBoot() }
  })

  ipcMain.handle(IPC.profilesRename, (_e, id: string, name: string) => renameProfile(id, name))

  ipcMain.handle(IPC.profilesDelete, (_e, id: string) => deleteProfile(id))

  ipcMain.handle(IPC.openapiImport, async (e): Promise<OpenApiImportResult> => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
      title: 'Import OpenAPI spec',
      filters: [
        { name: 'OpenAPI', extensions: ['json', 'yaml', 'yml'] },
        { name: 'All files', extensions: ['*'] }
      ],
      properties: ['openFile']
    })
    if (canceled || !filePaths[0]) return { canceled: true }
    try {
      const doc = parseSpec(await fs.readFile(filePaths[0], 'utf8'))
      const { collection, requestCount, folderCount } = convertToCollection(doc)
      await saveCollection(collection)
      return {
        collection,
        counts: { requests: requestCount, folders: folderCount }
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC.postmanImport, async (e): Promise<PostmanImportResult> => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
      title: 'Import from Postman',
      message:
        'Pick Postman exports: collections (v2.x), environments, or a full data dump — several at once is fine.',
      filters: [
        {
          name: 'Postman export',
          extensions: ['json', 'postman_collection', 'postman_environment']
        },
        { name: 'All files', extensions: ['*'] }
      ],
      properties: ['openFile', 'multiSelections']
    })
    if (canceled || !filePaths.length) return { canceled: true }

    const collections: Collection[] = []
    const environments: Environment[] = []
    const warnings: string[] = []
    let requests = 0
    for (const filePath of filePaths) {
      const fileName = filePath.split('/').pop() ?? filePath
      try {
        const result = convertPostman(await fs.readFile(filePath, 'utf8'))
        collections.push(...result.collections)
        environments.push(...result.environments)
        requests += result.requestCount
        warnings.push(...result.warnings)
      } catch (err) {
        warnings.push(`${fileName}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    if (!collections.length && !environments.length) {
      return { error: warnings.join(' ') || 'Nothing importable found.' }
    }

    for (const collection of collections) await saveCollection(collection)
    if (environments.length) {
      await saveEnvironments([...(await getEnvironments()), ...environments])
    }
    return {
      collections,
      environments: await getEnvironments(),
      counts: {
        collections: collections.length,
        environments: environments.length,
        requests
      },
      warnings
    }
  })
}
