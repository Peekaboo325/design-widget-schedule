// GAS Web App 호출은 main 프로세스에서 수행 (CSP/CORS 우회).
// 렌더러는 preload가 노출한 window.widgetAPI로 IPC만 호출.
//
// 에러는 Error 객체에 .code 부여 (NETWORK / BUSY / STALE / INVALID / HTTP / NOT_JSON / UNKNOWN)
// → 상위에서 lib/errors.js의 codeFromGas로 E01~E99 변환

function makeError(message, code) {
  const err = new Error(message || 'API 호출 실패')
  err.code = code || 'UNKNOWN'
  return err
}

async function callApi(params) {
  const ipc = window.widgetAPI?.apiGet
  if (!ipc) {
    throw makeError('widgetAPI 미주입 (Electron 환경에서만 실행 가능)', 'UNKNOWN')
  }
  const res = await ipc(params)
  if (!res?.ok) {
    throw makeError(res?.error, res?.code)
  }
  return res.data
}

// GAS API POST — 시트 쓰기 (상태/공유 변경)
async function postApi(body) {
  const ipc = window.widgetAPI?.apiPost
  if (!ipc) {
    throw makeError('widgetAPI 미주입 (Electron 환경에서만 실행 가능)', 'UNKNOWN')
  }
  const res = await ipc(body)
  if (!res?.ok) {
    throw makeError(res?.error, res?.code)
  }
  return res.data
}

// 행 상태 변경 (K열): 미정/대기/진행/완료
// expect: 클라이언트가 본 광고주/비고. GAS 측 optimistic locking 검증에 사용
export async function setRowStatus(rowIndex, status, expect) {
  return postApi({ action: 'setStatus', rowIndex, value: status, expect })
}

// 행 공유 토글 (L열): TRUE/FALSE
export async function setRowShare(rowIndex, shared, expect) {
  return postApi({ action: 'setShare', rowIndex, value: Boolean(shared), expect })
}

// 행 백업 토글 (💚완료 시트 M열): TRUE/FALSE
export async function setRowBackup(rowIndex, backed, expect) {
  return postApi({ action: 'setBackup', rowIndex, value: Boolean(backed), expect })
}

// 팀원 목록 조회
// 응답: { members: string[] }
export async function fetchMembers() {
  const data = await callApi({ type: 'members' })
  if (!data || !Array.isArray(data.members)) {
    throw makeError('Invalid members response', 'INVALID')
  }
  return data.members
}

// 특정 팀원의 스케줄/공유대기 조회
// 응답: { schedule: [...], pending: [...], summary: { total, pending } }
export async function fetchSchedule(memberName) {
  if (!memberName) throw makeError('memberName required', 'INVALID')
  const data = await callApi({ type: 'schedule', member: memberName })
  if (!data || !Array.isArray(data.schedule) || !Array.isArray(data.pending)) {
    throw makeError('Invalid schedule response', 'INVALID')
  }
  return {
    schedule: data.schedule,
    pending: data.pending,
    backup: Array.isArray(data.backup) ? data.backup : [],
    summary:
      data.summary ?? {
        total: data.schedule.length,
        pending: data.pending.length,
        backup: Array.isArray(data.backup) ? data.backup.length : 0
      }
  }
}
