import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { scheduleKey } from '../components/ScheduleView.jsx'

// 새 스케줄 알림 — 세션 기반 (메모리만, 영구 저장 X)
// - 첫 fetch: 현재 키 전체를 기준선으로 등록 (NEW 0)
// - 이후 fetch:
//   - 기준선에서 '이번 fetch에 없는 키'는 자동 제거 (이동/삭제된 항목)
//     → 같은 키가 나중에 다시 들어오면 NEW로 정확히 잡힘
//   - 기준선에 없는 현재 키 = NEW
// - +N 클릭(markAllSeen): 현재 키 전체로 기준선 갱신 → NEW 사라짐
// - 멤버 변경/위젯 재시작: 기준선 리셋 → 다시 첫 fetch 기준
export default function useSeenSchedule(activeMember, scheduleItems) {
  const [seenKeys, setSeenKeys] = useState(null) // Set | null(첫 fetch 전)
  const lastMemberRef = useRef(null)

  // 멤버 변경 시 기준선 리셋
  useEffect(() => {
    if (lastMemberRef.current !== activeMember) {
      lastMemberRef.current = activeMember
      setSeenKeys(null)
    }
  }, [activeMember])

  // 매 fetch 결과 반영: 첫 fetch는 기준선 등록, 이후는 사라진 키 정리
  useEffect(() => {
    if (!activeMember || !scheduleItems) return
    const currentKeys = new Set(scheduleItems.map(scheduleKey))

    setSeenKeys((prev) => {
      if (prev === null) {
        // 첫 fetch: 현재 키 전체가 기준선
        return currentKeys
      }
      // 이후 fetch: 기준선에서 사라진 키 제거 (재등장 시 NEW 잡히도록)
      let changed = false
      const next = new Set()
      for (const k of prev) {
        if (currentKeys.has(k)) next.add(k)
        else changed = true
      }
      return changed ? next : prev
    })
  }, [activeMember, scheduleItems])

  // 기준선에 없는 키 = NEW
  const newKeys = useMemo(() => {
    if (!seenKeys || !scheduleItems) return new Set()
    const result = new Set()
    for (const item of scheduleItems) {
      const k = scheduleKey(item)
      if (!seenKeys.has(k)) result.add(k)
    }
    return result
  }, [seenKeys, scheduleItems])

  // 현재 fetch의 모든 키로 기준선 갱신 → NEW 소거
  const markAllSeen = useCallback(() => {
    if (!scheduleItems) return
    setSeenKeys(new Set(scheduleItems.map(scheduleKey)))
  }, [scheduleItems])

  // 단일 키만 기준선에 추가 (Undo 케이스에서 NEW 표시 방지에 사용)
  const markSeen = useCallback((key) => {
    if (!key) return
    setSeenKeys((prev) => {
      if (!prev) return prev
      if (prev.has(key)) return prev
      const next = new Set(prev)
      next.add(key)
      return next
    })
  }, [])

  return { newKeys, newCount: newKeys.size, markAllSeen, markSeen }
}
