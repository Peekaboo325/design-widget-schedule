import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import styles from './App.module.css'
import SettingsPanel from './components/SettingsPanel.jsx'
import ScheduleView from './components/ScheduleView.jsx'
import ChecklistView from './components/ChecklistView.jsx'
import MemberPicker from './components/MemberPicker.jsx'
import useSettings from './hooks/useSettings.js'
import useMembers from './hooks/useMembers.js'
import useSchedule from './hooks/useSchedule.js'
import useSeenSchedule from './hooks/useSeenSchedule.js'
import Toast from './components/Toast.jsx'
import PendingPopover from './components/PendingPopover.jsx'
import Avatar from './components/Avatar.jsx'
import EmojiPicker from './components/EmojiPicker.jsx'
import { shortName, nextStatus } from './lib/format.js'
import { resolveMemberEmoji } from './lib/emoji.js'
import { setRowStatus, setRowShare } from './lib/api.js'
import { scheduleKey } from './components/ScheduleView.jsx'
import {
  getShapeParams,
  buildOuterPath,
  buildHeaderPath
} from './lib/widgetShape.js'

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
    setActiveMember,
    setLaunchOnBoot,
    setMemberEmoji
  } = useSettings()

  // 프로필 이모지 피커
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)

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
    refresh,
    mutate: mutateSchedule
  } = useSchedule(activeMember)

  // 새 스케줄 알림 트래킹 (세션 기반)
  // 주의: handleStatusClick이 markSeen을 dependency로 쓰므로 반드시 그보다 위에서 선언되어야 함
  const { newKeys, newCount, markAllSeen, markSeen } = useSeenSchedule(
    activeMember,
    scheduleData?.schedule
  )

  // 토스트 (액션 결과 안내 + Undo)
  const [toast, setToast] = useState(null)
  const dismissToast = useCallback(() => setToast(null), [])

  // 상태 chip 클릭 — 다음 상태로 순환 + 낙관적 업데이트 + Undo
  const handleStatusClick = useCallback(
    async (item) => {
      if (!item || !item.rowIndex) return
      const prevStatus = item['상태']
      const next = nextStatus(prevStatus)
      const rowIndex = item.rowIndex

      // 낙관적 업데이트
      // - 잔여 스케줄: 상태 변경 또는 완료 시 제거
      // - 완료 시 공유 대기에도 즉시 추가 (서버 응답 기다리지 않고 카운트 갱신)
      mutateSchedule((prev) => {
        const completedItem = prev.schedule.find(
          (it) => it.rowIndex === rowIndex
        )
        const updatedSchedule = prev.schedule
          .map((it) =>
            it.rowIndex === rowIndex ? { ...it, ['상태']: next } : it
          )
          .filter((it) => it['상태'] !== '완료')

        const movedToPending = next === '완료' && completedItem
        const updatedPending = movedToPending
          ? [
              ...prev.pending,
              {
                rowIndex: completedItem.rowIndex,
                ['광고주']: completedItem['광고주'],
                ['비고']: completedItem['비고'],
                ['수량']: completedItem['수량']
              }
            ]
          : prev.pending

        return {
          ...prev,
          schedule: updatedSchedule,
          pending: updatedPending,
          summary: {
            total: updatedSchedule.length,
            pending: updatedPending.length
          }
        }
      })

      // 시트에 반영 — expect로 행 어긋남 검증
      const expect = { 광고주: item['광고주'], 비고: item['비고'] }
      try {
        await setRowStatus(rowIndex, next, expect)
        setToast({
          key: Date.now(),
          message: `${item['광고주']} → ${next}`,
          tone: 'info',
          action: {
            label: '취소',
            onClick: async () => {
              try {
                // 취소는 시트 현재 값과 일치 검증을 우회해도 안전 (방금 변경한 본인이라)
                // 단 안전 위해 expect 유지하되, 검증 실패 시 자연 refresh로 정정
                await setRowStatus(rowIndex, prevStatus)
                // refresh로 다시 fetch되며 사라졌던 키가 재등장 → NEW로 잡힘
                // 방지: 해당 키를 미리 기준선에 등록
                markSeen(scheduleKey(item))
                refresh()
              } catch (err) {
                setToast({
                  key: Date.now(),
                  tone: 'error',
                  message: `취소 실패: ${err.message ?? err}`
                })
              }
            }
          }
        })
      } catch (err) {
        // 실패 시 다시 fetch로 정확한 상태 복구
        refresh()
        setToast({
          key: Date.now(),
          tone: 'error',
          message: `변경 실패: ${err.message ?? err}`
        })
      }
    },
    [mutateSchedule, refresh, markSeen]
  )

  // 공유 대기 팝오버 열고 닫기
  const [pendingOpen, setPendingOpen] = useState(false)
  const handlePendingClick = useCallback(() => setPendingOpen(true), [])
  const closePendingPopover = useCallback(() => setPendingOpen(false), [])

  // 팝오버 열려있는데 공유 대기가 0건이 되면 자동 닫기
  useEffect(() => {
    if (pendingOpen && (scheduleData?.pending?.length ?? 0) === 0) {
      setPendingOpen(false)
    }
  }, [pendingOpen, scheduleData])

  // 공유 체크 클릭 — L열 TRUE + 낙관적으로 pending에서 제거 + Undo
  const handleShareCheck = useCallback(
    async (item) => {
      if (!item || !item.rowIndex) return
      const rowIndex = item.rowIndex

      mutateSchedule((prev) => {
        const updatedPending = prev.pending.filter(
          (p) => p.rowIndex !== rowIndex
        )
        return {
          ...prev,
          pending: updatedPending,
          summary: { ...prev.summary, pending: updatedPending.length }
        }
      })

      const expect = { 광고주: item['광고주'], 비고: item['비고'] }
      try {
        await setRowShare(rowIndex, true, expect)
        setToast({
          key: Date.now(),
          message: `${item['광고주']} 공유 처리됨`,
          tone: 'info',
          action: {
            label: '취소',
            onClick: async () => {
              try {
                await setRowShare(rowIndex, false, expect)
                refresh()
              } catch (err) {
                setToast({
                  key: Date.now(),
                  tone: 'error',
                  message: `취소 실패: ${err.message ?? err}`
                })
              }
            }
          }
        })
      } catch (err) {
        refresh()
        setToast({
          key: Date.now(),
          tone: 'error',
          message: `공유 처리 실패: ${err.message ?? err}`
        })
      }
    },
    [mutateSchedule, refresh]
  )

  // 트레이 '새로고침' 메뉴 → 즉시 재조회
  useEffect(() => {
    const off = window.widgetAPI?.onTrayRefresh?.(() => refresh())
    return () => off?.()
  }, [refresh])

  // 새로 추가된 NEW 키만 OS 알림 (중복 방지)
  // 이전 newKeys에 없던 키가 들어오면 알림 띄움
  const prevNewKeysRef = useRef(new Set())
  useEffect(() => {
    const prev = prevNewKeysRef.current
    const fresh = []
    for (const k of newKeys) {
      if (!prev.has(k)) fresh.push(k)
    }
    prevNewKeysRef.current = newKeys

    if (fresh.length === 0) return
    const items = (scheduleData?.schedule ?? []).filter((it) =>
      fresh.includes(`${it['광고주']}|${it['비고']}`)
    )
    const preview = items
      .slice(0, 3)
      .map((it) => `${it['광고주']} · ${it['비고']}`)
      .join('\n')
    const more = items.length > 3 ? `\n외 ${items.length - 3}건` : ''
    window.widgetAPI?.notify?.({
      title: `디자인 위젯 · 새 스케줄 ${fresh.length}건`,
      body: preview + more
    })
  }, [newKeys, scheduleData])

  const refreshing = scheduleLoading
  const needsMemberPick = ready && !activeMember
  const showTabs = settings.size === 'L' && !needsMemberPick
  const showFooter =
    !needsMemberPick &&
    activeTab === 'schedule' &&
    lastUpdated &&
    !scheduleError

  // 위젯 사이즈별 외곽/헤더 path 계산 — clip-path 인라인 주입용
  const shapeParams = useMemo(() => getShapeParams(settings.size), [settings.size])
  const outerClip = useMemo(
    () => `path('${buildOuterPath(shapeParams)}')`,
    [shapeParams]
  )
  const headerClip = useMemo(
    () => `path('${buildHeaderPath(shapeParams)}')`,
    [shapeParams]
  )
  const headerPx = `${shapeParams.headerH}px`

  return (
    <div className={styles.widget} data-size={settings.size}>
      {/* 위젯 외곽 형상 + 본문 카드 색 (헤더 카드는 이 위에 별도로 덮임) */}
      <div
        className={styles.shapeLayer}
        style={{ clipPath: outerClip, WebkitClipPath: outerClip }}
        aria-hidden="true"
      />
      <div
        className={styles.headerCard}
        style={{
          height: headerPx,
          clipPath: headerClip,
          WebkitClipPath: headerClip
        }}
      >
        {activeMember && (
          <div className={styles.avatarSlot}>
            <Avatar
              emoji={resolveMemberEmoji(activeMember, settings.memberEmoji)}
              size={settings.size === 'S' ? 32 : 40}
              onClick={() => setEmojiPickerOpen((v) => !v)}
              title={`${activeMember} — 클릭해서 이모지 변경`}
            />
            {emojiPickerOpen && (
              <EmojiPicker
                value={resolveMemberEmoji(activeMember, settings.memberEmoji)}
                onChange={(emoji) => setMemberEmoji(activeMember, emoji)}
                onClose={() => setEmojiPickerOpen(false)}
              />
            )}
          </div>
        )}
        <span className={styles.date}>{todayLabel}</span>
      </div>

      <div className={styles.headerActions}>
        {/* 새 스케줄 알림 뱃지 — 클릭 시 모두 '본 것'으로 */}
        {newCount > 0 && activeTab === 'schedule' && !settingsOpen && (
          <button
            type="button"
            className={styles.newBadge}
            aria-label={`새 스케줄 ${newCount}건. 클릭하면 본 것으로 표시`}
            title="클릭하면 본 것으로 표시"
            onClick={markAllSeen}
          >
            +{newCount}
          </button>
        )}
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
      </div>

      {/* 설정 펼친 상태에서는 본문/탭/footer 숨김 — 본문 가림·잘림 방지 */}
      {settingsOpen && ready ? (
        <div
          ref={settingsPanelRef}
          className={styles.bodyCard}
          style={{ paddingTop: headerPx }}
        >
          <div className={styles.settingsArea}>
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
              onChangeLaunchOnBoot={setLaunchOnBoot}
            />
          </div>
        </div>
      ) : (
        <div className={styles.bodyCard} style={{ paddingTop: headerPx }}>
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
                newKeys={newKeys}
                onStatusClick={handleStatusClick}
                onPendingClick={handlePendingClick}
              />
            )}
          </main>
          {showFooter && (
            <footer className={styles.footer}>
              {activeMember && (
                <span title={activeMember}>{shortName(activeMember)}</span>
              )}
              {activeMember && ' · '}
              마지막 갱신 {formatTime(lastUpdated)}
              {scheduleLoading ? ' · 갱신 중…' : ''}
            </footer>
          )}
        </div>
      )}
      {pendingOpen &&
        settings.size === 'L' &&
        (scheduleData?.pending?.length ?? 0) > 0 && (
          <PendingPopover
            pending={scheduleData.pending}
            onCheck={(item) => {
              handleShareCheck(item)
            }}
            onClose={closePendingPopover}
          />
        )}
      <Toast toast={toast} onDismiss={dismissToast} />
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
  scheduleError,
  newKeys,
  onStatusClick,
  onPendingClick
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

  return (
    <ScheduleView
      size={size}
      data={scheduleData}
      newKeys={newKeys}
      onStatusClick={onStatusClick}
      onPendingClick={onPendingClick}
    />
  )
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
