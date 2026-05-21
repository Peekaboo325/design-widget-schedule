import styles from './CompactWidget.module.css'

// S 사이즈 — 진짜 컴팩트. 가로형 단일 카드.
// 잔여 스케줄(큰 숫자) + 최근 갱신 시간만.
// 자세히 보거나 액션하려면 더블클릭 → L 모드.
// (drag region 위에서는 React 이벤트 안 잡혀서 텍스트/숫자 wrapper만 no-drag)
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
      <div
        className={styles.content}
        onDoubleClick={onExpand}
        title="더블클릭으로 크게"
      >
        <span className={styles.count}>{hasData ? totalQty : '··'}</span>
        <div className={styles.textBlock}>
          <span className={styles.label}>잔여 스케줄</span>
          <span className={styles.time}>최근 갱신 {timeText}</span>
        </div>
      </div>
    </div>
  )
}
