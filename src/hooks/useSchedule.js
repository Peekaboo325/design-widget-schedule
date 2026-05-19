import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchSchedule } from '../lib/api.js'

const AUTO_REFRESH_MS = 5 * 60 * 1000 // SPEC: 5분 자동 새로고침

// 백오프 재시도 — GAS 일시 장애에 대비
// 1차 즉시 → 실패 시 2초 → 4초 → 8초 (최대 3회 재시도, 총 4번 시도)
const MAX_RETRIES = 3
const BASE_RETRY_DELAY_MS = 2000

// 특정 팀원의 스케줄/공유대기 훅
// - memberName 변경 시 즉시 재조회
// - 5분 간격 자동 새로고침
// - 수동 refresh 노출 (헤더 ↻ 버튼용)
// - fetch 실패 시 지수 백오프 자동 재시도 (조용히)
// - 모두 실패해야 error 노출
export default function useSchedule(memberName) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

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
  const attemptLoad = useCallback(
    async (attempt) => {
      if (!memberName) {
        setData(null)
        return
      }
      const controller = new AbortController()
      inflightRef.current = controller

      // 첫 시도일 때만 loading 표시 / error 초기화 — 재시도 중에는 화면 유지
      if (attempt === 0) {
        setLoading(true)
        setError(null)
      }

      try {
        const result = await fetchSchedule(memberName, { signal: controller.signal })
        if (controller.signal.aborted) return
        setData(result)
        setLastUpdated(new Date())
        setError(null)
        setLoading(false)
        inflightRef.current = null
      } catch (err) {
        if (controller.signal.aborted || err.name === 'AbortError') return
        if (attempt >= MAX_RETRIES) {
          // 최종 실패 → 빨간 에러 표시
          setError(err)
          setLoading(false)
          inflightRef.current = null
          return
        }
        // 백오프 후 재시도
        const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt) // 2s, 4s, 8s
        inflightRef.current = null
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null
          attemptLoad(attempt + 1)
        }, delay)
      }
    },
    [memberName]
  )

  // 외부에서 호출하는 진입점 — 진행 중 요청/재시도 취소 후 처음부터
  const load = useCallback(() => {
    cancelPending()
    attemptLoad(0)
  }, [cancelPending, attemptLoad])

  // memberName 변경/마운트 시 즉시 1회 + 5분 interval
  useEffect(() => {
    load()
    if (!memberName) return
    const id = setInterval(load, AUTO_REFRESH_MS)
    return () => {
      clearInterval(id)
      cancelPending()
    }
  }, [memberName, load, cancelPending])

  // 낙관적 업데이트 — POST 호출 전후로 화면을 즉시 갱신 / 롤백
  const mutate = useCallback((updater) => {
    setData((prev) => (prev ? updater(prev) : prev))
  }, [])

  return { data, loading, error, lastUpdated, refresh: load, mutate }
}
