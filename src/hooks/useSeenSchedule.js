import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { scheduleKey } from '../components/ScheduleView.jsx'

// 새 스케줄 알림 — 세션 기반 (메모리만, 영구 저장 X)
// - 위젯 실행 중에만 '본 키 집합' 유지
// - 첫 fetch 결과는 전부 '본 것'으로 등록 (NEW 표시 없음)
// - 이후 새로고침에서 기준선에 없던 키만 NEW
// - markAllSeen()으로 현재 키 전체 본 것 처리
// - 멤버 변경 시 기준선 리셋 → 새 멤버의 첫 fetch부터 다시 기준선 잡음
// - 위젯 재시작 시 초기화 (의도된 동작 — 실시간 변동 추적)
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

  // 멤버의 첫 fetch 결과를 기준선으로 등록
  useEffect(() => {
    if (!activeMember || !scheduleItems) return
    if (seenKeys !== null) return
    setSeenKeys(new Set(scheduleItems.map(scheduleKey)))
  }, [activeMember, scheduleItems, seenKeys])

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

  // '모두 본 것으로' — 현재 fetch의 모든 키로 기준선 갱신
  const markAllSeen = useCallback(() => {
    if (!scheduleItems) return
    setSeenKeys(new Set(scheduleItems.map(scheduleKey)))
  }, [scheduleItems])

  return { newKeys, newCount: newKeys.size, markAllSeen }
}
