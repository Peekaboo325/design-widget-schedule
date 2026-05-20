import { useEffect } from 'react'
import styles from './PendingPanel.module.css'

// 공유 대기 패널 — 본문 풀스크린 차지. 풋터의 '>' 화살표 의미에 맞춰
// 우측에서 슬라이드 인. 행 클릭(체크박스)으로 공유 처리.
// ESC로 뒤로.
export default function PendingPanel({ pending, onCheck, onBack }) {
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onBack()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onBack])

  const totalQty = pending.reduce(
    (acc, it) => acc + (Number(it?.['수량']) || 1),
    0
  )

  return (
    <div className={styles.panel} role="dialog" aria-label="공유 대기">
      <div className={styles.head}>
        <button
          type="button"
          className={styles.backBtn}
          onClick={onBack}
          aria-label="뒤로"
        >
          <BackIcon />
        </button>
        <span className={styles.title}>
          공유 대기 <span className={styles.count}>{totalQty}건</span>
        </span>
      </div>

      {pending.length === 0 ? (
        <p className={styles.empty}>처리할 항목 없음</p>
      ) : (
        <div className={styles.list}>
          {pending.map((item, i) => (
            <button
              key={`${item.rowIndex ?? i}`}
              type="button"
              className={styles.row}
              onClick={() => onCheck?.(item)}
              title="클릭하면 공유 처리"
            >
              <span className={styles.checkbox} aria-hidden="true" />
              <span className={styles.client} title={item['광고주']}>
                {item['광고주']}
              </span>
              <span className={styles.note} title={item['비고']}>
                {item['비고']}
              </span>
              <span className={styles.qty}>
                {Number(item['수량']) > 1 ? `${item['수량']}건` : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function BackIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}
