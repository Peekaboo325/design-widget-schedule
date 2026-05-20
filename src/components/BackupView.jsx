import { useMemo, useState } from 'react'
import styles from './BackupView.module.css'

// 백업 관리 뷰 — 💚완료 시트에서 백업 미체크 행을 표시
// 그룹화 토글: 마감일 / 광고주
// 각 행 우측 '완료' 버튼 클릭으로 M열 TRUE 토글

function sumQty(items) {
  return (items ?? []).reduce(
    (acc, it) => acc + (Number(it?.['수량']) || 1),
    0
  )
}

function formatDueHeader(key) {
  if (key === '미정') return '마감일 미정'
  const [y, m, d] = key.split('-').map(Number)
  if (!y || !m || !d) return key
  const date = new Date(y, m - 1, d)
  const weekdays = ['일', '월', '화', '수', '목', '금', '토']
  return `${m}월 ${d}일(${weekdays[date.getDay()]})`
}

// 그룹 정렬 — 마감일: 빠른 날짜 먼저 / 광고주: 가나다순 (둘 다 '미정'은 맨 뒤)
function groupBy(items, mode) {
  const map = new Map()
  for (const item of items) {
    const key = mode === 'due'
      ? (item['마감일'] ?? '미정')
      : (item['광고주']?.trim() || '미정')
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(item)
  }
  return Array.from(map.entries()).sort(([a], [b]) => {
    if (a === '미정') return 1
    if (b === '미정') return -1
    return a.localeCompare(b)
  })
}

export default function BackupView({ backup, onBackupCheck }) {
  const [groupMode, setGroupMode] = useState('due') // 'due' | 'client'
  const totalQty = sumQty(backup)
  const groups = useMemo(() => groupBy(backup, groupMode), [backup, groupMode])

  return (
    <div className={styles.container}>
      <div className={styles.metricCard}>
        <span className={styles.metricLabel}>백업 대기</span>
        <span className={styles.metricCount}>
          {totalQty}
          <span className={styles.metricUnit}>건</span>
        </span>
      </div>

      <div className={styles.toolbar}>
        <button
          type="button"
          className={`${styles.toolBtn} ${groupMode === 'due' ? styles.toolBtnActive : ''}`}
          onClick={() => setGroupMode('due')}
        >
          마감일순
        </button>
        <button
          type="button"
          className={`${styles.toolBtn} ${groupMode === 'client' ? styles.toolBtnActive : ''}`}
          onClick={() => setGroupMode('client')}
        >
          광고주순
        </button>
      </div>

      {backup.length === 0 ? (
        <div className={styles.listEmpty}>
          <p className={styles.empty}>백업 대기 항목 없음</p>
        </div>
      ) : (
        <div className={styles.cardList}>
          {groups.map(([key, items]) => (
            <div key={key} className={styles.group}>
              <div
                className={`${styles.groupHeader} ${key === '미정' ? styles.groupHeaderMuted : ''}`}
              >
                {groupMode === 'due' ? formatDueHeader(key) : key}
                <span className={styles.groupCount}>{sumQty(items)}건</span>
              </div>
              {items.map((item, i) => (
                <div key={`${key}-${i}`} className={styles.rowCard}>
                  <span className={styles.rowClient} title={item['광고주']}>
                    {item['광고주']}
                  </span>
                  <span className={styles.rowNote} title={item['비고']}>
                    {item['비고']}
                  </span>
                  <span className={styles.rowQty}>
                    {Number(item['수량']) > 1 ? `${item['수량']}건` : ''}
                  </span>
                  <button
                    type="button"
                    className={styles.doneBtn}
                    onClick={() => onBackupCheck?.(item)}
                    title="백업 완료 처리"
                  >
                    완료
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
