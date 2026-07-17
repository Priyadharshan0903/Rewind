import path from 'node:path'
import { app } from 'electron'

export function dataDir(): string {
  return app.getPath('userData')
}

export const profilesRoot = (): string => path.join(dataDir(), 'profiles')
export const profilesFile = (): string => path.join(dataDir(), 'profiles.json')

// Active profile directory — set once at startup and on every switch.
let activeDir = ''

export function setActiveProfileDir(dir: string): void {
  activeDir = dir
}

export function profileDir(id: string): string {
  return path.join(profilesRoot(), id)
}

function base(): string {
  if (!activeDir) throw new Error('profile dir not initialized')
  return activeDir
}

export const files = {
  // settings + window state are global (shared across profiles)
  settings: () => path.join(dataDir(), 'settings.json'),
  // everything else is per-profile
  workspace: () => path.join(base(), 'workspace.json'),
  environments: () => path.join(base(), 'environments.json'),
  collectionsDir: () => path.join(base(), 'collections'),
  collection: (id: string) => path.join(base(), 'collections', `${id}.json`),
  runsDir: () => path.join(base(), 'runs')
}
