import { useMemo } from 'react'
import styles from './App.module.css'

// 1단계 검증용 더미 셸: 헤더(드래그 핸들) + 본문 자리표시자
// 실제 스케줄/공유대기/체크리스트 렌더링은 2~5단계에서 채움
export default function App() {
  const todayLabel = useMemo(() => formatToday(new Date()), [])

  return (
    <div className={styles.widget}>
      <header className={styles.header}>
        <span className={styles.date}>{todayLabel}</span>
        <button
          type="button"
          className={styles.refresh}
          aria-label="새로고침"
          onClick={() => {
            // 2단계: 수동 새로고침 로직 연결
          }}
        >
          ↻
        </button>
      </header>

      <main className={styles.body}>
        <p className={styles.placeholder}>1단계 셋업 완료</p>
        <p className={styles.hint}>헤더 영역을 드래그하면 창이 이동합니다.</p>
      </main>
    </div>
  )
}

// 예: "5월 19일 (월)"
function formatToday(date) {
  const month = date.getMonth() + 1
  const day = date.getDate()
  const weekdays = ['일', '월', '화', '수', '목', '금', '토']
  return `${month}월 ${day}일 (${weekdays[date.getDay()]})`
}
