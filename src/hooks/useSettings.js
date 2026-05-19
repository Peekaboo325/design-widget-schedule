import { useCallback, useEffect, useState } from 'react'

const DEFAULTS = {
  alwaysOnTop: true,
  opacity: 1.0,
  themeColor: '#7aa2ff',
  size: 'L',
  activeMember: null,
  mode: 'dark',
  launchOnBoot: false,
  memberEmoji: {} // { '부수빈': '🐰', ... }
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

  const setThemeColor = useCallback(async (hex) => {
    setSettings((s) => {
      applyTheme(hex, s.mode)
      return s
    })
    const saved = await window.widgetAPI?.setThemeColor(hex)
    setSettings((s) => ({ ...s, themeColor: saved ?? hex }))
  }, [])

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

  const setLaunchOnBoot = useCallback(async (value) => {
    const saved = await window.widgetAPI?.setLaunchOnBoot(value)
    setSettings((s) => ({ ...s, launchOnBoot: saved ?? value }))
  }, [])

  // 멤버별 프로필 이모지
  const setMemberEmoji = useCallback(async (member, emoji) => {
    if (!member) return
    const saved = await window.widgetAPI?.setMemberEmoji(member, emoji)
    setSettings((s) => ({
      ...s,
      memberEmoji: { ...(s.memberEmoji ?? {}), [member]: saved ?? emoji }
    }))
  }, [])

  return {
    settings,
    ready,
    setAlwaysOnTop,
    setOpacity,
    setSize,
    setThemeColor,
    setMode,
    setActiveMember,
    setLaunchOnBoot,
    setMemberEmoji
  }
}

// 테마 컬러 + 모드를 CSS 변수로 적용
// 핵심 컨셉:
//   - 베이스(위젯 바깥 면)는 거의 무채색
//   - 헤더는 액센트 컬러 풀로 채운 컬러 블록
//   - 본문은 흰/옅은 흑 카드로 분리
//   - 액센트 위 텍스트는 자동 흑/백 (WCAG 휘도)
function applyTheme(hex, mode) {
  const root = document.documentElement
  root.style.setProperty('--widget-accent', hex)
  const onAccent = getContrastText(hex)
  root.style.setProperty('--widget-on-accent', onAccent)
  root.style.setProperty('--widget-on-header', onAccent)

  if (mode === 'light') {
    root.style.setProperty('--widget-bg', 'rgba(252, 252, 254, 0.96)')
    root.style.setProperty(
      '--widget-header-bg',
      `color-mix(in oklab, ${hex} 55%, white)`
    )
    root.style.setProperty('--widget-card-bg', '#ffffff')
    root.style.setProperty('--widget-card-border', 'rgba(0, 0, 0, 0.06)')
    root.style.setProperty('--widget-fg', '#0f0f12')
    root.style.setProperty('--widget-muted', 'rgba(20, 20, 24, 0.62)')
    root.style.setProperty('--widget-border', 'rgba(0, 0, 0, 0.08)')
    root.style.setProperty('--widget-overlay', 'rgba(0, 0, 0, 0.04)')
    root.style.setProperty('--widget-overlay-strong', 'rgba(0, 0, 0, 0.08)')
    root.style.setProperty('--widget-row-border', 'rgba(0, 0, 0, 0.06)')
  } else {
    root.style.setProperty('--widget-bg', 'rgba(26, 26, 30, 0.94)')
    root.style.setProperty(
      '--widget-header-bg',
      `color-mix(in oklab, ${hex} 48%, rgba(26, 26, 30, 0.94))`
    )
    root.style.setProperty('--widget-card-bg', '#25252b')
    root.style.setProperty('--widget-card-border', 'rgba(255, 255, 255, 0.06)')
    root.style.setProperty('--widget-fg', '#f4f4f6')
    root.style.setProperty('--widget-muted', 'rgba(244, 244, 246, 0.72)')
    root.style.setProperty('--widget-border', 'rgba(255, 255, 255, 0.08)')
    root.style.setProperty('--widget-overlay', 'rgba(255, 255, 255, 0.06)')
    root.style.setProperty('--widget-overlay-strong', 'rgba(255, 255, 255, 0.12)')
    root.style.setProperty('--widget-row-border', 'rgba(255, 255, 255, 0.05)')
  }
}

function getContrastText(hex) {
  const c = hex.replace('#', '')
  if (c.length !== 6) return '#ffffff'
  const r = parseInt(c.slice(0, 2), 16) / 255
  const g = parseInt(c.slice(2, 4), 16) / 255
  const b = parseInt(c.slice(4, 6), 16) / 255
  const lum = 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b)
  return lum > 0.55 ? '#1c1c20' : '#ffffff'
}

function toLin(v) {
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}
