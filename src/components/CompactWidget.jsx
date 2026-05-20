import styles from './CompactWidget.module.css'

// S 사이즈 — 진짜 컴팩트. 가로형 단일 카드.
// 잔여 스케줄(큰 숫자) + 최근 갱신 시간 + 확대 버튼만.
// 그 외(아바타/날짜/공유대기/새로고침/설정/탭) 전부 생략.
// 자세히 보거나 액션하려면 확대 → L 모드로.
export default function CompactWidget({
  totalQty,
  lastUpdated,
  onExpand,
  hasData
}) {
  const timeText = lastUpdated
    ? `${String(lastUpdated.getHours()).padStart(2, '0')}:${String(lastUpdated.getMinutes()).padStart(2, '0')}`
    : '--:--'
  return (
    <div className={styles.card}>
      <span className={styles.count}>{hasData ? totalQty : '··'}</span>
      <div className={styles.textBlock}>
        <span className={styles.label}>잔여 스케줄</span>
        <span className={styles.time}>최근 갱신 {timeText}</span>
      </div>
      <button
        type="button"
        className={styles.expand}
        onClick={onExpand}
        aria-label="크게"
        title="크게"
      >
        <ExpandIcon />
      </button>
    </div>
  )
}

// 단일 사각형 — 윈도우 표준 '최대화' 톤
function ExpandIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="1.5" />
    </svg>
  )
}
