import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchSchedule } from '../lib/api.js'

const AUTO_REFRESH_MS = 5 * 60 * 1000 // SPEC: 5분 자동 새로고침

// 특정 팀원의 스케줄/공유대기 훅
// - memberName 변경 시 즉시 재조회
// - 5분 간격 자동 새로고침
// - 수동 refresh 노출 (헤더 ↻ 버튼용)
// - 마지막 갱신 시각 노출
export default function useSchedule(memberName) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  // 동시 호출 방지: 진행 중인 요청을 새 요청이 abort
  const inflightRef = useRef(null)

  const load = useCallback(async () => {
    if (!memberName) {
      setData(null)
      return
    }
    inflightRef.current?.abort()
    const controller = new AbortController()
    inflightRef.current = controller

    setLoading(true)
    setError(null)
    try {
      const result = await fetchSchedule(memberName, { signal: controller.signal })
      if (controller.signal.aborted) return
      setData(result)
      setLastUpdated(new Date())
    } catch (err) {
      if (err.name === 'AbortError') return
      setError(err)
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [memberName])

  // memberName 변경/마운트 시 즉시 1회 + 5분 interval
  useEffect(() => {
    load()
    if (!memberName) return
    const id = setInterval(load, AUTO_REFRESH_MS)
    return () => {
      clearInterval(id)
      inflightRef.current?.abort()
    }
  }, [memberName, load])

  return { data, loading, error, lastUpdated, refresh: load }
}
