import styles from './ScheduleView.module.css'

// 스케줄 항목의 안정적 키 — '광고주|비고' 조합
// NEW 추적, seenScheduleKeys 비교에 공통 사용
export function scheduleKey(item) {
  return `${item?.['광고주'] ?? ''}|${item?.['비고'] ?? ''}`
}

// 상태 → 색상 매핑
const STATUS_STYLE = {
  진행: styles.statusActive,
  대기: styles.statusWaiting,
  미정: styles.statusUndefined
}

// 사이즈별 정보 단계 렌더링
// S: 큰 숫자 + 공유 대기 뱃지
// M: 광고주별 합계 + 공유 대기 뱃지
// L: 전체 테이블 + 구분선 + 공유 대기 목록
export default function ScheduleView({ size, data, newKeys, onStatusClick }) {
  const { schedule, pending, summary } = data

  if (size === 'L') {
    return (
      <div className={styles.containerL}>
        <ScheduleTable
          schedule={schedule}
          newKeys={newKeys}
          onStatusClick={onStatusClick}
        />
        <PendingRow pending={pending} />
      </div>
    )
  }

  return (
    <div className={styles.containerSM}>
      {size === 'S' ? (
        <SmallSummary total={summary.total} />
      ) : (
        <MediumSummary schedule={schedule} total={summary.total} />
      )}
      <PendingBadge count={summary.pending} />
    </div>
  )
}

function SmallSummary({ total }) {
  return (
    <div className={styles.bigMetric}>
      <span className={styles.bigLabel}>잔여 스케줄</span>
      <span className={styles.bigValue}>{total}</span>
    </div>
  )
}

function MediumSummary({ schedule, total }) {
  const grouped = groupByClient(schedule)
  return (
    <div className={styles.mediumStack}>
      <div className={styles.mediumHeader}>
        <span className={styles.mediumLabel}>잔여 스케줄</span>
        <span className={styles.mediumTotal}>{total}건</span>
      </div>
      {grouped.length === 0 ? (
        <p className={styles.empty}>처리할 작업 없음</p>
      ) : (
        <ul className={styles.clientList}>
          {grouped.map((g) => (
            <li key={g.client} className={styles.clientItem}>
              <span className={styles.clientName} title={g.client}>
                {g.client}
              </span>
              <span className={styles.clientCount}>{g.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function PendingBadge({ count }) {
  const dim = count === 0
  return (
    <div className={`${styles.pendingBadge} ${dim ? styles.pendingBadgeDim : ''}`}>
      <span className={styles.pendingDot} />
      <span className={styles.pendingText}>
        공유 대기 <strong>{count}</strong>건
      </span>
    </div>
  )
}

function ScheduleTable({ schedule, newKeys, onStatusClick }) {
  if (schedule.length === 0) {
    return (
      <div className={styles.tableEmpty}>
        <p className={styles.empty}>처리할 작업 없음</p>
      </div>
    )
  }
  // NEW 항목이 하나라도 있을 때만 dot 컬럼 노출 → 평소엔 광고주가 좌측 끝
  const hasAnyNew = (newKeys?.size ?? 0) > 0
  return (
    <div className={styles.tableWrap}>
      <div className={styles.sectionHead}>
        <span className={styles.sectionLabel}>잔여 스케줄</span>
        <span className={styles.sectionCount}>{schedule.length}건</span>
      </div>
      <ul className={`${styles.table} ${hasAnyNew ? '' : styles.tableNoMarker}`}>
        {schedule.map((item, i) => {
          const isNew = newKeys?.has(scheduleKey(item))
          return (
            <li key={i} className={styles.tableRow}>
              {hasAnyNew && (
                <span
                  className={`${styles.cellMarker} ${isNew ? styles.cellMarkerNew : ''}`}
                  aria-label={isNew ? '새 항목' : undefined}
                />
              )}
              <span className={styles.cellClient} title={item['광고주']}>
                {item['광고주']}
              </span>
              <span className={styles.cellNote} title={item['비고']}>
                {item['비고']}
              </span>
              <span className={styles.cellQty}>{item['수량']}</span>
              <button
                type="button"
                className={`${styles.cellStatus} ${styles.cellStatusBtn} ${
                  STATUS_STYLE[item['상태']] ?? ''
                }`}
                title="클릭하면 다음 상태로"
                onClick={() => onStatusClick?.(item)}
              >
                {item['상태']}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// L 모드 공유 대기: 한 줄 요약 (라벨 + 카운트)
// 위계상 부차 정보라 목록 없이 숫자만 노출
function PendingRow({ pending }) {
  return (
    <div className={styles.pendingRow}>
      <span className={styles.pendingRowLabel}>공유 대기</span>
      <span className={styles.pendingRowCount}>{pending.length}건</span>
    </div>
  )
}

// 광고주별 합계 (M 사이즈 전용) — 원본 순서 유지
function groupByClient(schedule) {
  const map = new Map()
  for (const item of schedule) {
    const key = item['광고주'] ?? '(미지정)'
    map.set(key, (map.get(key) ?? 0) + (Number(item['수량']) || 1))
  }
  return Array.from(map.entries()).map(([client, count]) => ({ client, count }))
}
