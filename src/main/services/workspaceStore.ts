import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { BootPayload, Collection, Environment, Settings, Workspace } from '@shared/types'
import { listFiles, readJson, writeJsonAtomic } from './jsonStore'
import { files } from './paths'
import { buildSeed } from './seed'

const DEFAULT_SETTINGS: Settings = {
  theme: 'light',
  accent: 'indigo',
  historyPanelOpen: true,
  responseBodyLimitBytes: 1024 * 1024,
  requestPaneHeight: 196
}

export async function loadBoot(): Promise<BootPayload> {
  let workspace = await readJson<Workspace>(files.workspace())
  if (!workspace) {
    await seedAll()
    workspace = (await readJson<Workspace>(files.workspace()))!
  }
  const settings = { ...DEFAULT_SETTINGS, ...((await readJson<Partial<Settings>>(files.settings())) ?? {}) }
  const environments = (await readJson<Environment[]>(files.environments())) ?? []
  const collections = await loadCollections()
  return { workspace, settings, environments, collections }
}

export async function loadCollections(): Promise<Collection[]> {
  const paths = await listFiles(files.collectionsDir(), '.json')
  const out: Collection[] = []
  for (const p of paths) {
    const c = await readJson<Collection>(p)
    if (c) out.push(c)
  }
  out.sort((a, b) => a.name.localeCompare(b.name))
  return out
}

export const saveWorkspace = (w: Workspace) => writeJsonAtomic(files.workspace(), w)
export const saveSettings = (s: Settings) => writeJsonAtomic(files.settings(), s)
export const saveEnvironments = (envs: Environment[]) => writeJsonAtomic(files.environments(), envs)
export const saveCollection = (c: Collection) => writeJsonAtomic(files.collection(c.id), c)

export async function getWorkspace(): Promise<Workspace> {
  return (await readJson<Workspace>(files.workspace()))!
}

export async function getEnvironments(): Promise<Environment[]> {
  return (await readJson<Environment[]>(files.environments())) ?? []
}

export async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...((await readJson<Partial<Settings>>(files.settings())) ?? {}) }
}

async function seedAll(): Promise<void> {
  const seed = buildSeed()
  await writeJsonAtomic(files.workspace(), seed.workspace)
  await writeJsonAtomic(files.settings(), DEFAULT_SETTINGS)
  await writeJsonAtomic(files.environments(), seed.environments)
  for (const c of seed.collections) await writeJsonAtomic(files.collection(c.id), c)
  for (const [day, lines] of Object.entries(seed.runFiles)) {
    const file = path.join(files.runsDir(), `${day}.jsonl`)
    await fs.mkdir(files.runsDir(), { recursive: true })
    await fs.writeFile(file, lines.join('\n') + '\n', 'utf8')
  }
}

/** Full replace of on-disk workspace from an imported bundle (runs optional). */
export async function replaceAll(payload: {
  workspace: Workspace
  environments: Environment[]
  collections: Collection[]
  runsByDay?: Record<string, string[]>
}): Promise<void> {
  await writeJsonAtomic(files.workspace(), payload.workspace)
  await writeJsonAtomic(files.environments(), payload.environments)
  await fs.rm(files.collectionsDir(), { recursive: true, force: true })
  for (const c of payload.collections) await writeJsonAtomic(files.collection(c.id), c)
  if (payload.runsByDay) {
    await fs.rm(files.runsDir(), { recursive: true, force: true })
    await fs.mkdir(files.runsDir(), { recursive: true })
    for (const [day, lines] of Object.entries(payload.runsByDay)) {
      await fs.writeFile(path.join(files.runsDir(), `${day}.jsonl`), lines.join('\n') + '\n', 'utf8')
    }
  }
}
