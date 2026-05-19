import { contextBridge, ipcRenderer } from 'electron'

// 렌더러에서 안전하게 호출할 수 있는 윈도우 제어 API
// 2단계(공통 설정 UI)에서 토글/투명도 등에 연결 예정
const api = {
  setAlwaysOnTop: (value) => ipcRenderer.invoke('window:set-always-on-top', value),
  getAlwaysOnTop: () => ipcRenderer.invoke('window:get-always-on-top')
}

contextBridge.exposeInMainWorld('widgetAPI', api)
