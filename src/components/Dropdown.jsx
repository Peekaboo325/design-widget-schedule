import { useEffect, useRef, useState } from 'react'
import styles from './Dropdown.module.css'

// 테마 컬러가 반영되는 커스텀 드롭다운
// 네이티브 select는 옵션 목록을 OS가 그리므로 완전 커스텀 불가 → 직접 구현
// props:
//   value: 현재 선택값
//   options: string[] 또는 { value, label }[]
//   onChange: (value) => void
//   placeholder: 미선택 시 표시 문구
export default function Dropdown({ value, options, onChange, placeholder = '선택…' }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  // 외부 클릭 / ESC 닫기
  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    function handleKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const items = options.map((opt) =>
    typeof opt === 'string' ? { value: opt, label: opt } : opt
  )
  const current = items.find((o) => o.value === value)

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={current ? styles.triggerLabel : styles.triggerPlaceholder}>
          {current ? current.label : placeholder}
        </span>
        <span className={`${styles.caret} ${open ? styles.caretOpen : ''}`}>▾</span>
      </button>

      {open && (
        <ul className={styles.menu} role="listbox">
          {items.map((opt) => {
            const active = opt.value === value
            return (
              <li key={opt.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`${styles.option} ${active ? styles.optionActive : ''}`}
                  onClick={() => {
                    onChange(opt.value)
                    setOpen(false)
                  }}
                >
                  {opt.label}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
