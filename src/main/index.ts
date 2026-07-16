import { app, BrowserWindow } from 'electron'
import { registerIpc } from './ipc/register'
import { getSettings } from './services/workspaceStore'
import { chromeBg, createWindow } from './window'

app.setName('Relay')

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
