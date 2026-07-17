import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'
import { registerIpc } from './ipc/register'
import { initProfiles } from './services/profiles'
import { getSettings } from './services/workspaceStore'
import { chromeBg, createWindow } from './window'
import { IPC } from '@shared/ipc'

app.setName('Relay')

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
