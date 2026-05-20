// 에러 코드 카탈로그 — 팀원이 토스트의 코드만 알려줘도 진단 가능
//
// 코드 체계:
//   E01 — 네트워크 (인터넷 끊김, fetch 실패, 타임아웃)
//   E02 — 서버 바쁨 (GAS LockService 락 충돌)
//   E03 — 시트 변경됨 (GAS Optimistic Lock 거부, 행 어긋남)
//   E04 — 잘못된 요청 (GAS INVALID, 검증 실패)
//   E05 — 복사 실패 (clipboard API)
//   E99 — 알 수 없는 오류 (catch-all)
//
// 사용:
//   toastForCode('E03') → { code: 'E03', message: '시트가 바뀌었어요...' }
//   codeFromGas('STALE') → 'E03'

const MESSAGES = {
  E01: '인터넷 연결을 확인해주세요.',
  E02: '서버가 잠시 바빠요. 다시 시도해주세요.',
  E03: '시트가 바뀌었어요. 새로고침 후 다시 시도해주세요.',
  E04: '잘못된 요청이에요.',
  E05: '복사에 실패했어요.',
  E99: '알 수 없는 오류가 발생했어요.'
}

// GAS 응답의 code(STALE/BUSY/INVALID) → 우리 E코드로 매핑
const GAS_CODE_MAP = {
  BUSY: 'E02',
  STALE: 'E03',
  INVALID: 'E04'
}

export function codeFromGas(gasCode) {
  return GAS_CODE_MAP[gasCode] ?? 'E99'
}

// 네트워크 에러 메시지/이름으로 E01 판별
export function codeFromNetworkError(err) {
  const msg = String(err?.message ?? err ?? '')
  if (
    /fetch failed|ENOTFOUND|ENETUNREACH|EAI_AGAIN|EHOSTUNREACH|네트워크/i.test(msg) ||
    err?.name === 'AbortError'
  ) {
    return 'E01'
  }
  return null
}

// code → 친화 메시지
export function messageForCode(code) {
  return MESSAGES[code] ?? MESSAGES.E99
}

// 액션별 prefix를 메시지 앞에 붙여 토스트 묶음 ('변경 실패. 시트가...')
export function toastForCode(code, prefix) {
  return {
    code,
    message: prefix ? `${prefix} ${messageForCode(code)}` : messageForCode(code)
  }
}
