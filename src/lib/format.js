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

// 상태 순환: 예정 → 대기 → 진행 → 완료 → 예정
// 빈 값/알 수 없는 값은 '대기'부터 시작
// v0.2.8: '미정' → '예정' 으로 의미 재정의. 옛 데이터는 시트 일괄 변환 + GAS 검증 함수로 마이그레이션.
const STATUS_CYCLE = ['예정', '대기', '진행', '완료']

export function nextStatus(current) {
  const idx = STATUS_CYCLE.indexOf(String(current ?? '').trim())
  if (idx < 0) return '대기'
  return STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
}

// 수량 합산 — 사용자에게 '건' = 수량 단위 (행 수 아님)
// 빈 값은 1로 친다 (시트에 수량 안 적힌 행은 1건으로 간주)
// ScheduleView / BackupView / App 탭 뱃지에서 모두 사용 (단일 출처)
export function sumQty(items) {
  return (items ?? []).reduce(
    (acc, it) => acc + (Number(it?.['수량']) || 1),
    0
  )
}
