import { useCallback, useEffect, useMemo, useState } from 'react'
import styles from './App.module.css'
import SettingsPanel from './components/SettingsPanel.jsx'
import ScheduleView from './components/ScheduleView.jsx'
import ChecklistView from './components/ChecklistView.jsx'
import MemberPicker from './components/MemberPicker.jsx'
import useSettings from './hooks/useSettings.js'
import useMembers from './hooks/useMembers.js'
import useSchedule from './hooks/useSchedule.js'

// 위젯 셸: 헤더(드래그·설정·새로고침) + 설정 패널 + 본문(탭 전환)
// 5단계: L 사이즈에서 점검 체크리스트 탭 활성화.
export default function App() {
  const todayLabel = useMemo(() => formatToday(new Date()), [])
  const [settingsOpen, setSettingsOpen] = useState(false)

  // 활성 탭: 'schedule' | 'checklist'
  // SPEC: 체크리스트 탭은 L 사이즈에서만 노출. S/M으로 가면 강제로 스케줄로 복귀.
  const [activeTab, setActiveTab] = useState('schedule')

  // 체크리스트 상태 — { 'sectionId:idx': true, ... }
  // SPEC: 저장 없음. 컴포넌트 메모리에만.
  const [checked, setChecked] = useState({})

  const toggleChecked = useCallback((key) => {
    setChecked((prev) => {
      const next = { ...prev }
      if (next[key]) delete next[key]
      else next[key] = true
      return next
    })
  }, [])

  const resetChecked = useCallback(() => setChecked({}), [])

  const {
    settings,
    ready,
    setAlwaysOnTop,
    setOpacity,
    setSize,
    setThemeColor,
    setActiveMember
  } = useSettings()

  // L이 아닐 때 체크리스트 탭에 머물러 있으면 강제 복귀
  useEffect(() => {
    if (settings.size !== 'L' && activeTab !== 'schedule') {
      setActiveTab('schedule')
    }
  }, [settings.size, activeTab])

  // 팀원 목록
  const { members, loading: membersLoading, error: membersError } = useMembers()

  // 저장된 멤버가 현재 목록에 없으면 stale로 간주 (입퇴사 대비)
  const savedMember = settings.activeMember
  const memberInList =
    savedMember && members.length > 0 ? members.includes(savedMember) : false
  const activeMember = memberInList ? savedMember : null

  // 저장값이 목록에 없을 때 자동으로 null 처리 (재선택 유도)
  useEffect(() => {
    if (ready && savedMember && members.length > 0 && !memberInList) {
      setActiveMember(null)
    }
  }, [ready, savedMember, members, memberInList, setActiveMember])

  // 활성 멤버의 스케줄/공유대기
  const {
    data: scheduleData,
    loading: scheduleLoading,
    error: scheduleError,
    lastUpdated,
    refresh
  } = useSchedule(activeMember)

  const refreshing = scheduleLoading
  const needsMemberPick = ready && !activeMember
  const showTabs = settings.size === 'L' && !needsMemberPick
  const showFooter =
    !needsMemberPick &&
    activeTab === 'schedule' &&
    lastUpdated &&
    !scheduleError

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
          {activeTab === 'schedule' && !needsMemberPick && (
            <button
              type="button"
              className={`${styles.iconBtn} ${refreshing ? styles.iconBtnSpinning : ''}`}
              aria-label="새로고침"
              disabled={!activeMember || refreshing}
              onClick={() => refresh()}
            >
              ↻
            </button>
          )}
        </div>
      </header>

      {settingsOpen && ready && (
        <SettingsPanel
          settings={settings}
          members={members}
          onChangeMember={setActiveMember}
          onToggleAlwaysOnTop={setAlwaysOnTop}
          onChangeOpacity={setOpacity}
          onChangeThemeColor={setThemeColor}
          onChangeSize={setSize}
        />
      )}

      {showTabs && (
        <nav className={styles.tabs}>
          <TabButton
            label="스케줄"
            active={activeTab === 'schedule'}
            onClick={() => setActiveTab('schedule')}
          />
          <TabButton
            label="점검"
            active={activeTab === 'checklist'}
            onClick={() => setActiveTab('checklist')}
          />
        </nav>
      )}

      <main className={styles.body}>
        {needsMemberPick ? (
          <MemberPicker
            members={members}
            loading={membersLoading}
            error={membersError}
            onSelect={setActiveMember}
          />
        ) : activeTab === 'checklist' ? (
          <ChecklistView
            checked={checked}
            onToggle={toggleChecked}
            onResetAll={resetChecked}
          />
        ) : (
          <Body
            size={settings.size}
            membersLoading={membersLoading}
            membersError={membersError}
            activeMember={activeMember}
            scheduleData={scheduleData}
            scheduleLoading={scheduleLoading}
            scheduleError={scheduleError}
          />
        )}
      </main>
      {showFooter && (
        <footer className={styles.footer}>
          마지막 갱신 {formatTime(lastUpdated)}
          {scheduleLoading ? ' · 갱신 중…' : ''}
        </footer>
      )}
    </div>
  )
}

function TabButton({ label, active, onClick }) {
  return (
    <button
      type="button"
      className={`${styles.tab} ${active ? styles.tabActive : ''}`}
      onClick={onClick}
    >
      {label}
    </button>
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
