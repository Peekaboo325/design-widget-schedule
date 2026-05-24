import { useCallback, useEffect, useRef } from 'react'

// GAS Optimistic Locking 환경에서 우루루 클릭 회피용 직렬 큐.
// 클라이언트가 병렬로 보내면 행 이동/시프트로 expect mismatch → STALE 자주.
// 큐로 1개씩 순차 처리 + STALE 받으면 자동 refresh로 fresh data 받아
// id(우선) + 광고주·비고 같은 stable identifier로 새 rowIndex 찾아 1회 재시도.
//
// 인터페이스:
//   executor(task)       — 실제 API 호출 (Promise)
//   findFreshRow(data, task) — STALE 후 fresh data에서 같은 작업의 새 행 찾기
//   refresh()            — fresh data 반환 Promise (useSchedule.refresh)
//   onSuccess(task)      — 성공 토스트
//   onError(err, task)   — 실패 토스트
//   onStaleSkipped(task) — fresh에서 행 못 찾음(이미 처리됨) → 조용히 패스
//
// callback들이 매번 다시 만들어져도 큐 동작은 안정 — ref로 보관해 stale closure 회피
export default function useActionQueue({
  executor,
  findFreshRow,
  refresh,
  onSuccess,
  onError,
  onStaleSkipped
}) {
  const handlersRef = useRef({
    executor,
    findFreshRow,
    refresh,
    onSuccess,
    onError,
    onStaleSkipped
  })

  useEffect(() => {
    handlersRef.current = {
      executor,
      findFreshRow,
      refresh,
      onSuccess,
      onError,
      onStaleSkipped
    }
  })

  const queueRef = useRef([])
  const processingRef = useRef(false)

  const process = useCallback(async () => {
    if (processingRef.current) return
    processingRef.current = true
    while (queueRef.current.length > 0) {
      const task = queueRef.current.shift()
      const h = handlersRef.current
      try {
        await h.executor(task)
        h.onSuccess?.(task)
      } catch (err) {
        if (err?.code === 'STALE' && h.findFreshRow && h.refresh) {
          try {
            const fresh = await h.refresh()
            const freshRow = h.findFreshRow(fresh, task)
            if (freshRow?.rowIndex) {
              // id도 같이 갱신 (fresh 데이터의 id가 정본)
              const retried = {
                ...task,
                rowIndex: freshRow.rowIndex,
                id: freshRow.id ?? task.id ?? null
              }
              await h.executor(retried)
              h.onSuccess?.(retried)
              continue
            }
            // fresh에 같은 작업 없음 = 다른 경로로 이미 처리됨. 조용히 패스
            h.onStaleSkipped?.(task)
          } catch (retryErr) {
            h.onError?.(retryErr, task)
          }
        } else {
          h.onError?.(err, task)
        }
      }
    }
    processingRef.current = false
  }, [])

  const enqueue = useCallback(
    (task) => {
      queueRef.current.push(task)
      process()
    },
    [process]
  )

  return { enqueue }
}
