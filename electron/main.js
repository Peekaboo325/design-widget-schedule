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
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import Store from 'electron-store'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 패키지 환경 크래시·hang 진단용 — 홈 폴더에 자동 로그
// 단계별로 stamp 호출하여 어디서 멈추는지 추적
const DEBUG_LOG = path.join(os.homedir(), 'widget-debug.log')
function stamp(label) {
  try {
    fs.appendFileSync(
      DEBUG_LOG,
      `[${new Date().toISOString()}] ${label}\n`
    )
  } catch (_) {}
}
function logCrash(prefix, err) {
  try {
    const line = `[${new Date().toISOString()}] ${prefix}\n${err?.stack || err}\n\n`
    fs.appendFileSync(DEBUG_LOG, line)
  } catch (_) {}
}
process.on('uncaughtException', (err) => logCrash('uncaughtException', err))
process.on('unhandledRejection', (err) => logCrash('unhandledRejection', err))

stamp('=== main process start ===')
stamp(`isPackaged=${app.isPackaged} platform=${process.platform} version=${process.version}`)
stamp(`__dirname=${__dirname}`)
stamp(`resourcesPath=${process.resourcesPath}`)

// macOS Sequoia(15.x)에서 unsigned 앱의 ready 이벤트 hang 회피
// keychain/GPU 권한 dialog 화면 밖 대기로 app.whenReady가 resolve 안 되는 케이스가 있음
// Windows는 GPU 가속 살려야 폰트·렌더링 품질 ↑
try {
  if (process.platform === 'darwin') {
    app.commandLine.appendSwitch('use-mock-keychain')
    app.commandLine.appendSwitch('disable-gpu-sandbox')
    app.disableHardwareAcceleration()
  }
  // Windows의 폰트 hinting을 꺼서 맥처럼 부드러운 렌더링 (sharp픽셀 톤 → smooth 곡선)
  app.commandLine.appendSwitch('font-render-hinting', 'none')
  stamp('command line switches applied')
} catch (err) {
  logCrash('command line switch failed', err)
}

// 트레이/창 아이콘 — OS별로 다른 파일
// Windows: .ico (작업표시줄 자연스러움)
// macOS / Linux: .png (macOS는 .ico 인식 못함)
// dev:   <project>/resources/<file>
// 배포:  process.resourcesPath/<file>
function iconFilename() {
  return process.platform === 'win32'
    ? 'design-widget-schedule.ico'
    : 'design-widget-schedule.png'
}

function resolveIconPath() {
  const filename = iconFilename()
  if (app.isPackaged) {
    // electron-builder.yml의 extraResources(to: resources)로 복사된 위치
    return path.join(process.resourcesPath, 'resources', filename)
  }
  return path.join(__dirname, '../../resources', filename)
}

// Windows 알림센터 토스트가 정상 동작하도록 AppUserModelId 지정
// (electron-builder packaging 후엔 appId 기반으로 자동 처리되지만 dev에서도 안전하게)
if (process.platform === 'win32') {
  app.setAppUserModelId('com.peekaboo325.design-widget-schedule')
}

// GAS Web App 베이스 URL
// 렌더러는 CSP/CORS 때문에 직접 호출 불가 → main에서 fetch 후 IPC 응답
const GAS_BASE =
  'https://script.google.com/macros/s/AKfycbyOWwWA9m401Zzy7zH1zds3XXzseyM-8EpeDvhw4EA2lQuRIC0BDidwG_i_1AGBvzPbgA/exec'

const API_TIMEOUT_MS = 12000

// 위젯 크기 프리셋 — S(카운트만) / L(전체) 두 단계.
// 드래그 리사이즈는 제공하지 않고 헤더 사이즈 토글 버튼으로만 전환
const SIZE_PRESETS = {
  S: { width: 240, height: 220 },
  L: { width: 360, height: 560 }
}

// 마이그레이션: 기존에 size: 'M' 저장된 사용자는 'L'로 정정
function migrateSize(stored) {
  if (stored === 'M') return 'L'
  if (SIZE_PRESETS[stored]) return stored
  return 'L'
}

// 영구 저장: 설정값 + 데이터 캐시 (다음 실행 시 즉시 복원)
stamp('about to new Store')
const store = new Store({
  defaults: {
    alwaysOnTop: true,
    opacity: 1.0,
    themeColor: '#ff86a2',
    size: 'L',
    activeMember: null,
    launchOnBoot: false,
    notificationsEnabled: true,
    memberEmoji: {}, // { '부수빈': '🐰', ... }
    // 첫 실행 시 깜빡임 방지용 캐시 — fetch 동안 stale 데이터로 즉시 렌더
    cachedMembers: [],
    cachedScheduleByMember: {}, // { '부수빈': { schedule, pending, summary, lastUpdated } }
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
  stamp('createWindow() called')
  const migratedSize = migrateSize(store.get('size'))
  if (migratedSize !== store.get('size')) store.set('size', migratedSize)
  const initial = {
    alwaysOnTop: store.get('alwaysOnTop'),
    opacity: store.get('opacity'),
    size: migratedSize
  }
  const sizePreset = SIZE_PRESETS[initial.size] ?? SIZE_PRESETS.L

  const winOpts = {
    width: sizePreset.width,
    height: sizePreset.height,
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

  stamp('about to new BrowserWindow')
  mainWindow = new BrowserWindow(winOpts)
  stamp('BrowserWindow created')

  // 일반 close 시도(Alt+F4 등)는 hide로 대체 — 트레이 '종료'에서만 실제 닫힘
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.once('ready-to-show', () => {
    stamp('ready-to-show — calling show()')
    mainWindow.show()
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    stamp(`loadURL dev=${process.env['ELECTRON_RENDERER_URL']}`)
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    const indexPath = path.join(__dirname, '../renderer/index.html')
    stamp(`loadFile=${indexPath} exists=${fs.existsSync(indexPath)}`)
    mainWindow.loadFile(indexPath)
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

  // macOS 메뉴바는 작은 아이콘이 자연스러움. 22×22로 리사이즈.
  // Windows/Linux는 원본 그대로 (OS가 알아서 처리)
  const trayImage =
    process.platform === 'darwin'
      ? image.resize({ width: 22, height: 22 })
      : image

  tray = new Tray(trayImage)
  tray.setToolTip('디자인 위젯')

  const contextMenu = Menu.buildFromTemplate([
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
    {
      label: '위치 초기화',
      click: () => resetWindowPosition()
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
  launchOnBoot: store.get('launchOnBoot'),
  notificationsEnabled: store.get('notificationsEnabled') ?? true,
  memberEmoji: store.get('memberEmoji') ?? {}
}))

// 첫 실행 시 깜빡임 방지용 캐시 read/write
ipcMain.handle('cache:get-members', () => store.get('cachedMembers') ?? [])
ipcMain.handle('cache:set-members', (_event, members) => {
  if (!Array.isArray(members)) return
  store.set('cachedMembers', members)
})
ipcMain.handle('cache:get-schedule', (_event, member) => {
  if (typeof member !== 'string' || !member) return null
  const all = store.get('cachedScheduleByMember') ?? {}
  return all[member] ?? null
})
ipcMain.handle('cache:set-schedule', (_event, member, data) => {
  if (typeof member !== 'string' || !member || !data) return
  const all = store.get('cachedScheduleByMember') ?? {}
  all[member] = data
  store.set('cachedScheduleByMember', all)
})

// 멤버별 '본 키' 영구 저장 — 위젯 종료 사이에 추가된 새 일정 감지용
// 위젯이 꺼져있는 동안 시트에 새 작업이 추가되면, 재실행 시 store에서
// 이전 seen 집합을 복원 → 새 키들은 NEW로 잡힘
ipcMain.handle('cache:get-seen', (_event, member) => {
  if (typeof member !== 'string' || !member) return null
  const all = store.get('seenKeysByMember') ?? {}
  return Array.isArray(all[member]) ? all[member] : null
})
ipcMain.handle('cache:set-seen', (_event, member, keys) => {
  if (typeof member !== 'string' || !member || !Array.isArray(keys)) return
  const all = store.get('seenKeysByMember') ?? {}
  all[member] = keys
  store.set('seenKeysByMember', all)
})

// 멤버별 프로필 이모지 저장
ipcMain.handle('settings:set-member-emoji', (_event, member, emoji) => {
  if (typeof member !== 'string' || !member) return null
  const map = { ...(store.get('memberEmoji') ?? {}) }
  const trimmed = typeof emoji === 'string' ? emoji.trim() : ''
  if (!trimmed) {
    delete map[member]
  } else {
    // 이모지 또는 1~2자만 허용
    map[member] = Array.from(trimmed).slice(0, 2).join('')
  }
  store.set('memberEmoji', map)
  return map[member] ?? null
})

// 컴퓨터 시작 시 자동 실행
ipcMain.handle('settings:set-launch-on-boot', (_event, value) => {
  const enabled = Boolean(value)
  store.set('launchOnBoot', enabled)
  applyLaunchOnBoot(enabled)
  return enabled
})

// 새 스케줄 OS 알림 on/off (회의 중 거슬릴 때 등)
ipcMain.handle('settings:set-notifications-enabled', (_event, value) => {
  const enabled = Boolean(value)
  store.set('notificationsEnabled', enabled)
  return enabled
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

// 크기 전환 (S/L 프리셋) — 사용자가 헤더 사이즈 토글로 호출
// resizable:false 라 일시적으로 풀어준 뒤 setSize → 다시 락
ipcMain.handle('window:set-size', (_event, sizeKey) => {
  if (!mainWindow) return null
  const preset = SIZE_PRESETS[sizeKey]
  if (!preset) return store.get('size')
  mainWindow.setResizable(true)
  mainWindow.setSize(preset.width, preset.height, true)
  mainWindow.setResizable(false)
  store.set('size', sizeKey)
  return sizeKey
})

// 시스템 이모지 패널 호출 (직접 입력 input focus 시)
// - macOS: app.showEmojiPanel() 네이티브 API
// - Windows: PowerShell + Win32 keybd_event로 Win+. 단축키 시뮬레이션
//           (추가 deps 없이 OS 이모지 패널 호출)
// - Linux: 미지원 (조용히 false)
ipcMain.handle('show-emoji-panel', () => {
  if (process.platform === 'darwin' && typeof app.showEmojiPanel === 'function') {
    app.showEmojiPanel()
    return true
  }
  if (process.platform === 'win32') {
    // 위젯 input이 포커스를 유지하도록 강제. 키 이벤트는 foreground window가 받음
    mainWindow?.focus()
    const ps = [
      'Add-Type -TypeDefinition \'using System.Runtime.InteropServices; public class K { [DllImport("user32.dll")] public static extern void keybd_event(byte v, byte s, uint f, uint e); }\'',
      '[K]::keybd_event(0x5B,0,0,0)', // LWin down
      '[K]::keybd_event(0xBE,0,0,0)', // OEM_PERIOD down
      'Start-Sleep -Milliseconds 30',
      '[K]::keybd_event(0xBE,0,2,0)', // up
      '[K]::keybd_event(0x5B,0,2,0)'  // up
    ].join('; ')
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-Command', ps],
      { windowsHide: true },
      (err) => {
        if (err) console.warn('[emoji-panel] PowerShell 실행 실패:', err.message)
      }
    )
    return true
  }
  return false
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
// 허용된 POST 액션 — 렌더러가 임의 action 보내 GAS에 도달하지 못하게 main에서 차단.
// 사내 도구라 위협은 낮지만 견고함 ↑
const ALLOWED_POST_ACTIONS = new Set(['setStatus', 'setShare', 'setBackup'])

ipcMain.handle('api:post', async (_event, body) => {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'invalid body', code: 'INVALID' }
  }
  if (!ALLOWED_POST_ACTIONS.has(body.action)) {
    return { ok: false, error: 'invalid action', code: 'INVALID' }
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
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, code: 'HTTP' }
    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.toLowerCase().includes('application/json')) {
      return {
        ok: false,
        error: `JSON 응답이 아님 (${contentType || 'unknown'})`,
        code: 'NOT_JSON'
      }
    }
    const data = await res.json()
    if (data && data.error) {
      return {
        ok: false,
        error: String(data.error),
        code: data.code || 'UNKNOWN'
      }
    }
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: friendlyNetworkError(err), code: 'NETWORK' }
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
      return { ok: false, error: `HTTP ${res.status}`, code: 'HTTP' }
    }
    // Apps Script가 인증 페이지로 튕기면 HTML이 옴 → 명확한 에러로 변환
    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.toLowerCase().includes('application/json')) {
      return {
        ok: false,
        error: `JSON 응답이 아님 (${contentType || 'unknown'}). GAS 배포 권한 설정 확인 필요`,
        code: 'NOT_JSON'
      }
    }
    const data = await res.json()
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: friendlyNetworkError(err), code: 'NETWORK' }
  } finally {
    clearTimeout(timer)
  }
})

// 단일 인스턴스 락 — 두 번째 실행 시도 시 기존 위젯에 focus만 보내고 종료
// 트레이 누적 / 중복 실행 방지
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // 두 번째 인스턴스가 떴다 = 기존 위젯에 focus
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      showWindowSafely()
    } else {
      createWindow()
    }
  })

  stamp('about to app.whenReady')
  app.whenReady().then(() => {
    stamp('app.whenReady resolved')
    // 저장된 자동 실행 설정을 OS에 적용 (앱 시작 때마다 동기화)
    applyLaunchOnBoot(store.get('launchOnBoot'))
    stamp('applyLaunchOnBoot done')

    createWindow()
    stamp('createWindow returned')
    createTray()
    stamp('createTray returned')

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
    stamp('all init done')
  })
}

// 트레이가 있는 동안에는 창이 닫혀도 앱 종료하지 않음
// (명시적 '종료' 메뉴 클릭 시에만 app.quit)
app.on('window-all-closed', () => {
  if (isQuitting && process.platform !== 'darwin') {
    app.quit()
  }
})
