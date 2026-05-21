import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { scheduleKey } from '../components/ScheduleView.jsx'

// 신 키 형식 판별: 'rN' (rowIndex 기반) 또는 '광고주|비고|due'(3 segment fallback)
// 구 형식('광고주|비고' 2 segment)은 false 반환 → 자동 마이그레이션 트리거
function isNewFormatKey(k) {
  if (typeof k !== 'string') return false
  if (/^r\d+$/.test(k)) return true
  // due 포함 fallback 키는 segment 3개 ("a|b|c"). 구 형식은 2개 ("a|b")
  return k.split('|').length >= 3
}

// 새 스케줄 알림 — persistent (electron-store에 멤버별 seen keys 저장)
// - 위젯 종료해도 멤버별 '본 키' 기억 → 컴퓨터 끄고 켰을 때 그 사이 추가된
//   새 일정이 NEW로 잡힘 (출근하면 알림 보기 쉬움)
// - 첫 마운트(또는 멤버 변경): store에서 seen keys 복원
//   · store에 데이터 없으면(첫 사용): 첫 fetch 결과 전체를 기준선
//   · store에 있으면: 그걸 기준선 → 첫 fetch에서 새 키가 NEW로 잡힘
// - 매 fetch: 기준선에서 사라진 키 자동 제거 (재등장 시 NEW 잡히도록)
// - +N 클릭(markAllSeen): 현재 키 전체로 기준선 갱신
// - seen 변경 시 자동으로 store 저장
export default function useSeenSchedule(activeMember, scheduleItems) {
  const [seenKeys, setSeenKeys] = useState(null) // Set | null(아직 복원 중)
  const hydratedRef = useRef(null) // 마지막으로 hydrate 완료한 멤버명

  // 멤버 변경 시 — store에서 복원
  useEffect(() => {
    if (!activeMember) {
      setSeenKeys(null)
      hydratedRef.current = null
      return
    }
    if (hydratedRef.current === activeMember) return
    let cancelled = false
    setSeenKeys(null)
    window.widgetAPI?.getSeenKeys?.(activeMember).then((stored) => {
      if (cancelled) return
      hydratedRef.current = activeMember
      // 신 키 형식(rowIndex 기반 'rN')과 호환되는 데이터만 복원.
      // 구 형식('광고주|비고')은 무시하여 첫 fetch를 새 기준선으로 마이그레이션
      // (구→신 전환 시 NEW 폭주 회피. 일시적으로 NEW 0건 → 다음 새 일정부터 정상)
      if (Array.isArray(stored) && stored.every(isNewFormatKey)) {
        setSeenKeys(new Set(stored))
      } else {
        setSeenKeys(null)
      }
    })
    return () => {
      cancelled = true
    }
  }, [activeMember])

  // 매 fetch 결과 반영
  useEffect(() => {
    if (!activeMember || !scheduleItems) return
    if (hydratedRef.current !== activeMember) return // 복원 완료 전엔 패스
    const currentKeys = new Set(scheduleItems.map(scheduleKey))

    setSeenKeys((prev) => {
      if (prev === null) {
        // 첫 사용(store에 데이터 없었음): 현재 키 전체가 기준선
        return currentKeys
      }
      // 사라진 키 제거 (재등장 시 NEW 잡히도록)
      let changed = false
      const next = new Set()
      for (const k of prev) {
        if (currentKeys.has(k)) next.add(k)
        else changed = true
      }
      return changed ? next : prev
    })
  }, [activeMember, scheduleItems])

  // seenKeys 변경 시 store에 저장 (debounce 없이 즉시 — 양 작아서 부담 없음)
  useEffect(() => {
    if (!activeMember || !seenKeys) return
    if (hydratedRef.current !== activeMember) return
    window.widgetAPI?.setSeenKeys?.(activeMember, Array.from(seenKeys))
  }, [activeMember, seenKeys])

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
