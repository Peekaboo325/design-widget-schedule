// 위젯 외곽 + 헤더 SVG path 빌더
// 사용자 제공 path를 0,0 기준으로 평행이동하고 사이즈에 따라 파라미터화
// 모서리/inverse curve 라디우스는 절대 픽셀로 고정, 직선 변만 위젯 사이즈에 따라 늘어남
// → 모양 비율은 유지되면서 전체적으로는 위젯에 fit

// 사이즈별 매개변수
// - w/h: 위젯 픽셀 폭/높이 (electron BrowserWindow와 일치)
// - r: 외곽 라운드 반지름
// - invR: 헤더 우하단 inverse curve(헤더가 본문 카드 위로 휘어들어가는 곡률) 반지름
// - headerH: 헤더 path 하단 직선 y좌표 (= 헤더 카드 높이)
// - notchW: 우상단 노치(아이콘 영역) 가로 폭 — 헤더 우측 변에서 위젯 우측 끝까지
// 원본 SVG path 비율 (r:직선:invR ≈ 30:55:35)을 살리기 위해 headerH를 충분히 크게 잡음
// → 우측 변의 직선부가 사라져 inverse curve 형상이 뭉개지는 것을 방지
const PRESETS = {
  S: { w: 240, h: 220, r: 16, invR: 18, headerH: 64, notchW: 110 },
  M: { w: 300, h: 380, r: 22, invR: 26, headerH: 84, notchW: 130 },
  L: { w: 360, h: 560, r: 22, invR: 26, headerH: 84, notchW: 130 }
}

export function getShapeParams(size) {
  return PRESETS[size] ?? PRESETS.M
}

// 위젯 전체 외곽 path — 우상단 노치 + inverse curve 포함
export function buildOuterPath({ w, h, r, invR, headerH, notchW }) {
  const hx = w - notchW // 헤더 우측 변 x좌표
  return [
    `M ${r} 0`,
    `L ${hx - r} 0`,
    `Q ${hx} 0 ${hx} ${r}`,
    `L ${hx} ${headerH - invR}`,
    `Q ${hx} ${headerH} ${hx + invR} ${headerH}`,
    `L ${w - r} ${headerH}`,
    `Q ${w} ${headerH} ${w} ${headerH + r}`,
    `L ${w} ${h - r}`,
    `Q ${w} ${h} ${w - r} ${h}`,
    `L ${r} ${h}`,
    `Q 0 ${h} 0 ${h - r}`,
    `L 0 ${r}`,
    `Q 0 0 ${r} 0`,
    'Z'
  ].join(' ')
}

// 헤더 영역 path — 외곽 path의 상단 + 좌하단을 잘라낸 형태
export function buildHeaderPath({ w, r, invR, headerH, notchW }) {
  const hx = w - notchW
  return [
    `M ${r} 0`,
    `L ${hx - r} 0`,
    `Q ${hx} 0 ${hx} ${r}`,
    `L ${hx} ${headerH - invR}`,
    `Q ${hx} ${headerH} ${hx + invR} ${headerH}`,
    `L 0 ${headerH}`,
    `L 0 ${r}`,
    `Q 0 0 ${r} 0`,
    'Z'
  ].join(' ')
}
