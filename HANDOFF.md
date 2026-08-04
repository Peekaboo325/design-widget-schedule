# HANDOFF.md — design-widget-schedule

> 새 대화방에서 이 파일을 통째로 컨텍스트로 주면 AI가 현재 상태를 빠르게 흡수합니다.
> **최신 상태 기준**: 위젯 v0.2.10 / GAS Scheduler.gs v0.3.1 (2026-08-04)

---

## 사용자 컨텍스트
- **사용자**: 비개발자, 디자인팀 팀 리더 (IMC 3본부 광고 디자인팀)
- **목적**: 디자인팀 6명용 바탕화면 위젯. 본인 스케줄·공유대기·백업 관리·새 일정 알림을 시트 안 열고 한 화면에.
- **개발 흐름**: 시트 함수 → Apps Script → 독립 앱(Electron)으로 진화.
- **사용 환경**:
  - 본인 회사 PC = Windows (배포 메인 타깃)
  - 본인 집 맥북 = M2 (개발 환경)
  - 디자인팀 5명 = 전부 Windows

## 작업 원칙 (CLAUDE.md 요약)
- 결정 빠른 스타일. 옵션 던지면 즉답.
- "예뻐야 정이 간다" — 미적 완성도가 채택률 결정.
- 모든 작업 단위마다 자동 git add → commit → push (한국어 커밋).
- 작업 브랜치 푸시 후 매번 `main`에도 fast-forward 머지·푸시.
- 무조건 동조 X. 더 나은 방법 제안.
- **패치노트(CHANGES.txt) 콘텐츠는 사용자 컨펌 후 작성. 임의 추정 X.**
  - 내부 픽스는 생략, 사용자 인지 가능한 변화만 추가
  - "다음 버전 예고" 같은 미합의 항목 절대 임의 추가 금지

---

## 프로젝트 개요
- **레포**: `Peekaboo325/design-widget-schedule` (public, 코드 + 릴리스 통합)
- **스택**: Electron 33 + React 18 + Vite (electron-vite) + electron-builder + **electron-updater**
- **버전**: **위젯 v0.2.10** (프록시 환경 GAS 도달 실패 수정 — `net.fetch` + `setProxy(system)` + 네트워크 진단 로그)
- **GAS 버전**: `Scheduler.gs` v0.3.1 (캘박 메일제목 기반 재설계 + TAT 계산 행 수정) / `Synccompletedtodatasheet.gs` v2.3.0 (중복 키 6-field)
- **빌드/실행**:
  - dev: `npm run dev`
  - macOS dev launcher: `start-mac.command` 더블클릭 (자동 git pull + npm install + dev)
  - macOS 패키지: `npm run build:mac` → `.dmg` (실행 hang 이슈 후술)
  - Windows 패키지(로컬): `npm run build:win` → `dist\디자인팀 스케줄 위젯 Setup x.y.z.exe`
    - 한국어 NSIS 인스톨러, 패치노트 페이지 자동 표시
    - 첫 빌드 시 Windows '개발자 모드' 필요 (winCodeSign 캐시 symlink 생성용)
    - `--publish always` 박힘 → 빌드 즉시 GitHub Release 업로드 → electron-updater가 픽업
  - **Windows 패키지(GitHub Actions, v0.2.5+)**: `v*` 태그 push 시 자동 빌드·배포
    - `.github/workflows/release-win.yml` — windows-latest runner
    - 본인 손은 태그 5줄만: `git tag vX.Y.Z && git push origin vX.Y.Z`
    - 후속 정정 시 4줄로 태그 옮기기 (`push :refs/tags/...` → `tag -d` → `tag` → `push`)
    - 본인 로컬 빌드 불필요 (비개발자 운영 환경 친화)

---

## 디렉토리 구조
```
design-widget-schedule/
├── README.md / CLAUDE.md / HANDOFF.md   # 활성 문서 (루트는 이 3개)
├── CHANGES.txt                     # 사용자용 패치노트 (UTF-8, git 추적)
├── docs/
│   └── archive/                    # 종료 마일스톤 문서
│       ├── AUDIT_v0.2.3.md         # v0.2.3 시점 전수 점검 보고서 (결론은 HANDOFF에 반영됨)
│       └── MIGRATION_v0.2.4.md     # L열 ID 도입 절차 (완료)
├── schedule-widget-api.gs          # GAS Apps Script (WIDGET_ prefix const)
├── legacy-gas/                     # 시트 자동화 GAS (위젯과 별개 프로젝트)
│   ├── Scheduler.gs                #   행 이동·휴일·자동 정렬
│   └── Synccompletedtodatasheet.gs #   💚완료 → 업무 데이터 시트 동기화
├── electron-builder.yml            # 패키징 설정 (publish: github, releaseType: release)
├── start-mac.command               # 맥 더블클릭 dev 실행
├── .github/workflows/release-win.yml   # GitHub Actions: v* 태그 → 자동 빌드·Release
├── electron/
│   ├── main.js                     # 창/트레이/IPC/GAS프록시/캐시/seen/whitelist/updater(scheduleQuietInstall)
│   └── preload.js                  # contextBridge API
├── resources/
│   ├── design-widget-schedule.ico  (Win)
│   └── design-widget-schedule.png  (Mac/Linux, 1024×1024)
├── scripts/
│   └── generate-changes-rtf.mjs    # CHANGES.txt → CHANGES.rtf 변환
├── src/
│   ├── App.jsx / App.module.css
│   ├── components/
│   │   ├── CompactWidget.jsx           # S 모드 가로형 단일 카드
│   │   ├── ScheduleView.jsx            # L 스케줄: 메트릭+그룹별 행카드+풋터 (scheduleKey export)
│   │   ├── BackupView.jsx              # L 백업 관리: 공유일/광고주 그룹 토글
│   │   ├── ChecklistView.jsx           # 체크리스트 탭 (src/data/checklist.js 사용)
│   │   ├── SettingsPanel.jsx
│   │   ├── PendingPanel.jsx            # 공유 대기 풀스크린 슬라이드
│   │   ├── MemberPicker.jsx
│   │   ├── Dropdown.jsx
│   │   ├── Avatar.jsx
│   │   ├── EmojiPicker.jsx
│   │   └── Toast.jsx                   # 카드형 (line-clamp 2, code 표시)
│   ├── data/
│   │   └── checklist.js                # 체크리스트 항목 source of truth
│   ├── hooks/
│   │   ├── useSettings.js
│   │   ├── useMembers.js               # 캐시
│   │   ├── useSchedule.js              # 캐시 + 5분 폴링 + 지수 백오프(2s/4s/8s, 최대 3회) + backup 포함
│   │   ├── useSeenSchedule.js          # persistent NEW 추적 (key=scheduleKey)
│   │   └── useActionQueue.js           # 직렬 큐 + STALE 자동 재시도 (id 기반 행 재탐색)
│   ├── lib/
│   │   ├── api.js                      # GAS 래퍼 (POST에 id 동봉)
│   │   ├── color.js                    # hue 평행이동 + perceptual L 보정
│   │   ├── errors.js                   # E01~E99 코드 카탈로그
│   │   ├── format.js
│   │   └── emoji.js
│   └── styles/
│       └── global.css
```

---

## 현재 동작 (v0.2.10)

### 위젯 셸
- frameless + transparent + alwaysOnTop
- 사이즈: **L 400×620 (가장자리 드래그로 확대 가능) / S 200×80 (가로형 컴팩트)**
- L 모드만 `resizable: true` + `minWidth/Height = preset` (축소 불가, 확대만)
- 가장자리 드래그로 사이즈 변경 시 `customSize` store 저장 → 다음 실행/L 재진입 시 복원
- `hasShadow: false`, `skipTaskbar: true`
- 트레이 전용. close → hide만, 트레이 '종료'에서만 quit
- 단일 인스턴스 락
- **트레이 메뉴**: `버전 v{현재}` (정보용, 클릭 불가) / ─ / 새로고침 / 위치 초기화 / ─ / 종료

### 자동 업데이트 (electron-updater, v0.2.2+ / 즉시 설치 v0.2.5+)
- `publish: github` (electron-builder.yml, owner: Peekaboo325, repo: design-widget-schedule)
  - v0.2.4까지는 별도 `design-widget-releases` 레포로 분리되어 있다가 v0.2.5에서 통합
  - 분리 이유는 옛날 코드 레포가 private이던 시절 흔적. 현재 둘 다 public이라 통합 운영 부담 ↓
- 앱 시작 5초 후 + 1시간마다 `autoUpdater.checkForUpdates()`
- `autoDownload: true`, `autoInstallOnAppQuit: true` (안전망)
- **v0.2.5+ 즉시 설치 로직** (`electron/main.js`의 `scheduleQuietInstall`):
  - `update-downloaded` 이벤트 받으면 3초 grace 후 안전 폴링
  - 안전 조건: `inflightPostCount === 0 && 마지막 POST 종료 후 5초 idle`
  - 충족 시 `autoUpdater.quitAndInstall(true, true)` — NSIS silent + 설치 후 위젯 자동 재실행
  - 30초까지 기다려도 idle 안 오면 포기 → 다음 종료에 위임 (autoInstallOnAppQuit)
  - **renderer 변경 0**: main 프로세스 `api:post` 핸들러가 inflight 카운트 직접 관리
- updater 이벤트 전체를 `~/widget-debug.log`에 stamp
- **한계 (AUDIT 1-3, v0.2.4까지)**: 위젯 안 끄면 영원히 안 깔림
- **v0.2.5에서 한계 해소**: 단 v0.2.5 자체는 옛 "종료 시 설치" 방식으로 한 번 깔려야 → 그 후 v0.2.6부터 효과
- **첫 마이그레이션 시점 처리**: v0.2.4까지 위젯이 옛 레포(`design-widget-releases`)를 보고 있으므로 v0.2.5는 본인이 한 번 수동 .exe 배포 (디자인팀 5명에게 메신저로 전달)

### 네트워크 계층 (v0.2.9 / v0.2.10)
- **GAS 호출은 `net.fetch`** (`electron/main.js`의 `api:get` / `api:post`)
  - Node 기본 `fetch`는 윈도우 시스템 프록시를 안 탐 → 회사 자동 프록시(PAC) 뒤 PC에서 GAS 도달 실패, E01 "네트워크 연결을 확인해주세요"만 뜸
  - 크롬으로 GAS URL을 직접 열면 정상인데 위젯만 실패 = 이 증상의 지문
  - `net.fetch`는 크로미움 네트워크 스택 경유라 브라우저와 동일하게 프록시 적용
- **`session.defaultSession.setProxy({ mode: 'system' })`** 를 `app.whenReady`에서 명시 호출 (v0.2.10)
  - `net.fetch`만으로는 PAC 자동 감지가 누락되는 환경이 있어 명시 활성화 필요. **실제로 이 한 줄이 막혀 있던 팀원 PC를 풀어줌**
- **네트워크 진단 로그** (v0.2.10): `api:get` / `api:post`의 진입·응답 status·성공·실패를 `~/widget-debug.log`에 stamp. catch에서 `err.name / err.code / err.message` 원본 기록
  - 그전에는 `friendlyNetworkError`가 원인을 뭉개서 로그에 실패 흔적이 아예 안 남았음
- 시작 시 `app.getVersion()` stamp → 그 PC에 실제로 깔린 버전을 로그 첫 줄로 확인 가능

### S 모드 (CompactWidget — 200×80)
- 진짜 컴팩트 가로형 단일 카드 — 전체 그라데이션 한 덩어리
- 좌: 큰 숫자 (잔여 수량 합, 38px/900)
- 중: "잔여 스케줄" + "최근 갱신 hh:mm" 두 줄
- 우: 확대 아이콘 (Square, 22×22) → 클릭 시 L 모드
- 새로고침은 5분 자동 폴링 + 트레이 메뉴

### L 모드 헤더
- 그라데이션: `linear-gradient(135deg, --widget-header-from → --widget-header-to)` (디폴트 핑크)
- hue 슬라이더로 두 색 H만 평행이동 (S/L 보존)
- 헤더 위 텍스트 색 = `--widget-on-header` (to의 WCAG luminance로 자동 흑/백)
- **아바타** (widget 직속 absolute, z-index 10) — 흰 알약 + 이모지
- 헤더 텍스트 stack: 날짜(18/800) + 메타(11/500, 65% opacity)
- 우측 아이콘 minimal: 사이즈 토글(Square/Restore) + 설정
- **+N 뱃지**: 흰 알약 + 진한 액센트 + 강한 펄스

### L 본문 — 3개 탭

**[스케줄]** — 메인 작업 흐름 (💛신규·유지보수 시트)
- 메트릭 카드: "잔여 스케줄" + 큰 카운트(30/900) — 수량 합산
- 마감일 그룹화: 시트 색상 파싱 (`#ffdcef` 우선, 없으면 `#ff0000`)
  - 그룹 헤더: "5월 18일(월)까지 마감"
- 행 카드: 광고주 / 비고 / 수량(1이면 숨김) / chip
  - 비고 메모 클릭으로 메일 제목 클립보드 복사 (시트 노트 있을 때 underline)
  - NEW dot은 absolute + `::after` pseudo로 펄스 (compositor-only, GPU 가속)
  - NEW 카드 어디든 클릭 시 markSeen → 펄스 즉시 해제
  - NEW 카드만 `:has(.rowDot)`로 left padding 32px
- 공유 대기 풋터 → PendingPanel 우측 슬라이드 인

**[백업 관리]** — 후처리 (💚완료 시트의 백업 미체크 행)
- 탭 옆 카운트 badge (0건이면 자동 숨김)
- 메트릭 카드: "백업 대기" + 카운트
- **그룹화 토글**: 마감일순(=내부 공유일 데이터) ↔ 광고주순
  - v0.2.4: 💚완료 시트의 마감일 컬럼이 제거되어 실제 데이터는 공유일.
    팀이 마감일·공유일 용어를 혼용하므로 **UI 라벨은 "마감일" 유지**.
  - 광고주순일 때 카드 안 광고주명 중복 제거 (그룹 헤더에 이미 있음)
- 완료 버튼: 옅은 액센트 톤 (chip과 통일)

**[체크리스트]** — 셀프 점검 (정적, 저장 없음)
- 6 섹션 19 항목. RESET 버튼

### PendingPanel
- 본문 풀스크린 + 우측 슬라이드 인 (0.24s)
- `< 뒤로` + "공유 대기 N건"(수량 합)
- 행: 광고주 / 비고(메모 클릭 복사) / 수량 / 완료 버튼
- ESC로 뒤로, 0건 자동 닫힘

### 새로고침 FAB (L만)
- 본문 우하단 흰 알약 + 액센트 아이콘 / 풋터 위 8px / 모든 탭

### 설정 패널
- 외부 클릭/ESC 닫힘
- 항목: 사용자 / 항상 위 / 시작 시 자동 실행 / 알림 토글 / 투명도 / 테마 컬러
- 테마 컬러: hue 슬라이더 + 7개 프리셋(hue 6 + 블랙)
  - 블랙: `BLACK_THEME_HEX = '#1a1a1f'`. hue 시스템 밖
  - swatchActive는 inset 흰 ring

### 알림
- 새 NEW → OS 토스트 (Notification API)
- 설정 토글로 on/off (OFF 시 위젯 펄스+뱃지는 유지)

### 데이터 캐싱
- `electron-store`: `cachedMembers`, `cachedScheduleByMember`
- IPC: `cache:get-members/set-members/get-schedule/set-schedule`
- 캐시 즉시 로드 → 백그라운드 fetch → 덮어쓰기 + 캐시 갱신
- 첫 실행 캐시 없으면 ScheduleSkeleton

### Persistent NEW + scheduleKey 진화
- `seenKeysByMember` store 영구 저장 (IPC: `cache:get-seen / set-seen`)
- 컴퓨터 끈 사이 추가된 일정도 켜자마자 NEW로 잡힘
- **scheduleKey 변천사** (`src/components/ScheduleView.jsx`의 `scheduleKey()` export):
  - v0.2.0: `rowIndex` 기반 → 시트 정렬·행 이동만 일어나도 가짜 NEW 폭주
  - v0.2.1: 부분 보정 (같은 광고주·비고 충돌 케이스만)
  - v0.2.3: `마감일 + 광고주 + 비고` → 알림 폭주 해소. 단 마감일 변경 시 가짜 NEW 1건
  - **v0.2.4: 시트 L열 UUID** (GAS가 부여) — 행 이동·정렬·시트 간 이관·비고/마감일 변경 전부 stable. fallback은 `due|광고주|비고`(구 GAS 호환)

### useActionQueue (v0.2.2+)
- GAS Optimistic Locking에서 동시 클릭 시 STALE 빈발 → **클라이언트 측 1개씩 직렬 처리 큐**
- STALE 받으면 `refresh()` → fresh data에서 id(우선) + 광고주·비고로 같은 작업의 새 rowIndex 찾아 1회 재시도
- fresh에서 행 못 찾으면 "이미 처리됨"으로 간주하고 조용히 패스
- 스케줄/공유/백업 세 작업 모두 동일 큐 사용

### 에러 코드 (`src/lib/errors.js`)
| 코드 | 메시지 | 원인 |
|---|---|---|
| E01 | 인터넷 연결을 확인해주세요. | NETWORK |
| E02 | 서버가 잠시 바빠요. 다시 시도해주세요. | GAS BUSY |
| E03 | 시트가 바뀌었어요. 새로고침 후 다시 시도해주세요. | GAS STALE (큐 재시도 후에도 실패한 경우만 표면화) |
| E04 | 잘못된 요청이에요. | GAS INVALID |
| E05 | 복사에 실패했어요. | clipboard |
| E99 | 알 수 없는 오류가 발생했어요. | catch-all |

- Toast 우측 알약으로 코드 표시 / `console.error`에 원본 동시 로깅

### 보안 패치
- `main.js`의 `api:post` 핸들러에 `ALLOWED_POST_ACTIONS = {setStatus, setShare, setBackup}`
- 그 외 action은 GAS 도달 전 main에서 거부

### 컬러 시스템 (`src/lib/color.js`)
- `--widget-header-from / -to`, `--widget-on-header`, `--widget-accent / -strong / -soft`
- `--widget-surface / on-surface / fg / muted / overlay / border`
- 블랙 테마는 hue 시스템 밖 — `BLACK_THEME_HEX` / `isBlackTheme()` / `getBlackThemeColors()`

### 본문 카드 외곽 시각화 (border 없음)
- transparent + frameless 창의 리사이즈 후 `.bodyCard border invalidate` Chromium 버그 → border 폐기
- 본문 카드에 `radial-gradient(ellipse 70% 90% at 50% 10%, #ffffff 35%, #fafbfc 100%)` 적용
- paint 영역 안의 배경색이라 invalidate 버그 영향 없음

### Windows 폰트 보정
- `font-render-hinting=none` Chromium 플래그
- `[data-platform='win32']`로 .date 800→850, .headerMeta 500→600
- macOS만 `disableHardwareAcceleration` (Windows는 GPU 살림)

---

## GAS API (`schedule-widget-api.gs`) — v0.2.8 기준

### 시트 구조 (v0.2.4: L열에 ID 컬럼 신설로 한 칸씩 시프트)

**💛신규·유지보수** (작업 진행 중)
- 데이터 시작: 10행
- E(광고주) F(작업자) I(수량) **J(비고+메모=메일제목)** K(상태) **L(ID, UUID)** **M(공유)**
- 9행 **N~ 끝열**: 날짜 헤더 (Date 객체)
- N~ 끝열 배경색: 핑크(`#ffdcef`) / 빨강(`#ff0000`)으로 마감일 표시

**💚완료** (공유 처리 시 자동 이관)
- E(광고주) F(작업자) I(수량) J(비고) K(상태) **L(ID)** **M(공유)** **N(백업)** O(요청일) **P(공유일)** Q(TAT)
- v0.2.4에서 기존 "마감일(O)" 컬럼이 제거되고 요청일/공유일/TAT 체계로 재정렬됨. 위젯은 P(공유일)을 백업 그룹화에 사용 (UI 라벨은 "마감일")

**업무 데이터 시트** (legacy-gas 동기화 대상)
- Q열 헤더 `TAT` (기존 "소요일"에서 개명) / R열 `ID` 신설
- **중복 체크 키 = 6-field** (광고주 + 작업유형 + 비고 + 완료일 + 작업자 + 담당자). v2.3.0
  - v2.1.0에서 ID 우선 판정으로 갔다가 **행 복사로 생긴 시트 내 중복 UUID가 완료 시트로 전파 → 묶음 단위 데이터 로스** (5월분 사고). ID 판정 폐기하고 field 키로 회귀 후 확장
  - 이관은 단방향이라 stable ID 매칭이 애초에 불필요. R열 ID는 lifecycle 추적용으로 운반만
- `checkSyncIntegrity` — **매주 월 09시** 완료 시트 ↔ 업무 데이터를 6-field로 대조, 누락분을 `bsb0325@bydream.co.kr`로 메일 통보 (`enableIntegrityCheckTrigger` ▶로 등록)
  - 5월 사고가 한 달 묻혀 있었던 게 진짜 문제였음. 로스를 일주일 안에 발견하는 안전망
- `forceMigrateAllCompletedRows` — 중복 체크 없이 완료 시트 전체를 강제 이관하는 1회용. **시간 트리거 금지, 수동 ▶ 전용**

### Const namespace
- `WIDGET_` prefix로 다른 .gs 파일(`legacy-gas/Scheduler.gs` 등)과 격리
- `WIDGET_SCHEDULE_SHEET`, `WIDGET_DONE_SHEET`, `WIDGET_COL`, `WIDGET_DONE_COL` 등

### GET
- `?type=members` → `{ members: string[] }`
- `?type=schedule&member=이름` →
  ```json
  {
    "schedule": [{ "id", "rowIndex", "광고주", "비고", "수량", "상태", "due", "noteText" }],
    "pending":  [{ "id", "rowIndex", "광고주", "비고", "수량", "noteText" }],
    "backup":   [{ "id", "rowIndex", "광고주", "비고", "수량", "공유일" }],
    "summary":  { "total", "pending", "backup" }
  }
  ```
  - `id`: 시트 L열 UUID (위젯의 stable identifier)
  - `due`: 마감일 `YYYY-MM-DD` 또는 null
  - `공유일`: `YYYY-MM-DD` 또는 null (백업 그룹화용)

### POST
- `{ action: "setStatus", id, rowIndex, value, expect }`
- `{ action: "setShare",  id, rowIndex, value, expect }`
- `{ action: "setBackup", id, rowIndex, value, expect }` — 💚완료 시트 N열 토글
- GAS는 `id`로 우선 lookup → 못 찾으면 `rowIndex` fallback
- LockService(10s) + Optimistic Locking (expect mismatch 시 STALE)
- 응답: `{ ok, action, rowIndex, value }` 또는 `{ error, code: STALE|BUSY|INVALID }`

### deploy
- `main.js`의 `GAS_BASE` 상수에 URL 박힘
- 사용자가 Apps Script 콘솔에서 직접 갱신·재배포 → 새 URL 알려주면 교체 커밋
- 액세스 권한: "모든 사용자" (익명 fetch 필요)

### legacy-gas/ (위젯과 별개 GAS 프로젝트 — 시트 자동화)
- `Scheduler.gs`: 행 이동·캘박 동기화·정렬·휴일 처리
- `Synccompletedtodatasheet.gs`: 💚완료 → 업무 데이터 시트 동기화 (ID 컬럼 전파 포함)
- `dashboard-api.gs`는 정리됨(삭제)

#### Scheduler.gs 함수 맵 (v0.3.1)
| 함수 | 호출 경로 | 역할 |
|---|---|---|
| `onEdit` | **간이 트리거** (등록·승인 불필요) | 아래 둘을 호출. 설치형 트리거 사망 대비 경로 |
| `moveRowOnCheck` | onEdit / 수동 배치 | M열 공유 체크 → 💚완료 이관 + TAT 계산 + 원본 행 삭제 |
| `onEditTrigger` | onEdit | L열 ID 자동 발급 + 행 복사 중복 ID 해소 (**위젯용. 캘박 안 건드림**) |
| `processCheckedRowsNow` | **시간 트리거 5분** / 수동 ▶ | M열 TRUE 행 일괄 이관. onEdit이 놓친 것 쓸어담기 |
| `enableAutoMoveTrigger` / `disableAutoMoveTrigger` | 수동 ▶ | 위 5분 트리거 등록·해제 |
| `syncToCalendar` | 시간 트리거 1시간 | 메일제목 기반 캘박 create + update |
| `enableSyncTrigger` / `disableSyncTrigger_` | 수동 ▶ / 가드 자동 | 캘박 시간 트리거 등록·해제 |
| `backfillCalendarDryRun` / `backfillCalendarApply` | 수동 ▶ | 캘박 초기 일괄 생성 (dry-run 먼저) |
| `wipeTaggedEventsDryRun` / `wipeTaggedEventsApply` | 수동 ▶ | 전환용. 옛 태그(rowId) 캘박 삭제, 개인 일정 보존 |
| `diagnoseDuplicateRowIds` / `fixDuplicateRowIds` | 수동 ▶ | 행 복사로 생긴 L열 중복 UUID 진단·정리 |
| `pingOnEdit` / `whichSpreadsheetAmIBoundTo` | 진단용 | 트리거 생사 확인 / 바인딩된 시트 확인 |
| `sortCompleteSheet` | 수동 ▶ | 완료 시트 정렬 |

#### 캘박 동기화 — 메일제목 기반 (v0.3.0 재설계, 2026-06)
- **식별 기준 = J열 셀의 '메모'(팀원이 적어둔 요청 메일 제목).** UUID·K열 상태 안 씀
  - 전환 이유: 사람이 셀을 복사·드래그·일괄수정하는 스타일이 ID/상태 기반 로직과 근본적으로 안 맞아 중복·누락이 반복됨
  - 메일 제목은 요청 1건당 고유 → 행을 복사/이동/수정해도 같은 제목이면 캘박 1개로 수렴
- **대상**: J열 메모 있음 + 마감일(핑크 우선 → 빨강) 색칠됨. **K열 상태 무관** (예정·대기·진행 전부)
- **제목**: J열 메모 내용 그대로
- **생성 경로는 `syncToCalendar` 단독** (1시간 사이클). `onEditTrigger`의 캘박 등록은 폐기
- **delete 자동화 0** — 사람이 캘린더 앱에서 직접만. 시트에서 행이 사라져도 캘박은 남고 마감일 지나면 자연 소멸
- **중복 거름**: 시트 내 같은 제목 여러 행 → 첫 행만. 캘린더에 같은 제목 있으면 스킵
- **폭주 가드**: 한 회 create 50건 초과 시 abort + 시간 트리거 자동 정지
- **숙명적 한계**: 메일 제목을 나중에 수정하면 새 제목으로 캘박이 하나 더 생기고 옛 것은 고아로 잔존
- **용도**: AE(타 부서)가 디자인팀 마감일정만 보는 공유 캘린더. 원천 데이터·팀 운영 세부는 비공개

---

## 패키징 진행 상황

### electron-builder.yml
- `appId`: `com.peekaboo325.design-widget-schedule`
- `productName`: `디자인팀 스케줄 위젯`
- `extraMetadata.description`: `디자인팀 스케줄 위젯`
- Mac: dmg (x64 + arm64), `identity: '-'` (ad-hoc 서명)
- Windows NSIS: 사용자 단위 설치, 바탕화면+시작메뉴 바로가기, 한국어 강제, **`license: CHANGES.rtf`**
- **`publish: github`** (owner: Peekaboo325, repo: design-widget-schedule)
  - 토큰 없으면 dist에만 만들고 publish 스킵 (--publish=never 효과)

### GitHub Actions (v0.2.5+)
- `.github/workflows/release-win.yml`
- 트리거: `v*` 태그 push
- runner: `windows-latest`, Node 20 LTS, npm cache 사용
- **의존성 설치는 `npm install --no-audit --no-fund`** (npm ci 아님)
  - lockfile 엄격 검증을 풀어둠 — 환경 간 미세한 lockfile drift로 자주 실패하던 케이스 회피
  - 비개발자 운영 환경에 재현성 손해 미미, 통과율 ↑
- 권한: `permissions: contents: write` + 기본 발급된 `GITHUB_TOKEN`만 사용
  - 별도 PAT 등록 불필요 (publish 타겟이 같은 레포로 통합됐기 때문)
- 빌드 → electron-builder가 NSIS + latest.yml 만들어 Releases에 자동 업로드
- **태그 운영**: 본인이 윈도우/맥 어디서나 `git tag vX.Y.Z && git push origin vX.Y.Z`
  - 워크플로우 디버깅 중 태그 재발행 5줄 패턴: `git pull main → push :refs/tags/vX.Y.Z → tag -d → tag → push`

### 패치노트 (CHANGES.txt → CHANGES.rtf)
- `CHANGES.txt` (UTF-8, git 추적) — 사용자 친근한 톤 한국어
- `scripts/generate-changes-rtf.mjs` — UTF-8을 `\uXXXX` escape RTF로 변환
- `build:changes` script가 `build:mac/win/all` 직전 자동 실행
- `CHANGES.rtf`는 빌드 산출물이라 `.gitignore`
- **CHANGES.txt 콘텐츠는 매번 사용자 컨펌 필요**

### 진행 상태
| 환경 | 상태 |
|---|---|
| **dev 모드** (`npm run dev` / `start-mac.command`) | ✅ 정상 (Mac/Windows 둘 다) |
| **macOS .dmg** | ⚠ 빌드 성공, 실행 시 hang (Sequoia + unsigned + Electron 33 조합) |
| **Windows .exe** | ✅ v0.2.0~v0.2.8 빌드 완료, 디자인팀 5명 자동 업데이트 안착 |

### macOS 패키지 hang 이슈
- `app.whenReady()` 콜백 호출 안 됨 → dock에서만 튀고 화면 X
- 원인 추정: macOS Sequoia + Electron 33 + unsigned 조합의 데드락
- 우회 시도 전부 효과 없음. 본인 맥은 `start-mac.command` dev 모드로 운영
- 디자인팀 전부 Windows라 배포 영향 X

### 진단 로그 인프라
- main.js 시작 시점부터 단계별 `stamp(label)` → `~/widget-debug.log`
- `uncaughtException` / `unhandledRejection` 핸들러 동일 파일
- updater 이벤트 (checking/available/downloaded/error)도 동일 파일

---

## 다음 단계

### 1순위 — 운영 안정화 관찰 (2026-08 기준)
- **공유 체크 이관** — 간이 트리거 `onEdit` + 5분 시간 트리거 이중 경로가 안착하는지. 누락·중복 사례 모니터링
- **캘박 메일제목 기반 전환** — 예정·대기 단계까지 전부 캘박에 뜨는 것이 AE 공유 범위로 적절한지 운영 확인
  - 옛 방식은 '진행'만 등록했음. 전환 후 이벤트 수가 늘어남
- 메일 제목 수정 시 남는 고아 캘박이 실제로 얼마나 쌓이는지 (숙명적 한계라 수동 정리 필요)
- `checkSyncIntegrity` 주간 메일이 실제로 오는지 + 누락 0건 유지되는지
- v0.2.10 자동 업데이트로 팀원 6명 갱신 안착 확인 (트레이 메뉴 버전 표시로 점검)
- 옛 `design-widget-releases` 레포는 모두 새 레포로 옮겨온 게 확인되면 archive

### 2순위 — AUDIT.md 잔여 항목 + 알려진 이슈
- 1-1: 마감일 변경 가짜 NEW → v0.2.4 ID 도입으로 해소
- 1-2: 시트 구조 변경 시 위젯 어긋남 → 사용자 통제 정책으로 사실상 봉인
- 1-3: 자동 업데이트 미적용 → v0.2.5의 즉시 설치 로직으로 근본 해소 (v0.2.6+ 실측 검증 완료)
- **위젯 자동 hide (알려진 이슈 섹션 참조)**: 운영 영향 작아 보류. 진단 로그 추가 시 trigger 식별 가능
- **설치형 onEdit 트리거 복구 여부**: 현재 간이 트리거로 우회 중이라 급하지 않음 (알려진 이슈 참조)

### 3순위 — macOS packaging 재시도 (필요 시)
- Electron 30 LTS 다운그레이드 또는 code signing ($99/년)
- 우선순위 낮음

---

## 종료된 사고 (재발 방지용 기록)

### ✅ 캘린더 폭주 사고 (2026-06) — 해결
- **증상**: 공유 캘린더에 같은 이벤트가 한 날짜에 1000개+, 전체 약 4500건 누적.
- **원인**: 증분 sync가 `setTag`/`getTag`(rowId 라벨) 매칭에만 의존 → 라벨이 깨지면 매시간 신규 create 누적. 옛 destructive sync가 갖고 있던 "자연 정리" 효과가 사라지면서 안전판 0.
- **수습**: `wipeAllBatch`로 4500건 비움. 캘린더 일일 할당량에 걸려 며칠 소요 — **텀을 두고 나눠 실행**해서 통과.
- **재설계**: 라벨 의존 폐기 → 이름 기반 → 최종적으로 **메일제목(J열 메모) 기반**으로 전환 (v0.3.0).
- **교훈**: 라벨(hidden tag)은 깨질 수 있고, 깨지면 폭주로 직결된다. 사람이 눈으로 보는 값(제목)을 기준으로 삼는 편이 훨씬 견고하다.

### ✅ 업무 데이터 5월분 로스 (2026-06) — 해결
- **증상**: 4월 데이터는 깨끗한데 5월분에 오차. 업무 데이터 시트에 들어갔어야 할 행이 통째로 누락.
- **원인**: v2.1.0에서 이관 중복 체크를 ID 우선으로 바꿈 → **행 복사로 생긴 시트 내 중복 UUID**가 완료 시트로 전파 → `idSet.has(id)`에서 묶음의 첫 행만 통과하고 나머지는 "중복 스킵". 옛 field 키 시절엔 비고가 달라 전부 정상 이관되던 케이스.
- **수습**: 6-field 키로 전환 후 재실행 + `forceMigrateAllCompletedRows`로 잔여분 강제 이관.
- **재발 방지**: `checkSyncIntegrity` 주간 메일 알림 도입 (로스를 한 달이 아니라 일주일 안에 발견).
- **교훈**: 단방향 이관에 stable ID 매칭은 애초에 불필요했다. 사람이 행을 복사하는 환경에서 UUID는 고유하지 않다.

### ✅ 프록시 뒤 PC에서 위젯만 GAS 도달 실패 (2026-08) — 해결
- **증상**: 팀원 1명만 팀원 목록·스케줄 로딩 실패, E01. 재설치해도 동일. **크롬으로 GAS URL 직접 열면 정상**.
- **원인**: Node 기본 `fetch`가 윈도우 시스템 프록시(PAC)를 안 탐.
- **해결**: `net.fetch` 전환(v0.2.9) → 그래도 안 풀려서 `setProxy({mode:'system'})` 명시 추가(v0.2.10)에서 해소.
- **교훈**: "브라우저는 되는데 앱만 안 된다"는 프록시 계층 지문. 또 진단 로그가 없으면 원인이 통째로 묻힌다 — v0.2.10에서 네트워크 진단 로그를 넣고서야 판단 가능해짐.

### ✅ moveRowOnCheck 8분 행 → 트리거 자동 비활성화 (2026-08) — 해결
- **증상**: M열 공유 체크가 무반응. **실행 기록조차 안 남음.** 트리거를 지웠다 다시 만들어도 동일.
- **원인**: `countBusinessDays`가 요청일~완료일을 하루씩 순회하며 매번 `getKoreanHolidays` 호출 → 캐시가 비고 캘린더 할당량이 소진된 시간대엔 날짜 수만큼 캘린더 재조회 → 8분 실행 → `DEADLINE_EXCEEDED` 강제 종료. 반복 실패로 구글이 트리거를 자동 비활성화.
- **"오전엔 되고 오후엔 먹통"** 패턴이 캘린더 일일 할당량 소진 시점과 일치했던 게 결정적 단서.
- **해결**: 휴일 조회를 실행 1회 범위 메모로 접어 연도당 1회 보장 + 실패해도 throw 없이 주말만 제외 + 기간 상한 400일 (v0.3.1).
- **교훈**: 구글의 "Summary of failures" 알림 메일에 실행 시간과 에러 코드가 다 찍혀 있다. **먹통일 땐 실행 기록보다 이 메일을 먼저 볼 것.**

---

## 알려진 이슈 (보류)

### 설치형 onEdit 트리거 사망 (2026-08, 우회 중)
- **증상**: 설치형 onEdit 트리거가 전부 발사되지 않음. 진단용 최소 함수 `pingOnEdit`을 트리거로 걸어도 무반응.
- **판별 근거**: `doGet`(웹앱)은 정상 동작 → 스크립트 코드·시트 바인딩·권한은 멀쩡. **트리거 실행 계층만 한정 차단**.
  - 웹앱과 트리거는 실행 경로·할당량·인증이 전부 별개. 로그의 "유형" 열로 구분됨 (`웹 앱` vs `시간 기반`/`실행`)
- **추정 원인**: 설치형 트리거의 저장된 인증이 끊김. (할당량 소진 가설은 **간이 트리거가 정상 동작**하는 것으로 배제됨)
- **현재 대응 — 3중 경로 확보**:
  1. **간이 트리거 `onEdit`** (함수명만 맞으면 자동. 등록·승인 불필요) ← 실제로 이걸로 복구됨
  2. **5분 시간 트리거** `processCheckedRowsNow` — 간이 트리거가 놓친 것 쓸어담기
  3. **수동 ▶** `processCheckedRowsNow` — 최후 수단
- **왜 2번을 같이 켜두나**: 간이 트리거도 **드래그로 여러 셀 채우기·붙여넣기**에서는 안 잡히거나 값을 못 넘긴다. 체크박스를 여러 개 드래그로 켜면 누락됨. 시간 사이클이 이걸 커버.
- **중복 이관 걱정 없음**: `moveRowOnCheck`가 lock 획득 후 M열 TRUE를 재확인하므로 경로가 겹쳐도 안전.

### 위젯이 한참 안 만지면 자동으로 화면에서 사라짐 (트레이는 살아있음)
- **증상**: alwaysOnTop ON 상태에서도 일정 시간 inactive 후 위젯 창이 hide.
  트레이 아이콘은 살아있어서 클릭하면 다시 떠짐.
- **범위**: 본인 + 팀원 5명 모두 동일 증상 보고.
- **코드 측 점검 결과 (v0.2.7 기준)**: 시간 경과로 자동 hide 시키는 코드 없음.
  hide() 호출 경로는 (1) Alt+F4 등 close 이벤트, (2) 트레이 클릭 토글 두 곳뿐.
- **가설 (미확정)**: Windows에서 `skipTaskbar + transparent + frameless + alwaysOnTop`
  조합 창이 OS 이벤트(화면 잠금·절전 복귀·explorer 재시작·DPI 변경 등)에서
  invisible 상태로 떨어지는 알려진 케이스.
- **현재 결정**: 운영 영향 작아서 보류. 트레이 클릭 한 번이면 회복.
- **추후 진단 필요 시**: window의 hide/show/minimize/blur + powerMonitor
  suspend/resume 이벤트에 stamp 로그 추가 → 다음 발생 시 trigger 식별.

---

## QC 히스토리 (핵심 마일스톤)
- **v1~v7**: 기본 셸 + 데이터 fetch + 디자인 초안
- **v8** (`7988df7`): 폴더 탭 inverse curve
- **v9** (`c94deac → 8731085`): 풀컬러 시도 → revert
- **v10** (`f9595cd`): 그라데이션 헤더 + 카드형 행 + 메트릭 카드 (현재 베이스)
- **v10.1** (`ccb573b`): 본문 layered (margin-top -14)
- **hue 보정** (`f1137dd`): 옐로/시안 perceptual L 자동 보정
- **M 폐기** (`e7da676`): S/L 두 단계
- **첫 실행 캐싱 + 스켈레톤** (`8f1de8b`, `d9f9088`)
- **공유대기 PendingPanel** (`887dea0`): 슬라이드 인
- **shadow → border + 아바타 분리 + NEW dot 동적** (`c97b909`)
- **마감일 그룹화** (`0b1aec2`): 시트 색상 파싱
- **persistent NEW** (`23ce7d0`): 위젯 종료 사이 추가 일정 감지
- **NEW dot absolute** (`49fd7b2`): grid 영향 제거
- **비고 메모 복사** (`babea34`): 시트 노트 → 클립보드
- **알림 토글** (`f732c88`): 설정창
- **에러 코드 카탈로그** (`3f24833`): E01~E99
- **electron-builder 설정** (`59c2e19`)
- **Windows 폰트 보정** (`5103151`): font-render-hinting + weight 보정
- **start-mac.command** (`a9559c6`, `2dfe303`): 더블클릭 런처 + 자동 git pull
- **백업 관리 탭** (`b7e5ca4`): 💚완료 시트 백업 미체크 추적
- **GAS WIDGET_ prefix** (`d15add0`): namespace 충돌 회피
- **S 모드 진짜 컴팩트** (`b52e231`): CompactWidget 240×96 가로형
- **v0.1.0 Windows .exe 빌드 성공**: 한국어 NSIS + 자동실행 등록
- **v0.2.0 마일스톤**: 사이즈 커스텀 / S 200×80 / NEW dot 펄스 / 블랙 테마 / radial 본문 / focus ring 제거 / NSIS 라이선스에 패치노트
- **v0.2.1** (`4eb555f`): NEW 키 충돌 일부 보정 패키징
- **v0.2.2** (`a1edd7f`, `2585844`, `b226aff`, `17fdef5`): **electron-updater 자동 업데이트 도입 + useActionQueue 직렬 큐 + 트레이 메뉴에 버전 표시**
- **v0.2.3** (`aec4617`): **scheduleKey를 `마감일+광고주+비고`로 변경 → 알림 폭주 버그 fix**
- **AUDIT.md** (`ef2de70`): v0.2.3 기준 전수 점검 보고서 (오너 의사결정용)
- **v0.2.4** (`b891cd1`, `f9b0575`, `3bc4935`): **시트 L열 UUID 도입 + GAS 4개 통합 수정 + 위젯 ID 기반 식별로 전환 / legacy-gas 정리 (dashboard-api.gs 삭제)**
- **v0.2.5** (`340f207`, `7780105`, `7d6cf67`, `5986572`, `89e93c7`): **자동 업데이트 즉시 silent 설치·재시작 (scheduleQuietInstall) + GitHub Actions 도입 (`v*` 태그 push → windows-latest 자동 빌드·Release 업로드) + 릴리스 레포 통합 (design-widget-releases → design-widget-schedule, 코드/릴리스 단일 운영)**
- **v0.2.5 시점 GAS 정리** (`55b0478`, `58451a5`, `dec331d`, `ee4b52b`): syncToCalendar **증분 sync 재작성** (옛 destructive → id 기반 변경분만, Calendar API quota burst 해결) + 모든 함수에 `[함수명]` prefix·시작·결과·에러 **진단 로그 전수 보강** + 사용 안 하는 코드 정리 (cleanupUntaggedEvents·testHolidaySetup·handleUrgentTask 제거, 진입 함수 4개로 축소) + 캘박 **이벤트 제목 통일 '광고주 비고 (요청자)' 원칙 회복**. ※ 증분 sync는 옛 destructive의 "자연 정리" 효과를 잃었고, 안전망 부재로 2026-06 캘린더 폭주의 한 원인이 됨 (알려진 이슈 참조)
- **v0.2.5 빌드 후 보강** (`ba98ae3`): `electron-builder.yml`에 `releaseType: release` 추가 — v0.2.5 .exe엔 이미 미반영이라 첫 Release가 Draft로 올라옴(수동 publish로 해소). **v0.2.6부터 자동 정식 공개 효과** (한 사이클 지연)
- **v0.2.6** (`a281427`, `1919a51`): **백업 탭 뱃지 카운트 행 수 → 수량 합산 통일** (sumQty 헬퍼 추출 후 ScheduleView·BackupView·App.jsx 단일 출처). v0.2.5의 즉시 silent 설치 로직 첫 실측 검증 성공
- **v0.2.7** (`fe91e1d`, `6c41547`): **NEW 폭주 자기 강화 버그 수정** — useSeenSchedule의 빈 배열 store 처리에 `stored.length > 0` 조건 추가. 빈 Set 영구 유지 → 모든 항목 NEW 표시되던 자기 강화 루프 차단 + HANDOFF에 '알려진 이슈(보류)' 섹션 신설 (위젯 자동 hide)
- **v0.2.8** (`90b4718`, `2fb1d40`): **K열 상태 '미정' → '예정' 의미 재정의 + 캘박 트리거 옛 '미정→대기' → 새 '진행 진입'으로 교체** (어떤 이전 상태에서든) + **isDuplicateEvent rowId tag 기준 강화** (제목·날짜 변경 시에도 중복 안 만듦) + GAS Web App URL 교체. CSS `.statusUndefined` → `.statusPlanned`로 정리
- **v0.2.8 후속 GAS 패치 (위젯 빌드 없음)**: `moveRowOnCheck` race 방어 — lock 대기 중 인접 행 deleteRow로 시트가 시프트되면 `e.range.getRow()`가 다른 행을 가리켜 잘못된 행이 완료 시트로 이관되던 사고 차단. lock 획득 후 M열 = TRUE 재확인 + 시프트 감지 시 `findFirstSharedRow_`로 진짜 처리 대상 행 재탐색. (광고주+비고 비슷한 두 작업이 인접 행일 때 발현, 실 사고 보고 후 패치) + `moveRowOnCheck` 요청일 추출을 좌측 첫 빨강 → **우측 마지막 빨강**으로 변경 (행 복사 잔존 안전장치, 빨강 2개+ 감지 시 ⚠ 로그)
- **v0.2.8 GAS 확장 — 종속 드롭다운 (도입 후 폐기)**: 신규·유지보수 시트의 C(팀) ↔ D(담당자) ↔ E(광고주) 동적 Data Validation을 GAS onEdit으로 구현했으나, **GAS onEdit의 1~3초 latency가 디자이너 자연스러운 입력 속도를 못 따라와서 필터링이 실효성 없음** → 운영 검증 후 폐기. 본질적 한계: 시트 셀 직접 입력 + 시트 구조 변경 없음 + 즉시 필터링은 Sheets 플랫폼상 불가능 (Sheets는 종속 드롭다운 미지원, INDIRECT를 Data Validation source에 못 박음, GAS onEdit latency는 Google 백엔드 책임). 즉시성 원하면 HTML 사이드바·위젯 등 입력 환경 변경 필요. 본인 운영 결정: 폐기. 관련 코드(getMasterData_, handleCascadingDropdown_, initCascadingDropdowns, setDropdown_ + 모듈 상수 + onEditTrigger 호출 + 마스터 데이터 캐시) 전부 제거. 마스터 데이터 시트 자체는 위젯·대시보드 무관이라 그대로 둠.

- **v0.2.9** (`f35193c`, `d23a89e`): **프록시 뒤 PC의 GAS 도달 실패 수정** — `electron/main.js`의 GAS 호출을 Node 기본 `fetch` → **`net.fetch`**로 교체. Node fetch가 윈도우 시스템 프록시를 안 타서 회사 자동 프록시(PAC) 환경의 팀원 1명만 E01로 완전 차단돼 있던 문제. (이 버전만으론 미해소 → v0.2.10에서 해결)
- **v0.2.10** (`a65f68d`): **`session.defaultSession.setProxy({mode:'system'})` 명시 호출 + 네트워크 진단 로그 전수 보강.** `net.fetch`만으로는 PAC 자동 감지가 누락되는 환경이 있었고, **이 한 줄이 실제로 막혀 있던 PC를 풀어줌**. 더불어 `api:get`/`api:post`의 진입·응답 status·성공·실패와 `err.name/code/message` 원본을 `~/widget-debug.log`에 stamp (그전엔 `friendlyNetworkError`가 원인을 뭉개서 실패 흔적이 아예 안 남았음) + 시작 시 `app.getVersion()` stamp
- **GAS `Synccompletedtodatasheet.gs` v2.2.0 → v2.3.0** (`a81a5bd`, `2ef5122`, `84c515a`, `c8f912c`): **이관 중복 체크 키를 ID 우선 → field 키로 회귀 후 6-field로 확장** (광고주+작업유형+비고+완료일+**작업자+담당자**). v2.1.0의 ID 판정이 행 복사발 중복 UUID를 만나 묶음 단위로 5월 데이터를 날린 사고 수습. + `forceMigrateAllCompletedRows`(중복 체크 없는 1회용 강제 이관) + **`checkSyncIntegrity` 주간 정합성 점검 메일**(매주 월 09시, 누락분을 메일로 통보) + `enableIntegrityCheckTrigger`
- **GAS `Scheduler.gs` v0.3.0** (`5a63926`): **캘박 동기화를 메일제목(J열 셀 메모) 기반으로 전면 재설계.** 식별 기준에서 UUID·K열 상태를 전부 걷어냄 — 사람이 셀을 복사·드래그·일괄수정하는 스타일과 ID/상태 기반 로직이 근본적으로 안 맞아 중복·누락이 반복됐기 때문. 대상은 'J열 메모 있음 + 마감일 색칠됨'(상태 무관), 제목은 메모 그대로, 생성 경로는 `syncToCalendar` 단독(1시간). `onEditTrigger`의 캘박 등록 폐기 + `collectCalendarRows_`/`buildCalendarIndexByTitle_` 신설 + 전환용 `wipeTaggedEventsDryRun/Apply`(옛 태그 캘박 정리, 개인 일정 보존) + 안 쓰게 된 `isDuplicateEvent`·`formatEventTitle_`·`collectActiveProgressRows_` 제거
- **GAS `Scheduler.gs` v0.3.1** (`aea2298`, `7a3cb17`, `660baea`, `24089a3`): **`moveRowOnCheck` 8분 행 수정 + 트리거 구조 전환.** TAT 계산이 날짜마다 공휴일 캘린더를 때리던 구조를 실행 1회 범위 메모로 접어 연도당 1회로 축소, 조회 실패해도 throw 없이 주말만 제외, 기간 상한 400일. + 설치형 onEdit 트리거가 통째로 죽은 상태를 우회하기 위해 **간이 트리거 `onEdit`** 도입(등록·승인 불필요) + **`processCheckedRowsNow`**(M열 TRUE 행 일괄 이관)와 **`enableAutoMoveTrigger`**(5분 시간 트리거)로 3중 경로 확보 + 진단용 `pingOnEdit`·`whichSpreadsheetAmIBoundTo`

**시도했다가 폐기/실패**:
- L/S 더블클릭 토글 (drag region 위 React 이벤트 미수신 + UX 혼동)
- 리사이즈 후 border invalidate fix (모든 시도 실패 → border 자체 폐기)
- 시스템 이모지 패널 자동 닫기 (Win+. 토글이 위치 이동 버그)
- 캘박 식별을 rowId hidden tag로 하기 (라벨이 깨지면 폭주로 직결 → 메일제목 기반으로 대체)
- 이관 중복 체크를 UUID로 하기 (행 복사 환경에서 UUID가 고유하지 않음 → 6-field 키로 대체)
- 공유 체크 이관을 설치형 onEdit 트리거에만 의존하기 (트리거 사망 시 전면 마비 → 간이 트리거 + 시간 트리거 다중화)

---

## 즉시 컨텍스트 (새 대화방 시작 시)

> 디자인팀 위젯. Electron + React. 6명 디자인팀이 시트 안 열고 본인 스케줄·공유대기·백업 관리·새 일정 알림·마감일 그룹·비고 메모 복사까지 한 화면에.
>
> 디자인 = v10 그라데이션 헤더(핑크) + 카드형 본문 (라이트 단일, hue 슬라이더, 블랙 프리셋).
>
> 사이즈: **L 400×620 (가장자리 드래그 확대, customSize 저장)** / **S 200×80 (가로형 컴팩트)**
>
> 인프라 풀세트: 캐싱·스켈레톤·persistent NEW·에러 코드 E01-E99·알림 토글·action whitelist·Windows 폰트 보정 + **electron-updater 자동 업데이트 + useActionQueue 직렬 큐 + STALE 자동 재시도 + net.fetch/시스템 프록시 대응**.
>
> **현 단계 (2026-08): 위젯 v0.2.10 배포 완료 / GAS Scheduler.gs v0.3.1.** 위젯은 프록시 환경 네트워크 실패 해소 + 네트워크 진단 로그 확보. GAS는 캘박을 **메일제목(J열 메모) 기반**으로 재설계했고, 공유 체크 이관은 **간이 트리거 + 5분 시간 트리거 + 수동 ▶ 3중 경로**로 다중화됨.
>
> **이 프로젝트의 반복 패턴 (새 작업 전 반드시 인지)**: 사고의 뿌리가 거의 항상 같다 — **"사람이 셀을 다루는 방식"과 "기계가 식별하는 방식"의 불일치.** 디자이너들은 행을 복사하고 드래그로 채우고 일괄 붙여넣는다. 그래서 UUID는 중복되고, onEdit은 안 터지고, 상태 기반 트리거는 어긋난다. **새 기능을 설계할 때 "사람이 이걸 복사하면?" "드래그로 채우면?"을 먼저 통과시킬 것.** 눈에 보이는 값(메일 제목 등) 기준 + 시간 사이클이 이 팀에선 항상 더 견고했다.
>
> macOS .dmg는 Sequoia 이슈로 보류 (본인 dev 사용). 디자인팀 전부 Windows라 영향 X.
>
> 패치노트(CHANGES.txt) 콘텐츠 수정 시 사용자 컨펌 필수. 임의 추정 X.
>
> 사용자는 비개발자·디자인팀 리더. 결정 빠르고 디자인 안목 확실. "예뻐야 정이 간다."
