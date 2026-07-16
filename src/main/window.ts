import { BrowserWindow, shell } from 'electron'
import path from 'node:path'
import type { Settings } from '@shared/types'
import { readJson, writeJsonAtomic } from './services/jsonStore'
import { dataDir } from './services/paths'

const CHROME_BG = { light: '#eceae7', dark: '#1c1c1f' } as const

export function chromeBg(theme: Settings['theme']): string {
  return CHROME_BG[theme] ?? CHROME_BG.light
}

interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
}

const stateFile = (): string => path.join(dataDir(), 'window-state.json')

export async function createWindow(settings: Settings): Promise<BrowserWindow> {
  const state = (await readJson<WindowState>(stateFile())) ?? { width: 1280, height: 800 }
  const win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 1020,
    minHeight: 640,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 15 },
    backgroundColor: chromeBg(settings.theme),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false
    }
  })

  win.on('ready-to-show', () => win.show())

  win.on('close', () => {
    const [width, height] = win.getSize()
    const [x, y] = win.getPosition()
    void writeJsonAtomic(stateFile(), { width, height, x, y })
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e) => e.preventDefault())

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
  return win
}
