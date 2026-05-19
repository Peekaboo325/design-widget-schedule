import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import styles from './App.module.css'
import SettingsPanel from './components/SettingsPanel.jsx'
import ScheduleView from './components/ScheduleView.jsx'
import ChecklistView from './components/ChecklistView.jsx'
import MemberPicker from './components/MemberPicker.jsx'
import useSettings from './hooks/useSettings.js'
import useMembers from './hooks/useMembers.js'
import useSchedule from './hooks/useSchedule.js'
import { shortName } from './lib/format.js'

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
    setMode,
    setActiveMember
  } = useSettings()

  // 설정 패널 외부 클릭 시 닫기 (⚙ 버튼은 토글이라 ref로 제외)
  const settingsBtnRef = useRef(null)
  const settingsPanelRef = useRef(null)
  useEffect(() => {
    if (!settingsOpen) return
    function handle(e) {
      if (settingsBtnRef.current?.contains(e.target)) return
      if (settingsPanelRef.current?.contains(e.target)) return
      setSettingsOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [settingsOpen])

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

  // 트레이 '새로고침' 메뉴 → 즉시 재조회
  useEffect(() => {
    const off = window.widgetAPI?.onTrayRefresh?.(() => refresh())
    return () => off?.()
  }, [refresh])

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
            <span className={styles.member} title={activeMember}>
              {shortName(activeMember)}
            </span>
          )}
        </div>
        <div className={styles.headerActions}>
          <button
            ref={settingsBtnRef}
            type="button"
            className={`${styles.iconBtn} ${settingsOpen ? styles.iconBtnActive : ''}`}
            aria-label="설정"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((v) => !v)}
          >
            <GearIcon />
          </button>
          {activeTab === 'schedule' && !needsMemberPick && !settingsOpen && (
            <button
              type="button"
              className={`${styles.iconBtn} ${refreshing ? styles.iconBtnSpinning : ''}`}
              aria-label="새로고침"
              disabled={!activeMember || refreshing}
              onClick={() => refresh()}
            >
              <RefreshIcon />
            </button>
          )}
        </div>
      </header>

      {/* 설정 패널 펼친 상태에서는 본문/탭/footer 숨김 — 본문 가림·잘림 방지 */}
      {settingsOpen && ready ? (
        <div ref={settingsPanelRef} className={styles.settingsArea}>
          <SettingsPanel
            size={settings.size}
            settings={settings}
            members={members}
            onChangeMember={setActiveMember}
            onToggleAlwaysOnTop={setAlwaysOnTop}
            onChangeOpacity={setOpacity}
            onChangeThemeColor={setThemeColor}
            onChangeMode={setMode}
            onChangeSize={setSize}
          />
        </div>
      ) : (
        <>
          {showTabs && (
            <nav className={styles.tabs}>
              <TabButton
                label="스케줄"
                active={activeTab === 'schedule'}
                onClick={() => setActiveTab('schedule')}
              />
              <TabButton
                label="셀프 체크"
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
        </>
      )}
    </div>
  )
}

// 인라인 SVG 아이콘 — 두 아이콘의 stroke·size 통일
function GearIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function RefreshIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
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
