import { useCallback, useEffect, useState } from 'react'

const DEFAULTS = {
  alwaysOnTop: true,
  opacity: 1.0,
  themeColor: '#d9ff66', // 라임 그린 (hue 75, S60 B100)
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
// 새 컨셉 (풀컬러):
//   - 라이트 모드: 위젯 전체가 한 액센트 컬러(S60 B100)로 채워진 단일 카드
//                  모든 텍스트는 검정. 위계는 굵기/크기/opacity로
//                  흰 알약(surface) = 강조 컴포넌트(아바타·아이콘·chip 진행·팝오버)
//                  검정 알약(CTA) = 가장 강한 액션 (활성 설정 등)
//   - 다크 모드: hue 무시 + 단색 블랙 반전 (사용자 결정)
//                위젯 = 다크 단색, 텍스트 = 흰, 흰 알약 자리는 elevated 다크
function applyTheme(hex, mode) {
  const root = document.documentElement

  if (mode === 'dark') {
    // 다크 = 블랙 반전. hue 사용 안 함 (단색).
    const accent = '#1a1a1c' // 위젯 베이스
    const surface = '#2c2c32' // elevated 알약 (라이트의 흰 알약 자리)
    const fg = '#f4f4f6'
    root.style.setProperty('--widget-bg', accent)
    root.style.setProperty('--widget-header-bg', accent)
    root.style.setProperty('--widget-card-bg', accent)
    root.style.setProperty('--widget-accent', hex) // dot 등 보조용으로만 hue 유지
    root.style.setProperty('--widget-fg', fg)
    root.style.setProperty('--widget-muted', 'rgba(244, 244, 246, 0.62)')
    root.style.setProperty('--widget-on-header', fg)
    root.style.setProperty('--widget-on-accent', fg)
    root.style.setProperty('--widget-surface', surface)
    root.style.setProperty('--widget-on-surface', fg)
    root.style.setProperty('--widget-cta-bg', '#ffffff') // 다크에서 inverse: 흰 알약 = CTA
    root.style.setProperty('--widget-cta-fg', '#0e0e10')
    root.style.setProperty('--widget-card-border', 'rgba(255, 255, 255, 0.06)')
    root.style.setProperty('--widget-border', 'rgba(255, 255, 255, 0.10)')
    root.style.setProperty('--widget-overlay', 'rgba(255, 255, 255, 0.06)')
    root.style.setProperty('--widget-overlay-strong', 'rgba(255, 255, 255, 0.14)')
    root.style.setProperty('--widget-row-border', 'rgba(255, 255, 255, 0.06)')
    return
  }

  // 라이트 = 풀컬러. 위젯 전체가 액센트 한 덩어리. 텍스트 검정.
  const fg = '#0e0e10'
  root.style.setProperty('--widget-bg', hex)
  root.style.setProperty('--widget-header-bg', hex)
  root.style.setProperty('--widget-card-bg', hex)
  root.style.setProperty('--widget-accent', hex)
  root.style.setProperty('--widget-fg', fg)
  root.style.setProperty('--widget-muted', 'rgba(14, 14, 16, 0.62)')
  root.style.setProperty('--widget-on-header', fg)
  root.style.setProperty('--widget-on-accent', fg)
  root.style.setProperty('--widget-surface', '#ffffff')
  root.style.setProperty('--widget-on-surface', fg)
  root.style.setProperty('--widget-cta-bg', fg)
  root.style.setProperty('--widget-cta-fg', '#ffffff')
  root.style.setProperty('--widget-card-border', 'rgba(14, 14, 16, 0.08)')
  root.style.setProperty('--widget-border', 'rgba(14, 14, 16, 0.14)')
  root.style.setProperty('--widget-overlay', 'rgba(14, 14, 16, 0.06)')
  root.style.setProperty('--widget-overlay-strong', 'rgba(14, 14, 16, 0.12)')
  root.style.setProperty('--widget-row-border', 'rgba(14, 14, 16, 0.10)')
}
