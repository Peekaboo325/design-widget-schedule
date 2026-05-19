import styles from './Avatar.module.css'

// 원형 프로필 아바타 — 이모지 1자
// 클릭 가능하면 onClick 전달, 아니면 일반 div
export default function Avatar({ emoji, size = 40, onClick, title }) {
  const inner = emoji || '🙂'
  if (onClick) {
    return (
      <button
        type="button"
        className={styles.avatar}
        onClick={onClick}
        title={title}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.6) }}
      >
        {inner}
      </button>
    )
  }
  return (
    <div
      className={styles.avatar}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.6) }}
      title={title}
    >
      {inner}
    </div>
  )
}
