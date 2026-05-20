// 컬러 시스템 — 헤더 그라데이션을 hue 슬라이더로 평행이동
//
// 디폴트는 두 핑크 #f39ebb (연한 영역) → #ff86a2 (진한 영역)
// 사용자가 hue 슬라이더로 베이스 hue 변경하면 두 색의 H가 평행이동 (S/L은 각자 유지)
// → 두 색의 톤 관계는 유지하면서 색상만 다른 hue로 이동

// 디폴트 헤더 그라데이션 컬러 (이미지 시안)
export const DEFAULT_FROM = '#f39ebb' // 연한 영역
export const DEFAULT_TO = '#ff86a2' // 진한 영역 (=액센트 베이스)

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
// - from / to: 헤더 그라데이션 (옅은 톤, 현재 디폴트 핑크 두 색의 hue 평행이동)
// - accent: 그라데이션과 어울리는 옅은 톤 (헤더 위 점 등)
// - accentStrong: 흰 배경 위 강조용 진한 톤 (chip 텍스트·dot·메트릭 카운트 등).
//   hue별 perceptual lightness 보정 — 옐로/시안 영역에서 L 더 낮춰 가독성 확보
// - accentSoft: 흰에 가까운 옅은 hue 톤 (메트릭 카드/chip 배경)
export function getThemeColors(baseHue) {
  const defaultHue = hexToHsl(DEFAULT_TO).h
  const delta = baseHue - defaultHue
  return {
    from: shiftHue(DEFAULT_FROM, delta),
    to: shiftHue(DEFAULT_TO, delta),
    accent: shiftHue(DEFAULT_TO, delta),
    accentStrong: hslToHex(baseHue, 0.8, getReadableL(baseHue)),
    accentSoft: hslToHex(baseHue, 0.85, 0.94)
  }
}

// hue별 perceptual lightness — 옐로(60)/시안(180) 근처는 사람 눈에 더 밝게 보여
// L을 더 낮춰야 흰 배경 위 텍스트 가독성이 같은 수준으로 유지됨
function getReadableL(hue) {
  const yellowDist = circularDist(hue, 60)
  const cyanDist = circularDist(hue, 180)
  const minDist = Math.min(yellowDist, cyanDist)
  // minDist=0(완전 옐로/시안)이면 -12%, 60도 이상 떨어지면 보정 없음
  const adjust = Math.max(0, (60 - minDist) / 60) * 0.12
  return 0.45 - adjust
}

function circularDist(a, b) {
  const d = Math.abs(a - b) % 360
  return Math.min(d, 360 - d)
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
