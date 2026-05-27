import styles from './ScheduleView.module.css'
import { sumQty } from '../lib/format.js'

// 스케줄 항목의 안정적 unique 키 — GAS가 부여한 시트 L열 UUID
// (v0.2.4: 시트의 행 위치·내용 변경·시트 간 이관 모두에서 stable)
// fallback: 구버전 GAS 호환 (응답에 id 없으면 요청일+광고주+비고로 임시 키)
export function scheduleKey(item) {
  if (item?.id) return item.id
  return `${item?.due ?? ''}|${item?.['광고주'] ?? ''}|${item?.['비고'] ?? ''}`
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
  onPendingClick,
  onCopyNote,
  onMarkSeen
}) {
  const { schedule, pending } = data
  const totalQty = sumQty(schedule)
  const pendingQty = sumQty(pending)

  if (size === 'L') {
    return (
      <div className={styles.containerL}>
        <MetricCard count={totalQty} />
        <CardList
          schedule={schedule}
          newKeys={newKeys}
          onStatusClick={onStatusClick}
          onCopyNote={onCopyNote}
          onMarkSeen={onMarkSeen}
        />
        <PendingFooter count={pendingQty} onClick={onPendingClick} />
      </div>
    )
  }

  // S
  return (
    <div className={styles.containerS}>
      <div className={styles.bigMetric}>
        <span className={styles.bigLabel}>잔여 스케줄</span>
        <span className={styles.bigValue}>{totalQty}</span>
      </div>
      <PendingBadge count={pendingQty} />
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

// L 메트릭 카드 — 옅은 액센트 배경 + 라벨 + 큰 카운트
function MetricCard({ count }) {
  return (
    <div className={styles.metricCard}>
      <span className={styles.metricLabel}>잔여 스케줄</span>
      <span className={styles.metricCount}>
        {count}
        <span className={styles.metricUnit}>건</span>
      </span>
    </div>
  )
}

// 마감일별로 그룹핑 (정렬: 이른 날짜부터, '미정'은 맨 뒤)
function groupByDue(schedule) {
  const map = new Map()
  for (const item of schedule) {
    const key = item.due ?? '미정'
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(item)
  }
  return Array.from(map.entries()).sort(([a], [b]) => {
    if (a === '미정') return 1
    if (b === '미정') return -1
    return a.localeCompare(b) // YYYY-MM-DD 사전순 = 날짜순
  })
}

// '5월 18일(월)까지 마감' / '마감일 미정'
function formatDueHeader(key) {
  if (key === '미정') return '마감일 미정'
  const [y, m, d] = key.split('-').map(Number)
  if (!y || !m || !d) return key
  const date = new Date(y, m - 1, d)
  const weekdays = ['일', '월', '화', '수', '목', '금', '토']
  return `${m}월 ${d}일(${weekdays[date.getDay()]})까지 마감`
}

// L 행 카드 리스트 — 마감일 그룹별로 묶음
// NEW dot은 grid 컬럼이 아니라 카드 위 absolute로 떠 있음 →
// NEW 발생/소멸 시 다른 행 정렬에 영향 없음 (개별 레이아웃만 변경)
function CardList({ schedule, newKeys, onStatusClick, onCopyNote, onMarkSeen }) {
  if (schedule.length === 0) {
    return (
      <div className={styles.listEmpty}>
        <p className={styles.empty}>처리할 작업 없음</p>
      </div>
    )
  }
  const groups = groupByDue(schedule)
  return (
    <div className={styles.cardList}>
      {groups.map(([dueKey, items]) => (
        <div key={dueKey} className={styles.dueGroup}>
          <div
            className={`${styles.dueHeader} ${dueKey === '미정' ? styles.dueHeaderMuted : ''}`}
          >
            {formatDueHeader(dueKey)}
          </div>
          {items.map((item, i) => {
            const isNew = newKeys?.has(scheduleKey(item))
            // NEW 카드는 어디든 클릭 시 seen 처리 (펄스 해제).
            // 내부 버튼(상태/메모) 클릭도 bubble로 함께 발동 — Set 기반이라 idempotent
            const handleCardClick = isNew
              ? () => onMarkSeen?.(scheduleKey(item))
              : undefined
            return (
              <div
                key={`${dueKey}-${i}`}
                className={styles.rowCard}
                onClick={handleCardClick}
              >
                {isNew && (
                  <span className={styles.rowDot} aria-label="새 항목" />
                )}
                <span className={styles.rowClient} title={item['광고주']}>
                  {item['광고주']}
                </span>
                {item.noteText ? (
                  <button
                    type="button"
                    className={`${styles.rowNote} ${styles.rowNoteClickable}`}
                    onClick={() => onCopyNote?.(item.noteText)}
                    title={item['비고']}
                  >
                    {item['비고']}
                  </button>
                ) : (
                  <span className={styles.rowNote} title={item['비고']}>
                    {item['비고']}
                  </span>
                )}
                <span className={styles.rowQty}>
                  {Number(item['수량']) > 1 ? `${item['수량']}건` : ''}
                </span>
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
      ))}
    </div>
  )
}

// L 공유 대기 풋터 — 메일 아이콘 + 라벨 + 카운트 알약 + 화살표
function PendingFooter({ count, onClick }) {
  const empty = count === 0
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
      <span className={styles.pendingFooterCount}>{count}건</span>
      {!empty && <span className={styles.pendingFooterArrow}>›</span>}
    </button>
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
