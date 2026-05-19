// GAS Web App 호출은 main 프로세스에서 수행 (CSP/CORS 우회).
// 렌더러는 preload가 노출한 window.widgetAPI로 IPC만 호출.

async function callApi(params) {
  const ipc = window.widgetAPI?.apiGet
  if (!ipc) {
    throw new Error('widgetAPI 미주입 (Electron 환경에서만 실행 가능)')
  }
  const res = await ipc(params)
  if (!res?.ok) {
    throw new Error(res?.error || 'API 호출 실패')
  }
  return res.data
}

// GAS API POST — 시트 쓰기 (상태/공유 변경)
async function postApi(body) {
  const ipc = window.widgetAPI?.apiPost
  if (!ipc) {
    throw new Error('widgetAPI 미주입 (Electron 환경에서만 실행 가능)')
  }
  const res = await ipc(body)
  if (!res?.ok) {
    throw new Error(res?.error || '시트 쓰기 실패')
  }
  return res.data
}

// 행 상태 변경 (K열): 미정/대기/진행/완료
export async function setRowStatus(rowIndex, status) {
  return postApi({ action: 'setStatus', rowIndex, value: status })
}

// 행 공유 토글 (L열): TRUE/FALSE
export async function setRowShare(rowIndex, shared) {
  return postApi({ action: 'setShare', rowIndex, value: Boolean(shared) })
}

// 팀원 목록 조회
// 응답: { members: string[] }
export async function fetchMembers() {
  const data = await callApi({ type: 'members' })
  if (!data || !Array.isArray(data.members)) {
    throw new Error('Invalid members response')
  }
  return data.members
}

// 특정 팀원의 스케줄/공유대기 조회
// 응답: { schedule: [...], pending: [...], summary: { total, pending } }
export async function fetchSchedule(memberName) {
  if (!memberName) throw new Error('memberName required')
  const data = await callApi({ type: 'schedule', member: memberName })
  if (!data || !Array.isArray(data.schedule) || !Array.isArray(data.pending)) {
    throw new Error('Invalid schedule response')
  }
  return {
    schedule: data.schedule,
    pending: data.pending,
    summary: data.summary ?? { total: data.schedule.length, pending: data.pending.length }
  }
}
