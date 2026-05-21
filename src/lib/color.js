// 컬러 시스템 — 헤더 그라데이션을 hue 슬라이더로 평행이동
//
// 디폴트는 두 핑크 #f39ebb (연한 영역) → #ff86a2 (진한 영역)
// 사용자가 hue 슬라이더로 베이스 hue 변경하면 두 색의 H가 평행이동 (S/L은 각자 유지)
// → 두 색의 톤 관계는 유지하면서 색상만 다른 hue로 이동

// 디폴트 헤더 그라데이션 컬러 (이미지 시안)
export const DEFAULT_FROM = '#f39ebb' // 연한 영역
export const DEFAULT_TO = '#ff86a2' // 진한 영역 (=액센트 베이스)

// 블랙 테마 프리셋 — hue 시스템 밖의 특수값. 정확 일치 시 블랙 모드로 분기.
// 완전 블랙(#000)이 아니라 본문 fg(#1a1a1f)와 통일된 톤
export const BLACK_THEME_HEX = '#1a1a1f'

export function isBlackTheme(hex) {
  return typeof hex === 'string' && hex.toLowerCase() === BLACK_THEME_HEX
}

// 블랙 테마 컬러 셋 — 헤더는 짙은 그라데이션, 본문 강조는 검정 텍스트
export function getBlackThemeColors() {
  return {
    from: '#2a2a32',
    to: '#1a1a1f',
    onHeader: '#ffffff',
    accent: '#2a2a32',
    accentStrong: '#1a1a1f', // 흰 배경 위 강조 텍스트 (큰 숫자 등)
    accentSoft: '#eeeef1' // 메트릭 카드 / chip 배경
  }
}

// HEX ↔ HSL
function hexToHsl(hex) {
  const c = hex.replace('#', '')
  const r = parseInt(c.slice(0, 2), 16) / 255
  const g = parseInt(c.slice(2, 4), 16) / 255
  const b = parseInt(c.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1))
    if (max === r) h = 60 * (((g - b) / d) % 6)
    else if (max === g) h = 60 * ((b - r) / d + 2)
    else h = 60 * ((r - g) / d + 4)
  }
  if (h < 0) h += 360
  return { h, s, l }
}

function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hh = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hh % 2) - 1))
  let r = 0
  let g = 0
  let b = 0
  if (hh < 1) [r, g, b] = [c, x, 0]
  else if (hh < 2) [r, g, b] = [x, c, 0]
  else if (hh < 3) [r, g, b] = [0, c, x]
  else if (hh < 4) [r, g, b] = [0, x, c]
  else if (hh < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const m = l - c / 2
  const to = (v) =>
    Math.round(Math.max(0, Math.min(1, v + m)) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

// 기준 hex의 H를 deltaH만큼 평행이동. S/L은 그대로.
function shiftHue(hex, deltaH) {
  const { h, s, l } = hexToHsl(hex)
  return hslToHex(h + deltaH, s, l)
}

// 사용자 hue(0~360)를 받아 그라데이션 + 액센트 컬러 셋 반환
// - from / to: 헤더 그라데이션 (hue 평행이동 + perceptual L 보정으로 모든 hue에서 비슷한 시각 무게감)
// - onHeader: 헤더 위 텍스트 색 (hue별 자동 흑/백 — 옐로/시안 영역은 검정으로)
// - accent: 그라데이션과 어울리는 옅은 톤
// - accentStrong: 흰 배경 위 강조용 진한 톤 (hue별 가독성 보정)
// - accentSoft: 흰에 가까운 옅은 hue 톤 (메트릭 카드/chip 배경)
export function getThemeColors(baseHue) {
  const defaultHue = hexToHsl(DEFAULT_TO).h
  const delta = baseHue - defaultHue
  const fromHsl = hexToHsl(DEFAULT_FROM)
  const toHsl = hexToHsl(DEFAULT_TO)
  const fromHue = (((fromHsl.h + delta) % 360) + 360) % 360
  const toHue = (((toHsl.h + delta) % 360) + 360) % 360
  const from = hslToHex(fromHue, fromHsl.s, adjustL(fromHue, fromHsl.l, 0.12))
  const to = hslToHex(toHue, toHsl.s, adjustL(toHue, toHsl.l, 0.12))
  return {
    from,
    to,
    // 헤더 위 텍스트는 to의 실제 luminance로 흑/백 자동 결정
    onHeader: relLuminance(to) > 0.5 ? '#1a1a1f' : '#ffffff',
    accent: shiftHue(DEFAULT_TO, delta),
    accentStrong: hslToHex(baseHue, 0.8, adjustL(baseHue, 0.48, 0.10)),
    accentSoft: hslToHex(baseHue, 0.85, 0.94)
  }
}

// hue별 perceptual lightness 보정 — 옐로(60°)/시안(180°) 근처는 사람 눈에 더 밝게 보임
// → 같은 시각 무게감을 위해 L을 그만큼 낮춤 (최대 maxAdjust)
function adjustL(hue, baseL, maxAdjust) {
  const yellowDist = circularDist(hue, 60)
  const cyanDist = circularDist(hue, 180)
  const minDist = Math.min(yellowDist, cyanDist)
  // minDist=0이면 최대 보정, 60도 이상 떨어지면 보정 없음
  const adjust = Math.max(0, (60 - minDist) / 60) * maxAdjust
  return Math.max(0, baseL - adjust)
}

function circularDist(a, b) {
  const d = Math.abs(a - b) % 360
  return Math.min(d, 360 - d)
}

// WCAG relative luminance — 0~1 (0=검정, 1=흰)
function relLuminance(hex) {
  const c = hex.replace('#', '')
  const r = parseInt(c.slice(0, 2), 16) / 255
  const g = parseInt(c.slice(2, 4), 16) / 255
  const b = parseInt(c.slice(4, 6), 16) / 255
  const toLin = (v) =>
    v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b)
}

// HEX → hue (슬라이더 위치 복원용)
export function hueFromHex(hex) {
  return Math.round(hexToHsl(hex).h)
}

// hue → HEX (= DEFAULT_TO의 S/L 유지하면서 hue만 다른 색)
// 저장용 themeColor 생성
export function hexFromHue(hue) {
  const { s, l } = hexToHsl(DEFAULT_TO)
  return hslToHex(hue, s, l)
}
