import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { ProfileInfo, ProfilesState, Workspace } from '@shared/types'
import { newId } from '@shared/id'
import { readJson, writeJsonAtomic } from './jsonStore'
import { dataDir, profileDir, profilesFile, setActiveProfileDir } from './paths'

interface ProfilesFile {
  activeId: string
  profiles: ProfileInfo[]
}

async function readRegistry(): Promise<ProfilesFile | null> {
  return readJson<ProfilesFile>(profilesFile())
}

async function writeRegistry(reg: ProfilesFile): Promise<void> {
  await writeJsonAtomic(profilesFile(), reg)
}

const exists = (p: string): Promise<boolean> =>
  fs.access(p).then(
    () => true,
    () => false
  )

/**
 * Ensure the profile registry exists and point paths at the active profile.
 * Pre-profile installs get their root-level data moved into the first profile.
 */
export async function initProfiles(): Promise<void> {
  let reg = await readRegistry()
  if (!reg || !reg.profiles.length) {
    const id = newId()
    const dir = profileDir(id)
    await fs.mkdir(dir, { recursive: true })

    // migrate legacy root-level workspace data into the first profile
    for (const entry of ['workspace.json', 'environments.json', 'collections', 'runs']) {
      const from = path.join(dataDir(), entry)
      if (await exists(from)) await fs.rename(from, path.join(dir, entry))
    }
    const ws = await readJson<Workspace>(path.join(dir, 'workspace.json'))
    // fresh install (no migrated workspace): first boot seeds the demo workspace
    const name = ws?.name ?? 'Payments API'

    reg = { activeId: id, profiles: [{ id, name, createdAt: Date.now() }] }
    await writeRegistry(reg)
  }
  if (!reg.profiles.some((p) => p.id === reg!.activeId)) reg.activeId = reg.profiles[0].id
  setActiveProfileDir(profileDir(reg.activeId))
}

export async function listProfiles(): Promise<ProfilesState> {
  const reg = (await readRegistry())!
  return { activeId: reg.activeId, profiles: reg.profiles }
}

/** Create an empty profile (minimal seed) and switch to it. */
export async function createProfile(name: string): Promise<ProfilesState> {
  const reg = (await readRegistry())!
  const id = newId()
  const dir = profileDir(id)
  await fs.mkdir(path.join(dir, 'collections'), { recursive: true })
  await fs.mkdir(path.join(dir, 'runs'), { recursive: true })
  const envId = newId()
  await writeJsonAtomic(path.join(dir, 'workspace.json'), {
    schemaVersion: 1,
    id: newId(),
    name,
    activeEnvironmentId: envId,
    createdAt: Date.now()
  })
  await writeJsonAtomic(path.join(dir, 'environments.json'), [
    {
      id: envId,
      name: 'Default',
      dotColor: 'ok',
      variables: [
        { id: newId(6), key: 'baseUrl', value: 'https://', enabled: true },
        { id: newId(6), key: 'token', value: '', enabled: true }
      ]
    }
  ])
  reg.profiles.push({ id, name, createdAt: Date.now() })
  reg.activeId = id
  await writeRegistry(reg)
  setActiveProfileDir(dir)
  return { activeId: reg.activeId, profiles: reg.profiles }
}

export async function switchProfile(id: string): Promise<ProfilesState> {
  const reg = (await readRegistry())!
  if (reg.profiles.some((p) => p.id === id)) {
    reg.activeId = id
    await writeRegistry(reg)
    setActiveProfileDir(profileDir(id))
  }
  return { activeId: reg.activeId, profiles: reg.profiles }
}

export async function renameProfile(id: string, name: string): Promise<ProfilesState> {
  const reg = (await readRegistry())!
  const profile = reg.profiles.find((p) => p.id === id)
  if (profile && name.trim()) profile.name = name.trim()
  await writeRegistry(reg)
  return { activeId: reg.activeId, profiles: reg.profiles }
}

/** Delete a non-active profile and its data directory. */
export async function deleteProfile(id: string): Promise<ProfilesState> {
  const reg = (await readRegistry())!
  if (id !== reg.activeId && reg.profiles.length > 1) {
    reg.profiles = reg.profiles.filter((p) => p.id !== id)
    await writeRegistry(reg)
    await fs.rm(profileDir(id), { recursive: true, force: true })
  }
  return { activeId: reg.activeId, profiles: reg.profiles }
}
