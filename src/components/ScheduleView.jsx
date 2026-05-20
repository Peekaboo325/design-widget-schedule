import styles from './ScheduleView.module.css'

// 스케줄 항목의 안정적 키 — '광고주|비고' 조합
export function scheduleKey(item) {
  return `${item?.['광고주'] ?? ''}|${item?.['비고'] ?? ''}`
}

// 상태별 chip 스타일
const STATUS_STYLE = {
  진행: styles.statusActive,
  대기: styles.statusWaiting,
  미정: styles.statusUndefined
}

// 사이즈별 정보 단계 — M 폐기, S/L 두 단계만
// S: 큰 숫자 + 공유 대기 뱃지
// L: 메트릭 카드 + 행 카드 리스트 + 공유 대기 풋터
// 로딩 스켈레톤 — 실제 레이아웃과 같은 모양으로 placeholder
export function ScheduleSkeleton({ size }) {
  if (size === 'L') {
    return (
      <div className={styles.containerL}>
        <div className={`${styles.skMetric} skeleton`} />
        <div className={styles.cardList}>
          <div className={`${styles.skRow} skeleton`} />
          <div className={`${styles.skRow} skeleton`} />
          <div className={`${styles.skRow} skeleton`} />
        </div>
        <div className={`${styles.skFooter} skeleton`} />
      </div>
    )
  }
  return (
    <div className={styles.containerS}>
      <div className={styles.skBigMetric}>
        <div className={`${styles.skBigLabel} skeleton`} />
        <div className={`${styles.skBigValue} skeleton`} />
      </div>
      <div className={`${styles.skBadge} skeleton`} />
    </div>
  )
}

export default function ScheduleView({
  size,
  data,
  newKeys,
  onStatusClick,
  onPendingClick
}) {
  const { schedule, pending, summary } = data

  if (size === 'L') {
    return (
      <div className={styles.containerL}>
        <MetricCard count={schedule.length} />
        <CardList
          schedule={schedule}
          newKeys={newKeys}
          onStatusClick={onStatusClick}
        />
        <PendingFooter pending={pending} onClick={onPendingClick} />
      </div>
    )
  }

  // S
  return (
    <div className={styles.containerS}>
      <div className={styles.bigMetric}>
        <span className={styles.bigLabel}>잔여 스케줄</span>
        <span className={styles.bigValue}>{summary.total}</span>
      </div>
      <PendingBadge count={summary.pending} />
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

// L 메트릭 카드 — 옅은 액센트 배경 + 캘린더 아이콘 + 라벨 + 큰 카운트
function MetricCard({ count }) {
  return (
    <div className={styles.metricCard}>
      <span className={styles.metricIcon}>
        <CalendarIcon />
      </span>
      <span className={styles.metricLabel}>잔여 스케줄</span>
      <span className={styles.metricCount}>
        {count}
        <span className={styles.metricUnit}>건</span>
      </span>
    </div>
  )
}

// L 행 카드 리스트
function CardList({ schedule, newKeys, onStatusClick }) {
  if (schedule.length === 0) {
    return (
      <div className={styles.listEmpty}>
        <p className={styles.empty}>처리할 작업 없음</p>
      </div>
    )
  }
  return (
    <div className={styles.cardList}>
      {schedule.map((item, i) => {
        const isNew = newKeys?.has(scheduleKey(item))
        return (
          <div key={i} className={styles.rowCard}>
            <span
              className={`${styles.rowDot} ${isNew ? styles.rowDotNew : ''}`}
              aria-label={isNew ? '새 항목' : undefined}
            />
            <span className={styles.rowClient} title={item['광고주']}>
              {item['광고주']}
            </span>
            <span className={styles.rowNote} title={item['비고']}>
              {item['비고']}
            </span>
            <span className={styles.rowQty}>{item['수량']}</span>
            <button
              type="button"
              className={`${styles.chip} ${STATUS_STYLE[item['상태']] ?? ''}`}
              title="클릭하면 다음 상태로"
              onClick={() => onStatusClick?.(item)}
            >
              {item['상태']}
            </button>
          </div>
        )
      })}
    </div>
  )
}

// L 공유 대기 풋터 — 사람 아이콘 + 라벨 + 카운트 알약 + 화살표
function PendingFooter({ pending, onClick }) {
  const empty = pending.length === 0
  return (
    <button
      type="button"
      className={`${styles.pendingFooter} ${empty ? styles.pendingFooterEmpty : ''}`}
      onClick={() => !empty && onClick?.()}
      disabled={empty}
      title={empty ? undefined : '클릭하면 목록 펼침'}
    >
      <span className={styles.pendingFooterIcon}>
        <MailIcon />
      </span>
      <span className={styles.pendingFooterLabel}>공유 대기</span>
      <span className={styles.pendingFooterCount}>{pending.length}건</span>
      {!empty && <span className={styles.pendingFooterArrow}>›</span>}
    </button>
  )
}

function CalendarIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

// 공유 대기 = 메일 발송 대기. 봉투 아이콘이 의미상 직관적
function MailIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  )
}
