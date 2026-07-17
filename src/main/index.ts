import { app, BrowserWindow, Menu, nativeImage, type MenuItemConstructorOptions } from 'electron'
import { existsSync, renameSync } from 'node:fs'
import path from 'node:path'
import { registerIpc } from './ipc/register'
import { initProfiles } from './services/profiles'
import { getSettings } from './services/workspaceStore'
import { chromeBg, createWindow } from './window'
import { IPC } from '@shared/ipc'

app.setName('Rewind')

// The app used to be "Relay" — carry its data directory across the rename.
// userData is pinned explicitly: setName() alone doesn't re-derive it this early.
{
  const appData = app.getPath('appData')
  const rewindDir = path.join(appData, 'Rewind')
  const relayDir = path.join(appData, 'Relay')
  let dataDir = rewindDir
  if (!existsSync(rewindDir) && existsSync(relayDir)) {
    try {
      renameSync(relayDir, rewindDir)
    } catch {
      // Move failed (e.g. old app still running) — keep reading from the old location.
      dataDir = relayDir
    }
  }
  app.setPath('userData', dataDir)
}

/** Default menu, except ⌘W closes the active request tab (Postman-style) instead of the window. */
function buildMenu(): Menu {
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' } as MenuItemConstructorOptions] : []),
    {
      label: 'File',
      submenu: [
        {
          id: 'close-tab',
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: (_item, win) => {
            const target = win instanceof BrowserWindow ? win : BrowserWindow.getAllWindows()[0]
            target?.webContents.send(IPC.tabsCloseActive)
          }
        },
        { label: 'Close Window', accelerator: 'Shift+CmdOrCtrl+W', role: 'close' }
      ]
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ]
  return Menu.buildFromTemplate(template)
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(buildMenu())
    // Packaged builds get the icon from the bundle; dev needs it set explicitly.
    if (!app.isPackaged && app.dock) {
      const icon = nativeImage.createFromPath(path.join(__dirname, '../../resources/icon.png'))
      if (!icon.isEmpty()) app.dock.setIcon(icon)
    }
    await initProfiles()
    const settings = await getSettings()
    registerIpc((next) => {
      for (const win of BrowserWindow.getAllWindows()) win.setBackgroundColor(chromeBg(next.theme))
    })
    await createWindow(settings)

    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) await createWindow(await getSettings())
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
