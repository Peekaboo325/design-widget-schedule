// HSV → HEX (S/V 고정 + hue만 받는 컬러 시스템용)
// 사용자 디자인 결정: S60% B100% 고정, hue만 슬라이더로 컨트롤
// → 모든 테마 컬러가 같은 밝기·채도 톤으로 통일됨

export function hsvToHex(h, s = 0.6, v = 1.0) {
  const c = v * s
  const hh = ((h % 360) + 360) % 360
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1))
  const m = v - c
  let r = 0
  let g = 0
  let b = 0
  if (hh < 60) [r, g, b] = [c, x, 0]
  else if (hh < 120) [r, g, b] = [x, c, 0]
  else if (hh < 180) [r, g, b] = [0, c, x]
  else if (hh < 240) [r, g, b] = [0, x, c]
  else if (hh < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return rgbToHex(r + m, g + m, b + m)
}

export function hexToHsv(hex) {
  const c = hex.replace('#', '')
  if (c.length !== 6) return { h: 0, s: 0.6, v: 1.0 }
  const r = parseInt(c.slice(0, 2), 16) / 255
  const g = parseInt(c.slice(2, 4), 16) / 255
  const b = parseInt(c.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6)
    else if (max === g) h = 60 * ((b - r) / d + 2)
    else h = 60 * ((r - g) / d + 4)
  }
  if (h < 0) h += 360
  const s = max === 0 ? 0 : d / max
  return { h, s, v: max }
}

// 저장된 HEX에서 hue만 추출 (slider 위치 복원용)
export function hueFromHex(hex) {
  return Math.round(hexToHsv(hex).h)
}

// hue (0~360)만 받아서 표준 S/V로 hex 반환
export function hexFromHue(hue) {
  return hsvToHex(hue, 0.6, 1.0)
}

function rgbToHex(r, g, b) {
  const to = (v) =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}
