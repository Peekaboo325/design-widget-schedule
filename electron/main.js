import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  Notification,
  Tray,
  nativeImage,
  screen
} from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import Store from 'electron-store'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 트레이/창 아이콘
// dev:   <project>/resources/design-widget-schedule.ico
// 배포:  process.resourcesPath/design-widget-schedule.ico
const ICON_FILENAME = 'design-widget-schedule.ico'
function resolveIconPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, ICON_FILENAME)
  }
  return path.join(__dirname, '../../resources', ICON_FILENAME)
}

// Windows 알림센터 토스트가 정상 동작하도록 AppUserModelId 지정
// (electron-builder packaging 후엔 appId 기반으로 자동 처리되지만 dev에서도 안전하게)
if (process.platform === 'win32') {
  app.setAppUserModelId('com.peekaboo325.design-widget-schedule')
}

// GAS Web App 베이스 URL
// 렌더러는 CSP/CORS 때문에 직접 호출 불가 → main에서 fetch 후 IPC 응답
const GAS_BASE =
  'https://script.google.com/macros/s/AKfycbxaYt08ke5gN38BmuRRp3dWO_tUKoAA76BAPuotgjqOrrDqX_-OfOoyvWhQ4dYmMQY2PA/exec'

const API_TIMEOUT_MS = 12000

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
    size: 'L',
    activeMember: null,
    mode: 'dark',
    launchOnBoot: false
  }
})

// 저장된 자동 실행 설정을 OS에 반영 (앱 부팅마다 동기화)
function applyLaunchOnBoot(enabled) {
  app.setLoginItemSettings({
    openAtLogin: Boolean(enabled),
    // packaging 후의 경로. dev 모드에서는 electron 자체 자동실행 대신 store만 반영
    openAsHidden: false
  })
}

let mainWindow = null
let tray = null
// 트레이의 '종료' 메뉴 클릭으로 quit하는지 식별 (단순 close와 구분)
let isQuitting = false

function createWindow() {
  const initial = {
    alwaysOnTop: store.get('alwaysOnTop'),
    opacity: store.get('opacity'),
    size: store.get('size')
  }
  const sizePreset = SIZE_PRESETS[initial.size] ?? SIZE_PRESETS.L

  const winOpts = {
    width: sizePreset.width,
    height: sizePreset.height,
    minWidth: 200,
    minHeight: 160,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: initial.alwaysOnTop,
    hasShadow: false,
    skipTaskbar: true, // 작업표시줄·Alt+Tab에서 숨김 (트레이 전용)
    backgroundColor: '#00000000',
    opacity: initial.opacity,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  }

  // 아이콘 파일이 있으면 창에도 적용 (frameless라 시각 노출은 적지만 OS 메타데이터로 사용)
  const iconImage = nativeImage.createFromPath(resolveIconPath())
  if (!iconImage.isEmpty()) {
    winOpts.icon = iconImage
  }

  mainWindow = new BrowserWindow(winOpts)

  // 일반 close 시도(Alt+F4 등)는 hide로 대체 — 트레이 '종료'에서만 실제 닫힘
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow.hide()
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

// 위젯의 현재 위치가 어떤 디스플레이의 작업영역에 걸쳐 있는지
function isWindowOnAnyDisplay() {
  if (!mainWindow || mainWindow.isDestroyed()) return false
  const [winW, winH] = mainWindow.getSize()
  const [winX, winY] = mainWindow.getPosition()
  return screen.getAllDisplays().some(
    (d) =>
      winX + winW > d.workArea.x &&
      winX < d.workArea.x + d.workArea.width &&
      winY + winH > d.workArea.y &&
      winY < d.workArea.y + d.workArea.height
  )
}

// 위젯을 화면 안 안전한 위치로 표시
// - destroy 됐으면 재생성
// - 화면 밖이면 마우스 가까운 디스플레이의 우상단으로 보정
// - show + focus
function showWindowSafely() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }
  if (!isWindowOnAnyDisplay()) {
    const cursor = screen.getCursorScreenPoint()
    const display = screen.getDisplayNearestPoint(cursor)
    const work = display.workArea
    const [winW, winH] = mainWindow.getSize()
    mainWindow.setPosition(
      Math.round(work.x + work.width - winW - 24),
      Math.round(work.y + 24)
    )
  }
  if (!mainWindow.isVisible()) mainWindow.show()
  mainWindow.focus()
}

// 위젯 위치 초기화 — 명시적 비상 버튼
function resetWindowPosition() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const work = display.workArea
  const [winW, winH] = mainWindow.getSize()
  mainWindow.setPosition(
    Math.round(work.x + work.width - winW - 24),
    Math.round(work.y + 24)
  )
  if (!mainWindow.isVisible()) mainWindow.show()
  mainWindow.focus()
}

// 트레이 아이콘 + 우클릭 메뉴 + 좌클릭 토글
function createTray() {
  const iconPath = resolveIconPath()
  const image = nativeImage.createFromPath(iconPath)
  if (image.isEmpty()) {
    console.warn(`[tray] icon file not found at ${iconPath} — tray skipped`)
    return
  }

  tray = new Tray(image)
  tray.setToolTip('디자인 위젯')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '위젯 위치 초기화',
      click: () => resetWindowPosition()
    },
    { type: 'separator' },
    {
      label: '새로고침',
      click: () => {
        if (!mainWindow || mainWindow.isDestroyed()) {
          createWindow()
          return
        }
        mainWindow.webContents.send('tray:refresh')
      }
    },
    { type: 'separator' },
    {
      label: '종료',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])
  tray.setContextMenu(contextMenu)

  // 좌클릭 토글
  // - 정상적으로 보이고 화면 안에 있으면 hide
  // - 그 외(숨김/destroy/화면 밖)는 모두 안전하게 표시 + 위치 보정
  tray.on('click', () => {
    if (
      mainWindow &&
      !mainWindow.isDestroyed() &&
      mainWindow.isVisible() &&
      isWindowOnAnyDisplay()
    ) {
      mainWindow.hide()
    } else {
      showWindowSafely()
    }
  })
}

// 설정값 초기 동기화
ipcMain.handle('settings:get-all', () => ({
  alwaysOnTop: store.get('alwaysOnTop'),
  opacity: store.get('opacity'),
  themeColor: store.get('themeColor'),
  size: store.get('size'),
  activeMember: store.get('activeMember'),
  mode: store.get('mode'),
  launchOnBoot: store.get('launchOnBoot')
}))

// 컴퓨터 시작 시 자동 실행
ipcMain.handle('settings:set-launch-on-boot', (_event, value) => {
  const enabled = Boolean(value)
  store.set('launchOnBoot', enabled)
  applyLaunchOnBoot(enabled)
  return enabled
})

// 다크/라이트 모드 저장
ipcMain.handle('settings:set-mode', (_event, mode) => {
  const next = mode === 'light' ? 'light' : 'dark'
  store.set('mode', next)
  return next
})

// OS 알림 표시 (새 스케줄 알림용)
// 클릭 시 위젯을 보여주고 포커스
ipcMain.handle('notify', (_event, payload) => {
  if (!Notification.isSupported()) return false
  const title = String(payload?.title ?? '디자인 위젯')
  const body = String(payload?.body ?? '')
  const iconImage = nativeImage.createFromPath(resolveIconPath())
  const notification = new Notification({
    title,
    body,
    icon: iconImage.isEmpty() ? undefined : iconImage,
    silent: false
  })
  notification.on('click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow()
      return
    }
    if (!mainWindow.isVisible()) mainWindow.show()
    mainWindow.focus()
  })
  notification.show()
  return true
})

// 활성 팀원 저장 (null 허용: 미선택 상태)
ipcMain.handle('settings:set-active-member', (_event, name) => {
  if (name === null || name === undefined) {
    store.set('activeMember', null)
    return null
  }
  if (typeof name !== 'string' || !name.trim()) {
    return store.get('activeMember')
  }
  store.set('activeMember', name)
  return name
})

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
// resizable: false + transparent 조합에서 두 번째 setSize가 무시되는 케이스가 있어
// 매번 resizable을 잠시 풀어준 뒤 새 사이즈를 적용하고 다시 잠금.
ipcMain.handle('window:set-size', (_event, sizeKey) => {
  if (!mainWindow) return null
  const preset = SIZE_PRESETS[sizeKey]
  if (!preset) return store.get('size')

  const wasResizable = mainWindow.isResizable()
  if (!wasResizable) mainWindow.setResizable(true)
  mainWindow.setSize(preset.width, preset.height, true)
  if (!wasResizable) mainWindow.setResizable(false)

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

// 네트워크 에러를 사용자 친화 메시지로 변환
function friendlyNetworkError(err) {
  const msg = String(err?.message ?? err)
  if (
    /fetch failed|ENOTFOUND|ENETUNREACH|EAI_AGAIN|EHOSTUNREACH/i.test(msg) ||
    err?.name === 'AbortError'
  ) {
    return '네트워크 연결을 확인해주세요'
  }
  return msg
}

// GAS API POST — 시트 쓰기 (상태/공유 변경)
// body: { action: 'setStatus'|'setShare', rowIndex, value }
// 응답: { ok: true, data } | { ok: false, error }
ipcMain.handle('api:post', async (_event, body) => {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'invalid body' }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS)
  try {
    const res = await fetch(GAS_BASE, {
      method: 'POST',
      // GAS Apps Script는 application/json POST 시 e.postData.contents에 본문 전달
      // CORS preflight 회피를 위해 text/plain으로 보냄 (main 프로세스라 어차피 CORS 무관하지만 GAS 호환)
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow',
      signal: controller.signal
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.toLowerCase().includes('application/json')) {
      return {
        ok: false,
        error: `JSON 응답이 아님 (${contentType || 'unknown'})`
      }
    }
    const data = await res.json()
    if (data && data.error) return { ok: false, error: String(data.error) }
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: friendlyNetworkError(err) }
  } finally {
    clearTimeout(timer)
  }
})

// GAS API 호출 프록시
// params: { type: 'members' } 또는 { type: 'schedule', member: '이름' }
// 응답: { ok: true, data } | { ok: false, error }
ipcMain.handle('api:get', async (_event, params) => {
  if (!params || typeof params !== 'object') {
    return { ok: false, error: 'invalid params' }
  }
  const search = new URLSearchParams(params).toString()
  const url = `${GAS_BASE}?${search}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal
    })
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` }
    }
    // Apps Script가 인증 페이지로 튕기면 HTML이 옴 → 명확한 에러로 변환
    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.toLowerCase().includes('application/json')) {
      return {
        ok: false,
        error: `JSON 응답이 아님 (${contentType || 'unknown'}). GAS 배포 권한 설정 확인 필요`
      }
    }
    const data = await res.json()
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: friendlyNetworkError(err) }
  } finally {
    clearTimeout(timer)
  }
})

app.whenReady().then(() => {
  // 저장된 자동 실행 설정을 OS에 적용 (앱 시작 때마다 동기화)
  applyLaunchOnBoot(store.get('launchOnBoot'))

  createWindow()
  createTray()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// 트레이가 있는 동안에는 창이 닫혀도 앱 종료하지 않음
// (명시적 '종료' 메뉴 클릭 시에만 app.quit)
app.on('window-all-closed', () => {
  if (isQuitting && process.platform !== 'darwin') {
    app.quit()
  }
})
