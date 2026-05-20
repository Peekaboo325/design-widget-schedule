import { useEffect, useState } from 'react'
import { fetchMembers } from '../lib/api.js'

// 팀원 목록 훅
// - 마운트 시 캐시(electron-store)에서 즉시 표시 → 첫 화면 깜빡임 방지
// - 백그라운드에서 fetch 후 fresh 데이터로 덮어쓰고 캐시 갱신
export default function useMembers() {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    // 1) 캐시에서 먼저 로드 — 비동기지만 fetch보다 훨씬 빠름
    window.widgetAPI?.getCachedMembers?.().then((cached) => {
      if (cancelled) return
      if (Array.isArray(cached) && cached.length > 0) {
        setMembers(cached)
        setLoading(false) // 캐시가 있으면 더 이상 로딩 표시 X
      }
    })

    // 2) 백그라운드 fetch — 성공 시 fresh로 덮어쓰고 캐시 갱신
    fetchMembers({ signal: controller.signal })
      .then((list) => {
        if (cancelled) return
        setMembers(list)
        setLoading(false)
        window.widgetAPI?.setCachedMembers?.(list)
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        if (cancelled) return
        setError(err)
        setLoading(false)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [])

  return { members, loading, error }
}
