import { useEffect, useRef } from 'react'
import styles from './PendingPopover.module.css'

// 공유 대기 팝오버 — 한 줄 카운트 클릭 시 펼침
// 각 행에 ✓ 체크박스, 클릭 시 onCheck(item) 호출 (낙관적 제거 + 시트 쓰기)
// 외부 클릭 / ESC로 닫힘
export default function PendingPopover({ pending, onCheck, onClose }) {
  const rootRef = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) onClose()
    }
    function handleKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  return (
    <div
      ref={rootRef}
      className={styles.popover}
      role="dialog"
      aria-label="공유 대기 목록"
    >
      <div className={styles.head}>
        <span className={styles.title}>공유 대기 {pending.length}건</span>
        <span className={styles.hint}>체크하면 공유 처리</span>
      </div>
      <ul className={styles.list}>
        {pending.map((item, i) => (
          <li key={`${item.rowIndex ?? i}`} className={styles.row}>
            <button
              type="button"
              className={styles.checkbox}
              aria-label={`${item['광고주']} 공유 처리`}
              onClick={() => onCheck?.(item)}
            />
            <span className={styles.client} title={item['광고주']}>
              {item['광고주']}
            </span>
            <span className={styles.note} title={item['비고']}>
              {item['비고']}
            </span>
            <span className={styles.qty}>{item['수량']}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
