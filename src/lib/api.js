// GAS Web App 엔드포인트
// 응답 구조는 schedule-widget-api.gs / SPEC.md 참조
const API_BASE =
  'https://script.google.com/macros/s/AKfycbzzY6vue1tzVVvKwNfja4ZSxWXSvlkY5rNUXNSnv40WMH6oaEBcqcrfeYaAz9wrKr-syw/exec'

const DEFAULT_TIMEOUT_MS = 12000

// 공통 fetch 래퍼: AbortController로 타임아웃 + JSON 파싱
async function request(url, { signal, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  // 외부 signal이 abort되면 내부 controller도 abort
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal
    })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

// 팀원 목록 조회
// 응답: { members: string[] }
export async function fetchMembers(options) {
  const url = `${API_BASE}?type=members`
  const data = await request(url, options)
  if (!data || !Array.isArray(data.members)) {
    throw new Error('Invalid members response')
  }
  return data.members
}

// 특정 팀원의 스케줄/공유대기 조회
// 응답: { schedule: [...], pending: [...], summary: { total, pending } }
export async function fetchSchedule(memberName, options) {
  if (!memberName) throw new Error('memberName required')
  const url = `${API_BASE}?type=schedule&member=${encodeURIComponent(memberName)}`
  const data = await request(url, options)
  if (!data || !Array.isArray(data.schedule) || !Array.isArray(data.pending)) {
    throw new Error('Invalid schedule response')
  }
  return {
    schedule: data.schedule,
    pending: data.pending,
    summary: data.summary ?? { total: data.schedule.length, pending: data.pending.length }
  }
}
