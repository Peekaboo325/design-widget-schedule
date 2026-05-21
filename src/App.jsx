import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import styles from './App.module.css'
import SettingsPanel from './components/SettingsPanel.jsx'
import ScheduleView, { ScheduleSkeleton } from './components/ScheduleView.jsx'
import ChecklistView from './components/ChecklistView.jsx'
import BackupView from './components/BackupView.jsx'
import MemberPicker from './components/MemberPicker.jsx'
import useSettings from './hooks/useSettings.js'
import useMembers from './hooks/useMembers.js'
import useSchedule from './hooks/useSchedule.js'
import useSeenSchedule from './hooks/useSeenSchedule.js'
import Toast from './components/Toast.jsx'
import PendingPanel from './components/PendingPanel.jsx'
import CompactWidget from './components/CompactWidget.jsx'
import Avatar from './components/Avatar.jsx'
import EmojiPicker from './components/EmojiPicker.jsx'
import { shortName, nextStatus } from './lib/format.js'
import { resolveMemberEmoji } from './lib/emoji.js'
import { setRowStatus, setRowShare, setRowBackup } from './lib/api.js'
import { codeFromGas, codeFromNetworkError, toastForCode } from './lib/errors.js'

// API 에러를 사용자 친화 토스트로 변환 (E01~E99 + 친화 메시지)
function buildErrorToast(err, prefix) {
  const code = codeFromNetworkError(err) || codeFromGas(err?.code)
  console.error(`[${code}] ${prefix ?? ''}`, err)
  return {
    key: Date.now(),
    tone: 'error',
    ...toastForCode(code, prefix)
  }
}
import { scheduleKey } from './components/ScheduleView.jsx'

// 사이즈별 헤더 높이 (CSS와 일치)
const HEADER_H = { S: 68, L: 84 }

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
    setActiveMember,
    setLaunchOnBoot,
    setNotificationsEnabled,
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
    function handleKey(e) {
      if (e.key === 'Escape') setSettingsOpen(false)
    }
    document.addEventListener('mousedown', handle)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handle)
      document.removeEventListener('keydown', handleKey)
    }
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
  // 멤버 목록이 아직 fetch되지 않은 동안엔 savedMember 잠정 활성 (깜빡임 방지)
  const savedMember = settings.activeMember
  const membersReady = members.length > 0 || !membersLoading
  const memberInList = savedMember
    ? members.length === 0
      ? membersLoading // 로딩 중이면 잠정 true, 로딩 끝났는데 빈 목록이면 false
      : members.includes(savedMember)
    : false
  const activeMember = memberInList ? savedMember : null

  // 저장값이 목록에 없을 때 자동으로 null 처리 (재선택 유도)
  useEffect(() => {
    if (ready && savedMember && members.length > 0 && !members.includes(savedMember)) {
      setActiveMember(null)
    }
  }, [ready, savedMember, members, setActiveMember])

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
                setToast(buildErrorToast(err, '취소 실패.'))
              }
            }
          }
        })
      } catch (err) {
        // 실패 시 다시 fetch로 정확한 상태 복구
        refresh()
        setToast(buildErrorToast(err, '변경 실패.'))
      }
    },
    [mutateSchedule, refresh, markSeen]
  )

  // 공유 대기 패널 — 우측에서 슬라이드 인. 풋터의 '>' 의미와 일치
  const [pendingViewOpen, setPendingViewOpen] = useState(false)
  const handlePendingClick = useCallback(() => setPendingViewOpen(true), [])
  const closePendingView = useCallback(() => setPendingViewOpen(false), [])

  // 비고 셀 메모(=원본 메일 제목) 클립보드 복사
  const handleCopyNote = useCallback(async (noteText) => {
    if (!noteText) return
    try {
      await navigator.clipboard.writeText(noteText)
      setToast({
        key: Date.now(),
        tone: 'info',
        message: '메일 제목 복사됨'
      })
    } catch (err) {
      console.error('[E05] clipboard 복사 실패', err)
      setToast({
        key: Date.now(),
        tone: 'error',
        code: 'E05',
        message: '복사에 실패했어요.'
      })
    }
  }, [])

  // 공유 대기가 0건이 되면 자동으로 패널 닫음 (마지막 항목 처리 후)
  useEffect(() => {
    if (pendingViewOpen && (scheduleData?.pending?.length ?? 0) === 0) {
      setPendingViewOpen(false)
    }
  }, [pendingViewOpen, scheduleData])

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
                setToast(buildErrorToast(err, '취소 실패.'))
              }
            }
          }
        })
      } catch (err) {
        refresh()
        setToast(buildErrorToast(err, '공유 처리 실패.'))
      }
    },
    [mutateSchedule, refresh]
  )

  // 백업 완료 처리 — 💚완료 시트 M열 TRUE + 낙관적으로 backup에서 제거 + Undo
  const handleBackupCheck = useCallback(
    async (item) => {
      if (!item || !item.rowIndex) return
      const rowIndex = item.rowIndex

      mutateSchedule((prev) => {
        const updatedBackup = (prev.backup ?? []).filter(
          (b) => b.rowIndex !== rowIndex
        )
        return {
          ...prev,
          backup: updatedBackup,
          summary: { ...prev.summary, backup: updatedBackup.length }
        }
      })

      const expect = { 광고주: item['광고주'], 비고: item['비고'] }
      try {
        await setRowBackup(rowIndex, true, expect)
        setToast({
          key: Date.now(),
          message: `${item['광고주']} 백업 처리됨`,
          tone: 'info',
          action: {
            label: '취소',
            onClick: async () => {
              try {
                await setRowBackup(rowIndex, false, expect)
                refresh()
              } catch (err) {
                setToast(buildErrorToast(err, '취소 실패.'))
              }
            }
          }
        })
      } catch (err) {
        refresh()
        setToast(buildErrorToast(err, '백업 처리 실패.'))
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
    // 알림 OFF면 OS 토스트 안 띄움 (위젯 내 NEW 펄스는 그대로 동작)
    if (!settings.notificationsEnabled) return
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
  }, [newKeys, scheduleData, settings.notificationsEnabled])

  const refreshing = scheduleLoading
  // 멤버 픽업 화면 표시 조건:
  //  - 저장된 활성 멤버가 없으면 → 즉시 픽업 (설치 직후 첫 실행)
  //  - 저장값 있고 fetch 후 목록에 없으면 → 픽업 (입퇴사 stale 케이스)
  //  - 저장값 있고 fetch 진행 중 → 스켈레톤 (잠정 활성 멤버 유지, 깜빡임 방지)
  const needsMemberPick =
    ready && !activeMember && (!savedMember || membersReady)
  const showTabs = settings.size === 'L' && !needsMemberPick
  // 헤더 보조정보(멤버명·최근 갱신) — 모든 탭/설정창에서 동일 헤더 유지
  const showHeaderMeta =
    !needsMemberPick && lastUpdated && !scheduleError

  const headerPx = `${HEADER_H[settings.size] ?? HEADER_H.L}px`

  // S 모드 — 진짜 컴팩트 한 줄 카드. 나머지 UI 전부 생략 (확대로 L 가서 조작)
  if (settings.size === 'S') {
    const totalQty = (scheduleData?.schedule ?? []).reduce(
      (acc, it) => acc + (Number(it?.['수량']) || 1),
      0
    )
    return (
      <div
        className={styles.widget}
        data-size="S"
        data-platform={window.widgetAPI?.platform ?? ''}
      >
        <CompactWidget
          totalQty={totalQty}
          lastUpdated={lastUpdated}
          hasData={!!scheduleData}
          onExpand={() => setSize('L')}
        />
      </div>
    )
  }

  return (
    <div
      className={styles.widget}
      data-size={settings.size}
      data-platform={window.widgetAPI?.platform ?? ''}
      style={{ '--header-h': headerPx }}
    >
      <div className={styles.headerCard} style={{ height: headerPx }}>
        {/* 헤더 텍스트 — 더블클릭으로 S 모드 전환. no-drag로 이벤트 잡힘 보장.
            (drag region 위에서는 마우스 이벤트가 OS로 가로채여 React 이벤트 X) */}
        <div
          className={styles.headerText}
          onDoubleClick={() => setSize('S')}
          title="더블클릭으로 작게"
        >
          <span className={styles.date}>{todayLabel}</span>
          {showHeaderMeta ? (
            <span className={styles.headerMeta}>
              <span title={activeMember}>{shortName(activeMember)}</span>
              {' · 최근 갱신 '}
              {formatTime(lastUpdated)}
              {scheduleLoading ? ' · 갱신 중…' : ''}
            </span>
          ) : (
            !needsMemberPick && (
              <span className={styles.metaSkeleton} aria-hidden="true" />
            )
          )}
        </div>
        <div className={styles.headerActions}>
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
      </div>

      {/* 아바타 슬롯은 헤더 카드 밖, 위젯 직속 absolute로 배치
          - 헤더 카드 z-index보다 본문 카드가 위라(layered) 헤더 자식이면
            이모지 피커가 본문 카드에 가려짐. 분리로 z-index 우선권 확보 */}
      {activeMember ? (
        <div className={styles.avatarSlot}>
          <Avatar
            emoji={resolveMemberEmoji(activeMember, settings.memberEmoji)}
            size={settings.size === 'S' ? 28 : 44}
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
      ) : (
        <div
          className={`${styles.avatarSlot} ${styles.avatarSkeleton}`}
          style={{ width: settings.size === 'S' ? 28 : 44, height: settings.size === 'S' ? 28 : 44 }}
          aria-hidden="true"
        />
      )}

      {/* 설정 펼친 상태에서는 본문/탭 숨김 — 본문 가림·잘림 방지
          ref는 SettingsPanel root에 부착(forwardRef) → 설정 컨트롤 외 영역
          (bodyCard 빈 여백 등) 클릭하면 외부로 판정해 닫힘 */}
      {settingsOpen && ready ? (
        <div className={styles.bodyCard}>
          <div className={styles.settingsArea}>
            <SettingsPanel
              ref={settingsPanelRef}
              size={settings.size}
              settings={settings}
              members={members}
              onChangeMember={setActiveMember}
              onToggleAlwaysOnTop={setAlwaysOnTop}
              onChangeOpacity={setOpacity}
              onChangeThemeColor={setThemeColor}
              onChangeLaunchOnBoot={setLaunchOnBoot}
              onChangeNotifications={setNotificationsEnabled}
            />
          </div>
        </div>
      ) : (
        <div className={styles.bodyCard}>
          {showTabs && (
            <nav className={styles.tabs}>
              <TabButton
                label="스케줄"
                active={activeTab === 'schedule'}
                onClick={() => setActiveTab('schedule')}
              />
              <TabButton
                label="백업 관리"
                active={activeTab === 'backup'}
                onClick={() => setActiveTab('backup')}
                badge={scheduleData?.backup?.length ?? 0}
              />
              <TabButton
                label="체크리스트"
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
            ) : activeTab === 'backup' ? (
              <BackupView
                backup={scheduleData?.backup ?? []}
                onBackupCheck={handleBackupCheck}
              />
            ) : pendingViewOpen && settings.size === 'L' ? (
              <PendingPanel
                pending={scheduleData?.pending ?? []}
                onCheck={handleShareCheck}
                onCopyNote={handleCopyNote}
                onBack={closePendingView}
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
                onCopyNote={handleCopyNote}
                onMarkSeen={markSeen}
              />
            )}
          </main>
          {/* 새로고침 — 본문 우하단 플로팅. 헤더 욱여넣기 대신 빈 본문 지면 활용
              스케줄/디자인 체크 두 탭 모두에서 동일 위치 */}
          {!needsMemberPick && (
            <button
              type="button"
              className={`${styles.refreshFab} ${refreshing ? styles.iconBtnSpinning : ''}`}
              aria-label="새로고침"
              disabled={!activeMember || refreshing}
              onClick={() => refresh()}
            >
              <RefreshIcon />
            </button>
          )}
        </div>
      )}
      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  )
}

// 인라인 SVG 아이콘 — 두 아이콘의 stroke·size 통일
function GearIcon() {
  return (
    <svg
      width="16"
      height="16"
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
      width="16"
      height="16"
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

function TabButton({ label, active, onClick, badge }) {
  return (
    <button
      type="button"
      className={`${styles.tab} ${active ? styles.tabActive : ''}`}
      onClick={onClick}
    >
      {label}
      {badge > 0 && <span className={styles.tabBadge}>{badge}</span>}
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
  onPendingClick,
  onCopyNote,
  onMarkSeen
}) {
  if (membersError) {
    return (
      <p className={styles.error}>
        팀원 목록 로드 실패: {String(membersError.message ?? membersError)}
      </p>
    )
  }

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

  // 멤버 목록 또는 스케줄이 아직 안 들어왔으면 실제 레이아웃 그대로 스켈레톤
  if (membersLoading || !activeMember || !scheduleData) {
    return <ScheduleSkeleton size={size} />
  }

  return (
    <ScheduleView
      size={size}
      data={scheduleData}
      newKeys={newKeys}
      onStatusClick={onStatusClick}
      onPendingClick={onPendingClick}
      onCopyNote={onCopyNote}
      onMarkSeen={onMarkSeen}
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
