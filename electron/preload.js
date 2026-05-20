import { contextBridge, ipcRenderer } from 'electron'

// 렌더러에서 사용할 위젯 제어 API
// 모든 호출은 main 프로세스의 ipcMain.handle 핸들러로 라우팅
const api = {
  // 설정 일괄 조회 (초기 마운트 시 사용)
  getSettings: () => ipcRenderer.invoke('settings:get-all'),

  // 항상 위 고정
  setAlwaysOnTop: (value) => ipcRenderer.invoke('window:set-always-on-top', value),

  // 창 투명도 (0.4 ~ 1.0)
  setOpacity: (value) => ipcRenderer.invoke('window:set-opacity', value),

  // 크기 전환 ('S' | 'M' | 'L')
  setSize: (sizeKey) => ipcRenderer.invoke('window:set-size', sizeKey),

  // 테마 컬러 저장 (적용은 렌더러에서 CSS 변수로)
  setThemeColor: (hex) => ipcRenderer.invoke('settings:set-theme-color', hex),

  // 활성 팀원 저장
  setActiveMember: (name) => ipcRenderer.invoke('settings:set-active-member', name),

  // 다크/라이트 모드
  setMode: (mode) => ipcRenderer.invoke('settings:set-mode', mode),

  // 컴퓨터 시작 시 자동 실행
  setLaunchOnBoot: (value) =>
    ipcRenderer.invoke('settings:set-launch-on-boot', value),

  // 멤버별 프로필 이모지
  setMemberEmoji: (member, emoji) =>
    ipcRenderer.invoke('settings:set-member-emoji', member, emoji),

  // macOS 시스템 이모지 패널 호출 (직접 입력 input focus 시)
  showEmojiPanel: () => ipcRenderer.invoke('show-emoji-panel'),

  // GAS API 프록시 호출 (CSP/CORS 우회용)
  apiGet: (params) => ipcRenderer.invoke('api:get', params),
  apiPost: (body) => ipcRenderer.invoke('api:post', body),

  // OS 알림 (새 스케줄)
  notify: (payload) => ipcRenderer.invoke('notify', payload),

  // 첫 실행 시 깜빡임 방지용 캐시 (멤버 목록 + 활성 멤버 스케줄)
  getCachedMembers: () => ipcRenderer.invoke('cache:get-members'),
  setCachedMembers: (members) => ipcRenderer.invoke('cache:set-members', members),
  getCachedSchedule: (member) => ipcRenderer.invoke('cache:get-schedule', member),
  setCachedSchedule: (member, data) =>
    ipcRenderer.invoke('cache:set-schedule', member, data),

  // 트레이 새로고침 메뉴 → 렌더러 콜백
  onTrayRefresh: (cb) => {
    const handler = () => cb()
    ipcRenderer.on('tray:refresh', handler)
    // 정리 함수 반환
    return () => ipcRenderer.removeListener('tray:refresh', handler)
  }
}

contextBridge.exposeInMainWorld('widgetAPI', api)
