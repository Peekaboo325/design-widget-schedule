import { useCallback, useEffect, useState } from 'react'
import {
  getThemeColors,
  getBlackThemeColors,
  hueFromHex,
  isBlackTheme,
  DEFAULT_TO
} from '../lib/color.js'

const DEFAULTS = {
  alwaysOnTop: true,
  opacity: 1.0,
  themeColor: DEFAULT_TO, // 핑크 #ff86a2
  size: 'L',
  activeMember: null,
  launchOnBoot: false,
  notificationsEnabled: true,
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
      applyTheme(merged.themeColor)
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
    applyTheme(hex)
    const saved = await window.widgetAPI?.setThemeColor(hex)
    setSettings((s) => ({ ...s, themeColor: saved ?? hex }))
  }, [])

  const setActiveMember = useCallback(async (name) => {
    const saved = await window.widgetAPI?.setActiveMember(name)
    setSettings((s) => ({ ...s, activeMember: saved ?? name }))
  }, [])

  const setLaunchOnBoot = useCallback(async (value) => {
    const saved = await window.widgetAPI?.setLaunchOnBoot(value)
    setSettings((s) => ({ ...s, launchOnBoot: saved ?? value }))
  }, [])

  const setNotificationsEnabled = useCallback(async (value) => {
    const saved = await window.widgetAPI?.setNotificationsEnabled(value)
    setSettings((s) => ({ ...s, notificationsEnabled: saved ?? value }))
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
    setActiveMember,
    setLaunchOnBoot,
    setNotificationsEnabled,
    setMemberEmoji
  }
}

// 테마 컬러를 CSS 변수로 적용 (라이트 단일 모드)
//   - 헤더는 두 색 그라데이션 (사용자 hue로 평행이동)
//   - 본문은 흰 카드
//   - 강조 텍스트는 액센트(strong) 컬러, hue별 perceptual L 보정으로 가독성 일정
function applyTheme(hex) {
  const root = document.documentElement
  // 블랙 테마는 hue 시스템 밖 — 정확 일치 시 별도 컬러 셋 사용
  const baseHue = hueFromHex(hex)
  const { from, to, onHeader, accent, accentStrong, accentSoft } = isBlackTheme(
    hex
  )
    ? getBlackThemeColors()
    : getThemeColors(baseHue)

  root.style.setProperty('--widget-header-from', from)
  root.style.setProperty('--widget-header-to', to)
  // 헤더 위 텍스트는 to의 luminance로 흑/백 자동 결정
  root.style.setProperty('--widget-on-header', onHeader)
  root.style.setProperty('--widget-accent', accent)
  root.style.setProperty('--widget-accent-strong', accentStrong)
  root.style.setProperty('--widget-accent-soft', accentSoft)

  // 헤더 텍스트 weight — 흰 글자는 시각적으로 굵어 보여서 1단계 풀기
  // Windows ClearType은 야위게 보여서 +1단계 보정
  const isWin = window.widgetAPI?.platform === 'win32'
  const isWhiteText = onHeader === '#ffffff'
  if (isWhiteText) {
    root.style.setProperty('--header-date-weight', isWin ? '750' : '700')
    root.style.setProperty('--header-meta-weight', isWin ? '500' : '400')
  } else {
    root.style.setProperty('--header-date-weight', isWin ? '850' : '800')
    root.style.setProperty('--header-meta-weight', isWin ? '600' : '500')
  }

  // 라이트 단일 모드
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
