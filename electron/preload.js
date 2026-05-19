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

  // GAS API 프록시 호출 (CSP/CORS 우회용)
  apiGet: (params) => ipcRenderer.invoke('api:get', params)
}

contextBridge.exposeInMainWorld('widgetAPI', api)
