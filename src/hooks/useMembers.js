import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchMembers } from '../lib/api.js'

// 백오프 재시도 — useSchedule과 같은 규칙
// 1차 즉시 → 실패 시 2초 → 4초 → 8초 (최대 3회 재시도, 총 4번 시도)
const MAX_RETRIES = 3
const BASE_RETRY_DELAY_MS = 2000
// 재시도까지 전부 실패하면 5분 뒤 처음부터 다시 — 위젯 재실행 없이 스스로 회복
const RECOVERY_RETRY_MS = 5 * 60 * 1000

// 팀원 목록 훅
// - 마운트 시 캐시(electron-store)에서 즉시 표시 → 첫 화면 깜빡임 방지
// - 백그라운드 fetch 후 fresh 데이터로 덮어쓰고 캐시 갱신
// - fetch 실패 시 지수 백오프 재시도 (조용히). 모두 실패해야 error 노출
// - 최종 실패 후에도 5분마다 자동 재시도 + 수동 refetch 노출 (↻ 버튼·트레이용)
//
// v0.2.11: 이전엔 마운트 시 딱 1회만 요청해서, 한 번 실패(GAS 콜드 스타트로 12초 초과 등)하면
//   위젯을 재실행할 때까지 에러가 영구히 남았음. 스케줄은 멀쩡한데 스케줄 탭이 막히던 원인.
export default function useMembers() {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // 진행 중 요청 / 대기 중인 재시도 타이머 — 새 요청 시 모두 취소
  const inflightRef = useRef(null)
  const retryTimerRef = useRef(null)

  const cancelPending = useCallback(() => {
    inflightRef.current?.abort()
    inflightRef.current = null
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }
  }, [])

  // 실제 호출 (재귀로 백오프 재시도)
  // attempt 0이 첫 시도, 1~MAX_RETRIES가 재시도
  const attemptLoad = useCallback(async (attempt) => {
    const controller = new AbortController()
    inflightRef.current = controller

    // 첫 시도일 때만 loading 표시 / error 초기화 — 재시도 중에는 화면 유지
    if (attempt === 0) {
      setLoading(true)
      setError(null)
    }

    try {
      const list = await fetchMembers({ signal: controller.signal })
      if (controller.signal.aborted) return
      setMembers(list)
      setError(null)
      setLoading(false)
      inflightRef.current = null
      window.widgetAPI?.setCachedMembers?.(list)
    } catch (err) {
      if (controller.signal.aborted || err.name === 'AbortError') return
      inflightRef.current = null

      if (attempt >= MAX_RETRIES) {
        // 최종 실패 → error 노출. 단 포기하지 않고 5분 뒤 처음부터 다시
        setError(err)
        setLoading(false)
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null
          attemptLoad(0)
        }, RECOVERY_RETRY_MS)
        return
      }

      // 백오프 후 재시도
      const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt) // 2s, 4s, 8s
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null
        attemptLoad(attempt + 1)
      }, delay)
    }
  }, [])

  // 외부에서 호출하는 진입점 — 진행 중 요청/재시도 취소 후 처음부터
  const refetch = useCallback(() => {
    cancelPending()
    attemptLoad(0)
  }, [cancelPending, attemptLoad])

  useEffect(() => {
    let cancelled = false

    // 1) 캐시에서 먼저 로드 — 비동기지만 fetch보다 훨씬 빠름
    window.widgetAPI?.getCachedMembers?.().then((cached) => {
      if (cancelled) return
      if (Array.isArray(cached) && cached.length > 0) {
        // fetch가 먼저 끝났으면 fresh 목록을 캐시로 덮어쓰지 않음
        setMembers((prev) => (prev.length > 0 ? prev : cached))
        setLoading(false) // 캐시가 있으면 더 이상 로딩 표시 X
      }
    })

    // 2) 백그라운드 fetch (실패 시 백오프 재시도)
    attemptLoad(0)

    return () => {
      cancelled = true
      cancelPending()
    }
  }, [attemptLoad, cancelPending])

  return { members, loading, error, refetch }
}
