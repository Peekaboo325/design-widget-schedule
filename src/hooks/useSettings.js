import { useCallback, useEffect, useState } from 'react'

// 위젯 공통 설정 훅
// 마운트 시 main 프로세스 store에서 값을 가져와 초기화
// 각 setter는 IPC로 main에 반영하고 로컬 state도 동기화
const DEFAULTS = {
  alwaysOnTop: true,
  opacity: 1.0,
  themeColor: '#7aa2ff',
  size: 'L',
  activeMember: null,
  mode: 'dark' // 'dark' | 'light'
}

export default function useSettings() {
  const [settings, setSettings] = useState(DEFAULTS)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function init() {
      const api = window.widgetAPI
      if (!api) {
        setReady(true)
        return
      }
      const initial = await api.getSettings()
      if (cancelled) return
      const merged = { ...DEFAULTS, ...initial }
      setSettings(merged)
      applyTheme(merged.themeColor, merged.mode)
      setReady(true)
    }
    init()
    return () => {
      cancelled = true
    }
  }, [])

  const setAlwaysOnTop = useCallback(async (value) => {
    const next = await window.widgetAPI?.setAlwaysOnTop(value)
    setSettings((s) => ({ ...s, alwaysOnTop: next ?? value }))
  }, [])

  const setOpacity = useCallback(async (value) => {
    const next = await window.widgetAPI?.setOpacity(value)
    setSettings((s) => ({ ...s, opacity: next ?? value }))
  }, [])

  const setSize = useCallback(async (sizeKey) => {
    const next = await window.widgetAPI?.setSize(sizeKey)
    setSettings((s) => ({ ...s, size: next ?? sizeKey }))
  }, [])

  // 테마 컬러 변경 (현재 모드와 함께 즉시 반영)
  const setThemeColor = useCallback(async (hex) => {
    setSettings((s) => {
      applyTheme(hex, s.mode)
      return s
    })
    const saved = await window.widgetAPI?.setThemeColor(hex)
    setSettings((s) => ({ ...s, themeColor: saved ?? hex }))
  }, [])

  // 다크/라이트 모드
  const setMode = useCallback(async (mode) => {
    setSettings((s) => {
      applyTheme(s.themeColor, mode)
      return s
    })
    const saved = await window.widgetAPI?.setMode(mode)
    setSettings((s) => ({ ...s, mode: saved ?? mode }))
  }, [])

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
    setMode,
    setActiveMember
  }
}

// 테마 컬러 + 모드를 CSS 변수로 적용
// 다크: 어두운 베이스 + 액센트 진한 틴트
// 라이트: 거의 순백 베이스 + 액센트 옅은 틴트 (산뜻함)
function applyTheme(hex, mode) {
  const root = document.documentElement
  root.style.setProperty('--widget-accent', hex)
  // 액센트 위 텍스트의 대비색 (흰색 또는 검정 자동)
  root.style.setProperty('--widget-on-accent', getContrastText(hex))

  if (mode === 'light') {
    root.style.setProperty(
      '--widget-bg',
      `color-mix(in oklab, ${hex} 8%, rgba(252, 252, 254, 0.96))`
    )
    root.style.setProperty(
      '--widget-header-bg',
      `color-mix(in oklab, ${hex} 18%, rgba(252, 252, 254, 0.96))`
    )
    root.style.setProperty('--widget-fg', '#0f0f12')
    root.style.setProperty('--widget-muted', 'rgba(20, 20, 24, 0.55)')
    root.style.setProperty('--widget-border', 'rgba(0, 0, 0, 0.08)')
    root.style.setProperty('--widget-overlay', 'rgba(255, 255, 255, 0.45)')
    root.style.setProperty('--widget-overlay-strong', 'rgba(0, 0, 0, 0.06)')
    root.style.setProperty('--widget-row-border', 'rgba(0, 0, 0, 0.06)')
  } else {
    root.style.setProperty(
      '--widget-bg',
      `color-mix(in oklab, ${hex} 20%, rgba(28, 28, 32, 0.92))`
    )
    root.style.setProperty(
      '--widget-header-bg',
      `color-mix(in oklab, ${hex} 28%, rgba(28, 28, 32, 0.92))`
    )
    root.style.setProperty('--widget-fg', '#f4f4f6')
    root.style.setProperty('--widget-muted', 'rgba(244, 244, 246, 0.6)')
    root.style.setProperty('--widget-border', 'rgba(255, 255, 255, 0.08)')
    root.style.setProperty('--widget-overlay', 'rgba(0, 0, 0, 0.12)')
    root.style.setProperty('--widget-overlay-strong', 'rgba(255, 255, 255, 0.08)')
    root.style.setProperty('--widget-row-border', 'rgba(255, 255, 255, 0.04)')
  }
}

// WCAG 상대 휘도 기반으로 액센트 컬러 위에 올릴 텍스트 색 결정
function getContrastText(hex) {
  const c = hex.replace('#', '')
  if (c.length !== 6) return '#ffffff'
  const r = parseInt(c.slice(0, 2), 16) / 255
  const g = parseInt(c.slice(2, 4), 16) / 255
  const b = parseInt(c.slice(4, 6), 16) / 255
  const lum = 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b)
  // 0.55 기준: 노랑·연두·옅은컬러는 검정, 진한블루·퍼플·핑크는 흰색
  return lum > 0.55 ? '#1c1c20' : '#ffffff'
}

function toLin(v) {
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}
