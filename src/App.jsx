import { useMemo, useState } from 'react'
import styles from './App.module.css'
import SettingsPanel from './components/SettingsPanel.jsx'
import ScheduleView from './components/ScheduleView.jsx'
import useSettings from './hooks/useSettings.js'
import useMembers from './hooks/useMembers.js'
import useSchedule from './hooks/useSchedule.js'

// 위젯 셸: 헤더(드래그·설정·새로고침) + 설정 패널 + 본문
// 3단계: GAS API 연결. 멤버 선택 UI는 6단계라, 잠정적으로 members[0] 사용.
// 본문의 사이즈별 정보 단계 렌더링은 4단계에서 구현.
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

  // 팀원 목록 + 임시 자동 선택
  const { members, loading: membersLoading, error: membersError } = useMembers()
  const activeMember = members[0] ?? null

  // 활성 멤버의 스케줄/공유대기
  const {
    data: scheduleData,
    loading: scheduleLoading,
    error: scheduleError,
    lastUpdated,
    refresh
  } = useSchedule(activeMember)

  const refreshing = scheduleLoading

  return (
    <div className={styles.widget} data-size={settings.size}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.date}>{todayLabel}</span>
          {activeMember && (
            <span className={styles.member}>{activeMember}</span>
          )}
        </div>
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
            className={`${styles.iconBtn} ${refreshing ? styles.iconBtnSpinning : ''}`}
            aria-label="새로고침"
            disabled={!activeMember || refreshing}
            onClick={() => refresh()}
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
        <Body
          size={settings.size}
          membersLoading={membersLoading}
          membersError={membersError}
          activeMember={activeMember}
          scheduleData={scheduleData}
          scheduleLoading={scheduleLoading}
          scheduleError={scheduleError}
        />
      </main>
      {lastUpdated && !scheduleError && (
        <footer className={styles.footer}>
          마지막 갱신 {formatTime(lastUpdated)}
          {scheduleLoading ? ' · 갱신 중…' : ''}
        </footer>
      )}
    </div>
  )
}

// 본문 분기: 로딩/에러/빈 상태 + 정상 데이터는 사이즈별 ScheduleView로 위임
function Body({
  size,
  membersLoading,
  membersError,
  activeMember,
  scheduleData,
  scheduleLoading,
  scheduleError
}) {
  if (membersLoading) return <p className={styles.muted}>팀원 목록 불러오는 중…</p>
  if (membersError) {
    return (
      <p className={styles.error}>
        팀원 목록 로드 실패: {String(membersError.message ?? membersError)}
      </p>
    )
  }
  if (!activeMember) return <p className={styles.muted}>등록된 팀원이 없습니다.</p>

  if (scheduleError) {
    return (
      <div>
        <p className={styles.error}>
          스케줄 로드 실패: {String(scheduleError.message ?? scheduleError)}
        </p>
        <p className={styles.muted}>↻ 버튼으로 재시도하세요.</p>
      </div>
    )
  }

  if (!scheduleData) {
    return <p className={styles.muted}>스케줄 불러오는 중…</p>
  }

  return <ScheduleView size={size} data={scheduleData} loading={scheduleLoading} />
}

// 예: "5월 19일 (월)"
function formatToday(date) {
  const month = date.getMonth() + 1
  const day = date.getDate()
  const weekdays = ['일', '월', '화', '수', '목', '금', '토']
  return `${month}월 ${day}일 (${weekdays[date.getDay()]})`
}

// 예: "14:23"
function formatTime(date) {
  const h = String(date.getHours()).padStart(2, '0')
  const m = String(date.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}
