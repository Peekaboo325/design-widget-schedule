import { useCallback, useEffect, useState } from 'react'
import { getThemeColors, hueFromHex, DEFAULT_TO } from '../lib/color.js'

const DEFAULTS = {
  alwaysOnTop: true,
  opacity: 1.0,
  themeColor: DEFAULT_TO, // 핑크 #ff86a2
  size: 'L',
  activeMember: null,
  mode: 'light',
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

  // 드래그 스냅으로 사이즈 변경 시 settings.size 동기화
  useEffect(() => {
    const off = window.widgetAPI?.onSizeChanged?.((key) => {
      setSettings((s) => ({ ...s, size: key }))
    })
    return () => off?.()
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
// 컨셉:
//   - 헤더는 두 색 그라데이션 (사용자 hue로 평행이동)
//   - 본문은 흰 카드 (다크 모드는 어두운 카드로 인버스)
//   - 강조 텍스트(메트릭 카운트, chip 등)는 액센트 컬러
//   - 행은 흰 카드 + 옅은 그림자로 위계 분리
function applyTheme(hex, mode) {
  const root = document.documentElement
  const baseHue = hueFromHex(hex)
  const { from, to, accent } = getThemeColors(baseHue)

  // 헤더 그라데이션 두 색 — 어느 모드든 hue 평행이동 유지
  root.style.setProperty('--widget-header-from', from)
  root.style.setProperty('--widget-header-to', to)
  root.style.setProperty('--widget-accent', accent)
  root.style.setProperty('--widget-accent-strong', accent)
  root.style.setProperty(
    '--widget-accent-soft',
    `color-mix(in oklab, ${accent} 14%, transparent)`
  )
  // 헤더 그라데이션 위 텍스트는 항상 흰
  root.style.setProperty('--widget-on-header', '#ffffff')

  if (mode === 'dark') {
    // 다크: 본문만 어둡게. 헤더 그라데이션은 그대로 (포인트 컬러).
    root.style.setProperty('--widget-card-bg', '#1f1f24')
    root.style.setProperty('--widget-surface', '#2a2a30')
    root.style.setProperty('--widget-on-surface', '#f4f4f6')
    root.style.setProperty('--widget-fg', '#f4f4f6')
    root.style.setProperty('--widget-muted', 'rgba(244, 244, 246, 0.55)')
    root.style.setProperty('--widget-card-border', 'rgba(255, 255, 255, 0.06)')
    root.style.setProperty('--widget-border', 'rgba(255, 255, 255, 0.10)')
    root.style.setProperty('--widget-overlay', 'rgba(255, 255, 255, 0.06)')
    root.style.setProperty('--widget-overlay-strong', 'rgba(255, 255, 255, 0.12)')
    root.style.setProperty('--widget-row-border', 'rgba(255, 255, 255, 0.06)')
    root.style.setProperty('--widget-on-accent', '#1a1a1f')
    return
  }

  // 라이트
  root.style.setProperty('--widget-card-bg', '#ffffff')
  root.style.setProperty('--widget-surface', '#ffffff')
  root.style.setProperty('--widget-on-surface', '#1a1a1f')
  root.style.setProperty('--widget-fg', '#1a1a1f')
  root.style.setProperty('--widget-muted', 'rgba(26, 26, 31, 0.55)')
  root.style.setProperty('--widget-card-border', 'rgba(26, 26, 31, 0.06)')
  root.style.setProperty('--widget-border', 'rgba(26, 26, 31, 0.10)')
  root.style.setProperty('--widget-overlay', 'rgba(26, 26, 31, 0.04)')
  root.style.setProperty('--widget-overlay-strong', 'rgba(26, 26, 31, 0.08)')
  root.style.setProperty('--widget-row-border', 'rgba(26, 26, 31, 0.06)')
  root.style.setProperty('--widget-on-accent', '#ffffff')
}
