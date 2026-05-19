import styles from './ScheduleView.module.css'

// 상태 → 색상 매핑 (테마와 무관한 의미색)
const STATUS_STYLE = {
  진행: styles.statusActive,
  대기: styles.statusWaiting,
  미정: styles.statusUndefined
}

// 사이즈별 정보 단계 렌더링
// S: 큰 숫자 + 공유 대기 뱃지
// M: 광고주별 합계 + 공유 대기 뱃지
// L: 전체 테이블 + 구분선 + 공유 대기 목록
export default function ScheduleView({ size, data, loading }) {
  const { schedule, pending, summary } = data

  if (size === 'L') {
    return (
      <div className={styles.containerL}>
        <ScheduleTable schedule={schedule} loading={loading} />
        <div className={styles.divider} />
        <PendingList pending={pending} />
      </div>
    )
  }

  // S / M 공통: 상단 카운트 + 공유 대기 뱃지
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

// S: 큰 숫자 하나
function SmallSummary({ total }) {
  return (
    <div className={styles.bigMetric}>
      <span className={styles.bigLabel}>잔여 스케줄</span>
      <span className={styles.bigValue}>{total}</span>
    </div>
  )
}

// M: 광고주별 합계 + 총합
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

// 공유 대기 뱃지 (S/M 공용)
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

// L: 잔여 스케줄 전체 테이블
function ScheduleTable({ schedule, loading }) {
  if (schedule.length === 0) {
    return (
      <div className={styles.tableEmpty}>
        <p className={styles.empty}>처리할 작업 없음</p>
      </div>
    )
  }
  return (
    <div className={styles.tableWrap}>
      <div className={styles.sectionHead}>
        <span className={styles.sectionLabel}>잔여 스케줄</span>
        <span className={styles.sectionCount}>{schedule.length}건</span>
      </div>
      <ul className={styles.table}>
        {schedule.map((item, i) => (
          <li key={i} className={styles.tableRow}>
            <span className={styles.cellClient} title={item['광고주']}>
              {item['광고주']}
            </span>
            <span className={styles.cellNote} title={item['비고']}>
              {item['비고']}
            </span>
            <span className={styles.cellQty}>{item['수량']}</span>
            <span
              className={`${styles.cellStatus} ${
                STATUS_STYLE[item['상태']] ?? ''
              }`}
            >
              {item['상태']}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// L: 공유 대기 목록
function PendingList({ pending }) {
  return (
    <div className={styles.tableWrap}>
      <div className={styles.sectionHead}>
        <span className={styles.sectionLabel}>공유 대기</span>
        <span className={styles.sectionCount}>{pending.length}건</span>
      </div>
      {pending.length > 0 && (
        <ul className={styles.table}>
          {pending.map((item, i) => (
            <li key={i} className={styles.tableRow}>
              <span className={styles.cellClient} title={item['광고주']}>
                {item['광고주']}
              </span>
              <span className={styles.cellNote} title={item['비고']}>
                {item['비고']}
              </span>
              <span className={styles.cellQty}>{item['수량']}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// 광고주별 합계 (M 사이즈 전용)
// 스케줄러 원본 순서를 유지 — 첫 등장 순으로 누적
function groupByClient(schedule) {
  const map = new Map()
  for (const item of schedule) {
    const key = item['광고주'] ?? '(미지정)'
    map.set(key, (map.get(key) ?? 0) + (Number(item['수량']) || 1))
  }
  return Array.from(map.entries()).map(([client, count]) => ({ client, count }))
}
