# HANDOFF.md — design-widget-schedule

> 새 대화방에서 이 파일을 통째로 컨텍스트로 주면 AI가 현재 상태를 빠르게 흡수합니다.
> **최신 상태 기준**: v0.2.4 (2026-05-24)

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
- **레포**: `Peekaboo325/design-widget-schedule`
- **스택**: Electron 33 + React 18 + Vite (electron-vite) + electron-builder + **electron-updater**
- **버전**: **v0.2.4** (시트 L열 ID 기반 식별로 전환된 안정화 버전)
- **빌드/실행**:
  - dev: `npm run dev`
  - macOS dev launcher: `start-mac.command` 더블클릭 (자동 git pull + npm install + dev)
  - macOS 패키지: `npm run build:mac` → `.dmg` (실행 hang 이슈 후술)
  - Windows 패키지: `npm run build:win` → `dist\디자인팀 스케줄 위젯 Setup x.y.z.exe`
    - 한국어 NSIS 인스톨러, 패치노트 페이지 자동 표시
    - 첫 빌드 시 Windows '개발자 모드' 필요 (winCodeSign 캐시 symlink 생성용)
    - `--publish always` 박힘 → 빌드 즉시 GitHub Release 업로드 → electron-updater가 픽업

---

## 디렉토리 구조
```
design-widget-schedule/
├── CLAUDE.md / SPEC.md / CHECKLIST.md / HANDOFF.md
├── AUDIT.md                        # v0.2.3 기준 전수 점검 보고서
├── MIGRATION_v0.2.4.md             # 시트 L열 ID 도입 마이그레이션 가이드
├── CHANGES.txt                     # 사용자용 패치노트 (UTF-8, git 추적)
├── schedule-widget-api.gs          # GAS Apps Script (WIDGET_ prefix const)
├── legacy-gas/                     # 시트 자동화용 GAS (위젯과 별개 프로젝트)
│   ├── Scheduler.gs                #   행 이동·휴일·자동 정렬
│   └── Synccompletedtodatasheet.gs #   💚완료 → 업무 데이터 시트 동기화
├── electron-builder.yml            # 패키징 설정 (+ publish: github)
├── start-mac.command               # 맥 더블클릭 dev 실행
├── electron/
│   ├── main.js                     # main (창/트레이/IPC/GAS프록시/캐시/seen/whitelist/updater)
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
│   │   ├── ChecklistView.jsx           # 체크리스트 탭
│   │   ├── SettingsPanel.jsx
│   │   ├── PendingPanel.jsx            # 공유 대기 풀스크린 슬라이드
│   │   ├── MemberPicker.jsx
│   │   ├── Dropdown.jsx
│   │   ├── Avatar.jsx
│   │   ├── EmojiPicker.jsx
│   │   └── Toast.jsx                   # 카드형 (line-clamp 2, code 표시)
│   ├── hooks/
│   │   ├── useSettings.js
│   │   ├── useMembers.js               # 캐시
│   │   ├── useSchedule.js              # 캐시 + 5분 폴링 + 백오프 + backup 포함
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

## 현재 동작 (v0.2.4)

### 위젯 셸
- frameless + transparent + alwaysOnTop
- 사이즈: **L 400×620 (가장자리 드래그로 확대 가능) / S 200×80 (가로형 컴팩트)**
- L 모드만 `resizable: true` + `minWidth/Height = preset` (축소 불가, 확대만)
- 가장자리 드래그로 사이즈 변경 시 `customSize` store 저장 → 다음 실행/L 재진입 시 복원
- `hasShadow: false`, `skipTaskbar: true`
- 트레이 전용. close → hide만, 트레이 '종료'에서만 quit
- 단일 인스턴스 락
- **트레이 메뉴**: `버전 v{현재}` (정보용, 클릭 불가) / ─ / 새로고침 / 위치 초기화 / ─ / 종료

### 자동 업데이트 (electron-updater, v0.2.2+)
- `publish: github` (electron-builder.yml) → 빌드 시 GitHub Release에 latest.yml + 인스톨러 업로드
- 앱 시작 5초 후 + 1시간마다 `autoUpdater.checkForUpdates()`
- `autoDownload: true`, `autoInstallOnAppQuit: true` → 다음 종료 시 조용히 설치
- updater 이벤트 전체를 `~/widget-debug.log`에 stamp (checking/available/downloaded/error)
- **한계**: 사용자가 위젯을 안 끄면 영원히 안 설치됨 (AUDIT.md 1-3 참조)

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

## GAS API (`schedule-widget-api.gs`) — v0.2.4 기준

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
- `Scheduler.gs`: 행 이동·정렬·휴일 처리
- `Synccompletedtodatasheet.gs`: 💚완료 → 업무 데이터 시트 동기화 (ID 컬럼 전파 포함)
- v0.2.4에서 함께 업데이트됨. `dashboard-api.gs`는 정리됨(삭제)

---

## 패키징 진행 상황

### electron-builder.yml
- `appId`: `com.peekaboo325.design-widget-schedule`
- `productName`: `디자인팀 스케줄 위젯`
- `extraMetadata.description`: `디자인팀 스케줄 위젯`
- Mac: dmg (x64 + arm64), `identity: '-'` (ad-hoc 서명)
- Windows NSIS: 사용자 단위 설치, 바탕화면+시작메뉴 바로가기, 한국어 강제, **`license: CHANGES.rtf`**
- **`publish: github`** — 토큰 없으면 dist에만 만들고 publish 스킵

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
| **Windows .exe** | ✅ v0.2.0~v0.2.4 빌드 완료, 디자인팀 5명 배포 + 자동 업데이트 동작 중 |

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

### 1순위 — v0.2.4 마이그레이션 후 안정화 관찰
- v0.2.4는 **시트 구조 변경(L열 ID 신설)** 동반 → `MIGRATION_v0.2.4.md` 절차로 시트·GAS·위젯 동시 업데이트 완료
- 자동 업데이트로 디자인팀 5명에게 v0.2.4 배포 중. 위젯 안 끄면 안 깔리는 한계는 인지 (AUDIT 1-3)
- 첫 실행 시 NEW가 0건으로 리셋되는 것 정상 (식별 키 변경)
- 가짜 NEW (마감일 변경 케이스) 해소 여부 모니터링

### 2순위 — AUDIT.md 잔여 항목
- 1-1: 마감일 변경 가짜 NEW → v0.2.4 ID 도입으로 해소됐는지 확인
- 1-2: 시트 구조 변경 시 위젯 어긋남 → 헤더 텍스트 기반 동적 컬럼 lookup 도입 검토
- 1-3: 자동 업데이트 미적용 (위젯 안 끔) → 트레이 메뉴에 "지금 재시작하고 업데이트" 추가 검토

### 3순위 — macOS packaging 재시도 (필요 시)
- Electron 30 LTS 다운그레이드 또는 code signing ($99/년)
- 우선순위 낮음

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

**시도했다가 폐기/실패**:
- L/S 더블클릭 토글 (drag region 위 React 이벤트 미수신 + UX 혼동)
- 리사이즈 후 border invalidate fix (모든 시도 실패 → border 자체 폐기)
- 시스템 이모지 패널 자동 닫기 (Win+. 토글이 위치 이동 버그)

---

## 즉시 컨텍스트 (새 대화방 시작 시)

> 디자인팀 위젯. Electron + React. 6명 디자인팀이 시트 안 열고 본인 스케줄·공유대기·백업 관리·새 일정 알림·마감일 그룹·비고 메모 복사까지 한 화면에.
>
> 디자인 = v10 그라데이션 헤더(핑크) + 카드형 본문 (라이트 단일, hue 슬라이더, 블랙 프리셋).
>
> 사이즈: **L 400×620 (가장자리 드래그 확대, customSize 저장)** / **S 200×80 (가로형 컴팩트)**
>
> 인프라 풀세트: 캐싱·스켈레톤·persistent NEW·에러 코드 E01-E99·알림 토글·action whitelist·Windows 폰트 보정 + **electron-updater 자동 업데이트 + useActionQueue 직렬 큐 + STALE 자동 재시도**.
>
> **현 단계: v0.2.4 배포 완료** — 시트 L열 UUID 기반 식별로 전환. 행 이동·정렬·마감일 변경 시 가짜 NEW 알림 폭주 근본 해결. 자동 업데이트로 5명에게 배포 중 (위젯 안 끄면 미설치 한계는 AUDIT 1-3로 추적).
>
> macOS .dmg는 Sequoia 이슈로 보류 (본인 dev 사용). 디자인팀 전부 Windows라 영향 X.
>
> 패치노트(CHANGES.txt) 콘텐츠 수정 시 사용자 컨펌 필수. 임의 추정 X.
>
> 사용자는 비개발자·디자인팀 리더. 결정 빠르고 디자인 안목 확실. "예뻐야 정이 간다."
