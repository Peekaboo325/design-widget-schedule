import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import Store from 'electron-store'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 위젯 크기 프리셋
const SIZE_PRESETS = {
  S: { width: 220, height: 180 },
  M: { width: 300, height: 380 },
  L: { width: 360, height: 560 }
}

// 영구 저장: 설정값 (다음 실행 시 복원)
const store = new Store({
  defaults: {
    alwaysOnTop: true,
    opacity: 1.0,
    themeColor: '#7aa2ff',
    size: 'L'
  }
})

let mainWindow = null

function createWindow() {
  const initial = {
    alwaysOnTop: store.get('alwaysOnTop'),
    opacity: store.get('opacity'),
    size: store.get('size')
  }
  const sizePreset = SIZE_PRESETS[initial.size] ?? SIZE_PRESETS.L

  mainWindow = new BrowserWindow({
    width: sizePreset.width,
    height: sizePreset.height,
    minWidth: 200,
    minHeight: 160,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: initial.alwaysOnTop,
    hasShadow: false,
    skipTaskbar: false,
    backgroundColor: '#00000000',
    opacity: initial.opacity,
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

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

// 설정값 초기 동기화
ipcMain.handle('settings:get-all', () => ({
  alwaysOnTop: store.get('alwaysOnTop'),
  opacity: store.get('opacity'),
  themeColor: store.get('themeColor'),
  size: store.get('size')
}))

// 항상 위 고정 토글
ipcMain.handle('window:set-always-on-top', (_event, value) => {
  if (!mainWindow) return false
  const next = Boolean(value)
  mainWindow.setAlwaysOnTop(next)
  store.set('alwaysOnTop', next)
  return mainWindow.isAlwaysOnTop()
})

// 창 투명도 (0.4 ~ 1.0 범위로 제한)
ipcMain.handle('window:set-opacity', (_event, value) => {
  if (!mainWindow) return 1
  const clamped = Math.max(0.4, Math.min(1, Number(value) || 1))
  mainWindow.setOpacity(clamped)
  store.set('opacity', clamped)
  return clamped
})

// 크기 전환 (S/M/L 프리셋)
ipcMain.handle('window:set-size', (_event, sizeKey) => {
  if (!mainWindow) return null
  const preset = SIZE_PRESETS[sizeKey]
  if (!preset) return store.get('size')
  mainWindow.setSize(preset.width, preset.height, true)
  store.set('size', sizeKey)
  return sizeKey
})

// 테마 컬러는 렌더러 측 CSS 변수로만 적용 → 저장만 담당
ipcMain.handle('settings:set-theme-color', (_event, hex) => {
  if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
    return store.get('themeColor')
  }
  store.set('themeColor', hex)
  return hex
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
