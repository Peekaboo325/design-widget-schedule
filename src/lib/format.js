// 멤버 이름에서 성씨 떼어내기 (헤더 표시용)
// 규칙:
//   2글자: 뒷 1자 ("민지" → "지")
//   3글자: 뒷 2자 ("부수빈" → "수빈")
//   4글자 이상: 뒷 2자
//   그 외: 원본 그대로
export function shortName(name) {
  if (!name || typeof name !== 'string') return ''
  const trimmed = name.trim()
  const len = trimmed.length
  if (len <= 1) return trimmed
  if (len === 2) return trimmed.slice(-1)
  return trimmed.slice(-2)
}

// 상태 순환: 미정 → 대기 → 진행 → 완료 → 미정
// 빈 값/알 수 없는 값은 '대기'부터 시작
const STATUS_CYCLE = ['미정', '대기', '진행', '완료']

export function nextStatus(current) {
  const idx = STATUS_CYCLE.indexOf(String(current ?? '').trim())
  if (idx < 0) return '대기'
  return STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
}
