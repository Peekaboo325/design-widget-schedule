import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { scheduleKey } from '../components/ScheduleView.jsx'

// 새 스케줄 알림용 '본 항목 키' 트래킹
// - 멤버별로 본 키 집합을 electron-store에 영구 저장
// - 현재 fetch 결과 중 저장된 집합에 없는 항목 = NEW
// - markAllSeen()으로 현재 항목 전체를 본 것으로 표시
//
// 첫 사용자(저장된 키가 없는 멤버)의 경우, 초기 fetch 결과 전체를
// 자동으로 '본 것'으로 마킹해 위젯 켤 때 N개가 NEW로 도배되지 않게 함.
export default function useSeenSchedule(activeMember, scheduleItems) {
  const [seenKeys, setSeenKeys] = useState(null) // Set | null(로딩 전)
  const initializedForMember = useRef(null)

  // 멤버 변경 시 store에서 본 키 로드
  useEffect(() => {
    initializedForMember.current = null
    if (!activeMember) {
      setSeenKeys(null)
      return
    }
    let cancelled = false
    ;(async () => {
      const arr = (await window.widgetAPI?.getSeenKeys?.(activeMember)) ?? []
      if (cancelled) return
      setSeenKeys(new Set(arr))
    })()
    return () => {
      cancelled = true
    }
  }, [activeMember])

  // 첫 fetch 결과를 자동으로 '본 것'으로 마킹 (저장된 키가 비어있을 때만)
  useEffect(() => {
    if (!activeMember || !seenKeys || !scheduleItems) return
    if (initializedForMember.current === activeMember) return

    if (seenKeys.size === 0 && scheduleItems.length > 0) {
      const next = new Set(scheduleItems.map(scheduleKey))
      setSeenKeys(next)
      window.widgetAPI?.setSeenKeys?.(activeMember, Array.from(next))
    }
    initializedForMember.current = activeMember
  }, [activeMember, seenKeys, scheduleItems])

  // 현재 NEW 키 집합
  const newKeys = useMemo(() => {
    if (!seenKeys || !scheduleItems) return new Set()
    const result = new Set()
    for (const item of scheduleItems) {
      const k = scheduleKey(item)
      if (!seenKeys.has(k)) result.add(k)
    }
    return result
  }, [seenKeys, scheduleItems])

  // '모두 본 것으로' — 현재 fetch의 모든 키를 저장
  const markAllSeen = useCallback(() => {
    if (!activeMember || !scheduleItems) return
    const next = new Set(scheduleItems.map(scheduleKey))
    setSeenKeys(next)
    window.widgetAPI?.setSeenKeys?.(activeMember, Array.from(next))
  }, [activeMember, scheduleItems])

  return { newKeys, newCount: newKeys.size, markAllSeen }
}
