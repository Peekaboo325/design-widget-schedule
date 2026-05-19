import { useState } from 'react'
import styles from './MemberPicker.module.css'

// 최초 실행 시 본인 선택 화면
// 본문 전체를 덮음. 선택 즉시 저장되고 일반 위젯 화면으로 전환.
export default function MemberPicker({ members, onSelect, loading, error }) {
  const [hoveredIdx, setHoveredIdx] = useState(null)

  if (loading) {
    return (
      <div className={styles.container}>
        <p className={styles.muted}>팀원 목록 불러오는 중…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.container}>
        <p className={styles.error}>
          팀원 목록 로드 실패: {String(error.message ?? error)}
        </p>
        <p className={styles.muted}>위젯을 다시 실행해 보세요.</p>
      </div>
    )
  }

  if (members.length === 0) {
    return (
      <div className={styles.container}>
        <p className={styles.muted}>등록된 팀원이 없습니다.</p>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.heading}>
        <h2 className={styles.title}>본인을 선택하세요</h2>
        <p className={styles.subtitle}>설정에서 언제든 변경할 수 있어요</p>
      </div>
      <ul className={styles.list}>
        {members.map((name, i) => (
          <li key={name}>
            <button
              type="button"
              className={`${styles.item} ${hoveredIdx === i ? styles.itemHover : ''}`}
              onClick={() => onSelect(name)}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
