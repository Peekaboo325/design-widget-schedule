import { useMemo, useState } from 'react'
import styles from './App.module.css'
import SettingsPanel from './components/SettingsPanel.jsx'
import useSettings from './hooks/useSettings.js'

// 위젯 셸: 헤더(드래그·설정·새로고침) + 설정 패널 + 본문
// 본문은 1단계처럼 자리표시자 유지. 스케줄/공유대기는 4단계에서 채움
export default function App() {
  const todayLabel = useMemo(() => formatToday(new Date()), [])
  const [settingsOpen, setSettingsOpen] = useState(false)

  const {
    settings,
    ready,
    setAlwaysOnTop,
    setOpacity,
    setSize,
    setThemeColor
  } = useSettings()

  return (
    <div className={styles.widget} data-size={settings.size}>
      <header className={styles.header}>
        <span className={styles.date}>{todayLabel}</span>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={`${styles.iconBtn} ${settingsOpen ? styles.iconBtnActive : ''}`}
            aria-label="설정"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((v) => !v)}
          >
            ⚙
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="새로고침"
            onClick={() => {
              // 3단계: GAS API 새로고침 연결
            }}
          >
            ↻
          </button>
        </div>
      </header>

      {settingsOpen && ready && (
        <SettingsPanel
          settings={settings}
          onToggleAlwaysOnTop={setAlwaysOnTop}
          onChangeOpacity={setOpacity}
          onChangeThemeColor={setThemeColor}
          onChangeSize={setSize}
        />
      )}

      <main className={styles.body}>
        <p className={styles.placeholder}>크기: {settings.size}</p>
        <p className={styles.hint}>
          {settings.size === 'L'
            ? '스케줄·공유대기는 4단계에서 연결됩니다.'
            : '작은 크기 정보 단계는 4단계에서 채워집니다.'}
        </p>
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
