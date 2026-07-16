import path from 'node:path'
import { app } from 'electron'

export function dataDir(): string {
  return app.getPath('userData')
}

export const files = {
  workspace: () => path.join(dataDir(), 'workspace.json'),
  settings: () => path.join(dataDir(), 'settings.json'),
  environments: () => path.join(dataDir(), 'environments.json'),
  collectionsDir: () => path.join(dataDir(), 'collections'),
  collection: (id: string) => path.join(dataDir(), 'collections', `${id}.json`),
  runsDir: () => path.join(dataDir(), 'runs')
}
