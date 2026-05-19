import { useCallback, useEffect, useState } from 'react'

// 위젯 공통 설정 훅
// 마운트 시 main 프로세스 store에서 값을 가져와 초기화
// 각 setter는 IPC로 main에 반영하고 로컬 state도 동기화
const DEFAULTS = {
  alwaysOnTop: true,
  opacity: 1.0,
  themeColor: '#7aa2ff',
  size: 'L',
  activeMember: null
}

export default function useSettings() {
  const [settings, setSettings] = useState(DEFAULTS)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function init() {
      const api = window.widgetAPI
      if (!api) {
        // preload 미주입 환경(예: 일반 브라우저 dev) 대비
        setReady(true)
        return
      }
      const initial = await api.getSettings()
      if (cancelled) return
      setSettings({ ...DEFAULTS, ...initial })
      applyThemeColor(initial.themeColor ?? DEFAULTS.themeColor)
      setReady(true)
    }
    init()
    return () => {
      cancelled = true
    }
  }, [])

  // 항상 위 고정 토글
  const setAlwaysOnTop = useCallback(async (value) => {
    const next = await window.widgetAPI?.setAlwaysOnTop(value)
    setSettings((s) => ({ ...s, alwaysOnTop: next ?? value }))
  }, [])

  // 투명도 (0.4 ~ 1.0)
  const setOpacity = useCallback(async (value) => {
    const next = await window.widgetAPI?.setOpacity(value)
    setSettings((s) => ({ ...s, opacity: next ?? value }))
  }, [])

  // 크기 전환
  const setSize = useCallback(async (sizeKey) => {
    const next = await window.widgetAPI?.setSize(sizeKey)
    setSettings((s) => ({ ...s, size: next ?? sizeKey }))
  }, [])

  // 테마 컬러 (CSS 변수 즉시 반영 + main에 저장 요청)
  const setThemeColor = useCallback(async (hex) => {
    applyThemeColor(hex)
    const saved = await window.widgetAPI?.setThemeColor(hex)
    setSettings((s) => ({ ...s, themeColor: saved ?? hex }))
  }, [])

  // 활성 팀원 선택 (null이면 미선택 상태로 되돌림)
  const setActiveMember = useCallback(async (name) => {
    const saved = await window.widgetAPI?.setActiveMember(name)
    setSettings((s) => ({ ...s, activeMember: saved ?? name }))
  }, [])

  return {
    settings,
    ready,
    setAlwaysOnTop,
    setOpacity,
    setSize,
    setThemeColor,
    setActiveMember
  }
}

// 테마 컬러를 CSS 변수로 적용
// --widget-accent: 포인트 색
// --widget-bg: 다크 베이스에 액센트를 진하게 섞은 틴트 배경
// --widget-header-bg: 헤더 영역 강조용 더 진한 틴트
function applyThemeColor(hex) {
  const root = document.documentElement
  root.style.setProperty('--widget-accent', hex)
  root.style.setProperty(
    '--widget-bg',
    `color-mix(in oklab, ${hex} 20%, rgba(28, 28, 32, 0.92))`
  )
  root.style.setProperty(
    '--widget-header-bg',
    `color-mix(in oklab, ${hex} 28%, rgba(28, 28, 32, 0.92))`
  )
}
