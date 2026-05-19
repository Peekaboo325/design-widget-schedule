import { useEffect, useState } from 'react'
import { fetchMembers } from '../lib/api.js'

// 팀원 목록 훅
// 마운트 시 1회 조회. 변동 적은 데이터라 자동 갱신은 두지 않음.
// 필요해지면 refresh 노출 추가.
export default function useMembers() {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    fetchMembers({ signal: controller.signal })
      .then((list) => {
        setMembers(list)
        setLoading(false)
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setError(err)
        setLoading(false)
      })

    return () => controller.abort()
  }, [])

  return { members, loading, error }
}
