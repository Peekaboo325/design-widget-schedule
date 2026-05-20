import { useEffect } from 'react'
import styles from './Toast.module.css'

// 단일 토스트 — 5초 자동 사라짐, action 버튼 옵션
// props.toast 가 null이면 미렌더
// props.toast = { key, message, code?, action?: { label, onClick }, tone?: 'info'|'error' }
//   code (E01~E99): 에러 토스트일 때 우측에 작게 표시. 팀원이 진단용 코드만 알려줘도 OK
export default function Toast({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(onDismiss, 5000)
    return () => clearTimeout(id)
  }, [toast?.key, onDismiss])

  if (!toast) return null
  const tone = toast.tone === 'error' ? styles.toastError : styles.toastInfo

  return (
    <div className={`${styles.toast} ${tone}`} role="status" aria-live="polite">
      <span className={styles.message}>{toast.message}</span>
      {toast.code && <span className={styles.code}>{toast.code}</span>}
      {toast.action && (
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            toast.action.onClick?.()
            onDismiss()
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  )
}
