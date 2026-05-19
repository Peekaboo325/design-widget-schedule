import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let mainWindow = null

// 위젯 창 생성: 프레임 없음 + 투명 + 항상 위 고정 (기본 ON)
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 360,
    height: 560,
    minWidth: 220,
    minHeight: 180,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: false,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // 개발 모드: Vite dev server, 프로덕션: 빌드된 index.html
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

// IPC: 항상 위 고정 토글 (2단계에서 UI 연결)
ipcMain.handle('window:set-always-on-top', (_event, value) => {
  if (!mainWindow) return false
  mainWindow.setAlwaysOnTop(Boolean(value))
  return mainWindow.isAlwaysOnTop()
})

ipcMain.handle('window:get-always-on-top', () => {
  return mainWindow ? mainWindow.isAlwaysOnTop() : false
})

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
