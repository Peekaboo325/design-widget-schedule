# HANDOFF.md — design-widget-schedule

> 새 대화방에서 이 파일을 통째로 컨텍스트로 주면 AI가 현재 상태를 빠르게 흡수합니다.

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
- **스택**: Electron 33 + React 18 + Vite (electron-vite) + electron-builder
- **버전**: v0.2.0 (Windows 배포 중)
- **빌드/실행**:
  - dev: `npm run dev` (정상 동작)
  - macOS dev launcher: `start-mac.command` 더블클릭 (자동 git pull + npm install + dev)
  - macOS 패키지: `npm run build:mac` → `.dmg` 생성됨, 단 실행 시 hang (후술)
  - Windows 패키지: `npm run build:win` → `dist\디자인팀 스케줄 위젯 Setup x.y.z.exe`
    - 한국어 NSIS 인스톨러, 패치노트 페이지 자동 표시
    - 첫 빌드 시 Windows '개발자 모드' 필요 (winCodeSign 캐시 symlink 생성용)

---

## 디렉토리 구조
```
design-widget-schedule/
├── CLAUDE.md / SPEC.md / CHECKLIST.md / HANDOFF.md
├── schedule-widget-api.gs       # GAS Apps Script (WIDGET_ prefix const)
├── electron-builder.yml         # 패키징 설정
├── start-mac.command            # 맥 더블클릭 dev 실행
├── electron/
│   ├── main.js                  # main (창/트레이/IPC/GAS프록시/캐시/seen/whitelist)
│   └── preload.js               # contextBridge API
├── resources/
│   ├── design-widget-schedule.ico  (Win)
│   └── design-widget-schedule.png  (Mac/Linux, 1024×1024)
├── src/
│   ├── App.jsx / App.module.css
│   ├── components/
│   │   ├── CompactWidget.jsx        # S 모드 가로형 단일 카드
│   │   ├── ScheduleView.jsx         # L 스케줄: 메트릭+그룹별 행카드+풋터
│   │   ├── BackupView.jsx           # L 백업 관리: 마감일/광고주 그룹 토글
│   │   ├── ChecklistView.jsx        # 체크리스트 탭
│   │   ├── SettingsPanel.jsx
│   │   ├── PendingPanel.jsx         # 공유 대기 풀스크린 슬라이드
│   │   ├── MemberPicker.jsx
│   │   ├── Dropdown.jsx
│   │   ├── Avatar.jsx
│   │   ├── EmojiPicker.jsx
│   │   └── Toast.jsx                # 카드형 (line-clamp 2, code 표시)
│   ├── hooks/
│   │   ├── useSettings.js
│   │   ├── useMembers.js            # 캐시
│   │   ├── useSchedule.js           # 캐시 + 5분 폴링 + 백오프 + backup 포함
│   │   └── useSeenSchedule.js       # persistent NEW 추적
│   ├── lib/
│   │   ├── api.js                   # GAS 래퍼 (error.code 부여)
│   │   ├── color.js                 # hue 평행이동 + perceptual L 보정
│   │   ├── errors.js                # E01~E99 코드 카탈로그
│   │   ├── format.js
│   │   └── emoji.js
│   └── styles/
│       └── global.css
```

---

## 현재 동작 (v0.2.0)

### 위젯 셸
- frameless + transparent + alwaysOnTop
- 사이즈: **L 400×620 (가장자리 드래그로 확대 가능) / S 200×80 (가로형 컴팩트)**
- L 모드만 `resizable: true` + `minWidth/Height = preset` (축소 불가, 확대만)
- 가장자리 드래그로 사이즈 변경 시 `customSize` store 저장 → 다음 실행/L 재진입 시 복원
- `hasShadow: false`, `skipTaskbar: true`
- 트레이 전용. close → hide만, 트레이 '종료'에서만 quit
- 단일 인스턴스 락
- 트레이 메뉴: 새로고침 / 위치 초기화 / ─ / 종료

### S 모드 (CompactWidget — 200×80)
- **진짜 컴팩트 가로형 단일 카드** — 전체 그라데이션 한 덩어리
- 좌: 큰 숫자 (잔여 수량 합, 38px/900)
- 중: "잔여 스케줄" + "최근 갱신 hh:mm" 두 줄
- 우: 확대 아이콘 (Square, 22×22) → 클릭 시 L 모드
- **치운 것**: 아바타·날짜·메타·탭·공유대기·새로고침·설정 (다 보려면 확대)
- 새로고침은 5분 자동 폴링 + 트레이 메뉴

### L 모드 헤더
- **그라데이션**: `linear-gradient(135deg, --widget-header-from → --widget-header-to)` (디폴트 핑크)
- hue 슬라이더로 두 색 H만 평행이동 (S/L 보존)
- 헤더 위 텍스트 색 = `--widget-on-header` (to의 WCAG luminance로 자동 흑/백)
- **아바타** (widget 직속 absolute, z-index 10) — 흰 알약 + 이모지
- 헤더 텍스트 stack: 날짜(18/800) + 메타(11/500, 65% opacity)
- **우측 아이콘** minimal icon-only: 사이즈 토글(Square/Restore) + 설정
- **+N 뱃지**: 흰 알약 + 진한 액센트 + 강한 펄스

### L 본문 — 3개 탭

**[스케줄]** — 메인 작업 흐름 (💛신규·유지보수 시트)
- 메트릭 카드: "잔여 스케줄" + 큰 카운트(30/900) — **수량 합산**
- 마감일 그룹화: 시트 색상 파싱 (`#ffdcef` 우선, 없으면 `#ff0000`)
  - 그룹 헤더: "5월 18일(월)까지 마감"
- 행 카드: 광고주 / 비고 / 수량(1이면 숨김) / chip
  - **비고 메모 클릭으로 메일 제목 클립보드 복사** (시트 노트 있을 때 underline). tooltip은 원본 비고 텍스트만
  - **NEW dot은 absolute + ::after pseudo로 펄스** — `transform: scale(1→3.5)` + `opacity: 0.7→0` (compositor-only, GPU 가속). 화사한 accent 색
  - **NEW 카드 어디든 클릭 시 markSeen** → 펄스 즉시 해제 (cursor:pointer로 유도)
  - NEW 카드만 `:has(.rowDot)`로 left padding 32px (펄스 자리 확보, 일반 카드는 그대로)
- 공유 대기 풋터 → PendingPanel 우측 슬라이드 인

**[백업 관리]** — 후처리 (💚완료 시트의 백업 미체크 행)
- 탭 옆 카운트 badge (압박감 😡, 0건이면 자동 숨김)
- 메트릭 카드: "백업 대기" + 카운트
- **그룹화 토글**: 마감일순 ↔ 광고주순
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
- 본문 우하단 흰 알약 + 액센트 아이콘
- 풋터 위 8px (bottom 68)
- 모든 탭에서 노출

### 설정 패널
- 외부 클릭/ESC 닫힘. 헤더 그대로 유지
- 항목: 사용자 / 항상 위 / 시작 시 자동 실행 / **알림 토글** / 투명도 / 테마 컬러
- 토글: iOS 표준 (흰 knob + 회색/액센트 트랙)
- 테마 컬러: hue 슬라이더 + **7개 프리셋 (hue 6개 + 블랙)**
  - 블랙: `BLACK_THEME_HEX = '#1a1a1f'`. hue 시스템 밖 — `isBlackTheme(hex)` 정확 일치 시
    `getBlackThemeColors()` 별도 컬러 셋 (헤더 짙은 그라데이션 + 흰 글자 + 검정 강조)
  - swatchActive는 inset 흰 ring (검정 swatch도 활성 표시 명확)
  - 블랙 → 다른 색 전환은 hue 슬라이더 만지면 자동

### 사이즈 토글
- L→S: 헤더의 RestoreIcon 한 클릭
- S→L: CompactWidget의 ExpandIcon 한 클릭
- L 모드는 추가로 가장자리 드래그로 자유 확대 (축소는 기본값까지만)
- 더블클릭 방식은 시도했다가 폐기 (드래그존/더블클릭존 혼동 + drag region 위에서 React 이벤트 안 잡힘)

### 알림
- 새 NEW → OS 토스트 (Notification API)
- **설정 토글로 on/off**. OFF 시 OS만 끔, 위젯 펄스+뱃지 유지

### 데이터 캐싱 (첫 실행 깜빡임 zero)
- `electron-store`: `cachedMembers`, `cachedScheduleByMember`
- IPC: `cache:get-members/set-members/get-schedule/set-schedule`
- useMembers/useSchedule: 캐시 즉시 로드 → 백그라운드 fetch → 덮어쓰고 캐시 갱신
- 첫 실행 캐시 없으면 ScheduleSkeleton (실 레이아웃 동일 사이즈)

### Persistent NEW
- `seenKeysByMember` store 영구 저장
- IPC: `cache:get-seen / set-seen`
- 컴퓨터 끈 사이 추가된 일정도 켜자마자 NEW로 잡힘

### 에러 코드 (`src/lib/errors.js`)
| 코드 | 메시지 | 원인 |
|---|---|---|
| E01 | 인터넷 연결을 확인해주세요. | NETWORK |
| E02 | 서버가 잠시 바빠요. 다시 시도해주세요. | GAS BUSY |
| E03 | 시트가 바뀌었어요. 새로고침 후 다시 시도해주세요. | GAS STALE |
| E04 | 잘못된 요청이에요. | GAS INVALID |
| E05 | 복사에 실패했어요. | clipboard |
| E99 | 알 수 없는 오류가 발생했어요. | catch-all |

- Toast 우측 알약으로 코드 표시. 팀원이 "E03 떴어요"만 알려줘도 진단 가능
- `console.error`에 원본 동시 로깅

### 보안 패치
- `main.js`의 `api:post` 핸들러에 `ALLOWED_POST_ACTIONS = {setStatus, setShare, setBackup}`
- 그 외 action은 GAS 도달 전 main에서 거부

### 컬러 시스템 (`src/lib/color.js`)
- `--widget-header-from / -to`, `--widget-on-header`, `--widget-accent / -strong / -soft`
- `--widget-surface / on-surface / fg / muted / overlay / border`
- 블랙 테마는 hue 시스템 밖 — `BLACK_THEME_HEX` / `isBlackTheme()` / `getBlackThemeColors()`

### 본문 카드 외곽 시각화 (border 없음)
- transparent + frameless 창의 **리사이즈 후 .bodyCard border invalidate 누락 Chromium 버그**
- 시도한 fix 전부 실패:
  - `webContents.invalidate()` (resize/resized 이벤트, 매 픽셀)
  - `backgroundColor: '#00000001'` (alpha 1/255 opaque 트릭)
  - `inset box-shadow` (paint 영역 안쪽 ring)
- 최종 해결: **border 완전 폐기 + 본문 카드에 radial-gradient**
  - `radial-gradient(ellipse 70% 90% at 50% 10%, #ffffff 35%, #fafbfc 100%)`
  - 중앙 흰색, 좌·우·하단 가장자리만 미미한 회색 톤
  - paint 영역 안의 배경색이라 invalidate 버그 영향 없음
  - 본문 안 흰 카드들과 톤 대비로 elevation 표현
- 스크롤 컨테이너 우측 padding 8px (ScheduleView / BackupView 둘 다)

### Focus outline
- global.css에서 `button:focus { outline: none }` (Chromium 노란 ring 제거)
- `button:focus-visible`만 유지 (키보드 Tab 탐색 접근성 — 실제로는 마우스 전용이라 안 보임)

### Toast
- 카드 (12px 라운드, line-clamp 2, word-break keep-all)
- 좌우 14px 풀폭. 두 줄 wrap
- 에러: 코드 알약 표시, 5초 자동 dismiss + Undo

### Windows 폰트 보정
- `font-render-hinting=none` Chromium 플래그 (ClearType 약화)
- `[data-platform='win32']`로 .date 800→850, .headerMeta 500→600
- macOS만 `disableHardwareAcceleration` (Windows는 GPU 살림)

---

## GAS API (`schedule-widget-api.gs`)

### 시트 구조
- **💛신규·유지보수** (작업 진행 중)
  - 데이터 시작: 10행
  - E(광고주) F(작업자) I(수량) **J(비고+메모=메일제목)** K(상태) L(공유)
  - 9행 M~ 끝열: 날짜 헤더 (Date 객체)
  - M~ 끝열 배경색: 핑크(`#ffdcef`)/빨강(`#ff0000`)으로 마감일 표시
- **💚완료** (공유 처리 시 자동 이관)
  - E(광고주) F(작업자) I(수량) J(비고) **M(백업)** O(마감일)
  - 월말마다 700행 누적 → 다음 달 비움 (시트 최적화 불필요)

### Const namespace
- `WIDGET_` prefix로 다른 .gs 파일(moveRowOnCheck 등)과 격리
- `WIDGET_SCHEDULE_SHEET`, `WIDGET_DONE_SHEET`, `WIDGET_COL`, `WIDGET_DONE_COL` 등

### GET
- `?type=members` → `{ members: string[] }`
- `?type=schedule&member=이름` →
  ```json
  {
    "schedule": [{ "rowIndex", "광고주", "비고", "수량", "상태", "due": "2026-05-21" | null, "noteText": "..." | null }],
    "pending":  [{ "rowIndex", "광고주", "비고", "수량", "noteText" }],
    "backup":   [{ "rowIndex", "광고주", "비고", "수량", "마감일": "2026-05-21" | null }],
    "summary":  { "total", "pending", "backup" }
  }
  ```

### POST
- `{ action: "setStatus", rowIndex, value, expect }`
- `{ action: "setShare",  rowIndex, value, expect }`
- `{ action: "setBackup", rowIndex, value, expect }` — 💚완료 시트 M열 토글
- LockService(10s) + Optimistic Locking
- 응답: `{ ok, action, rowIndex, value }` 또는 `{ error, code: STALE|BUSY|INVALID }`

### deploy
- `main.js`의 `GAS_BASE` 상수에 URL 박힘
- 사용자가 Apps Script 콘솔에서 직접 갱신·재배포 → 새 URL이면 알려줌
- 액세스 권한: **"모든 사용자"** (Google 계정 가진 모든 사용자 X — 익명 fetch 필요)

---

## 패키징 진행 상황

### electron-builder.yml
- `appId`: `com.peekaboo325.design-widget-schedule`
- `productName`: `디자인팀 스케줄 위젯`
- `extraMetadata.description`: `디자인팀 스케줄 위젯` (Windows 시작 프로그램 표시명을 productName과 통일)
- Mac: dmg (x64 + arm64), `identity: '-'` (ad-hoc 서명)
- Windows NSIS:
  - 사용자 단위 설치, 바탕화면+시작메뉴 바로가기
  - 한국어 강제: `installerLanguages: [ko_KR]` + `language: '1042'`
  - **`license: CHANGES.rtf`** — 라이선스 페이지 자리에 패치노트 표시
- 자동 업데이트 `publish: null`

### 패치노트 (CHANGES.txt → CHANGES.rtf)
- `CHANGES.txt` (UTF-8, git 추적) — 사용자 친근한 톤 한국어
- `scripts/generate-changes-rtf.mjs` — UTF-8을 `\uXXXX` escape RTF로 변환
  - NSIS RichEdit이 한국어 ANSI 디코딩 실패하던 깨짐 버그 회피
- `package.json`의 `build:changes` script → `build:mac/win/all` 직전에 자동 실행
- `CHANGES.rtf`는 빌드 산출물이라 `.gitignore`
- **CHANGES.txt 콘텐츠는 매번 사용자 컨펌 필요** (CLAUDE.md 작업 원칙)

### 진행 상태
| 환경 | 상태 |
|---|---|
| **dev 모드** (`npm run dev` 또는 `start-mac.command`) | ✅ 정상 (Mac/Windows 둘 다) |
| **macOS .dmg** | ⚠ 빌드 성공, 실행 시 hang (Sequoia + unsigned + Electron 33 조합 이슈) |
| **Windows .exe v0.2.0** | ✅ 회사 PC 직접 빌드 성공 → 디자인팀 5명 배포 단계 |

### macOS 패키지 hang 이슈
- `app.whenReady()` 콜백 호출 안 됨 → dock에서만 튀고 화면 X
- 원인 추정: **macOS Sequoia + Electron 33 + unsigned 조합**의 알려진 데드락
  - 보안 데몬(taskgated)이 unsigned 헬퍼 프로세스 검문하느라 메인 스레드 정지
- 시도한 우회법:
  - `use-mock-keychain` + `disable-gpu-sandbox` + `disableHardwareAcceleration`
  - electron-builder `identity: '-'`
  - quarantine 제거 (xattr)
  - 재부팅 / 좀비 프로세스 정리
- 모두 효과 없음. **본인 맥 한정. 디자인팀(전부 Windows) 배포에 영향 X**
- 본인 맥은 `start-mac.command`로 dev 모드 사용

### 진단 로그 인프라
- main.js 시작 시점부터 단계별 `stamp(label)` → `~/widget-debug.log`
- `uncaughtException` / `unhandledRejection` 핸들러도 동일 파일
- crash/hang 진단에 매우 유용

---

## 다음 단계

### 1순위 — v0.2.0 디자인팀 배포 + 피드백 수집
- 본인 회사 PC에서 v0.2.0 .exe 빌드 → 자체 테스트 완료
- 디자인팀 5명에게 .exe 배포 (사내 메신저/공유드라이브)
- 첫 실행 SmartScreen 안내 한 줄 동봉

### 2순위 — 실 사용 후 폴리시
- 디자인팀 5명 실 데이터에서 나오는 엣지 케이스
- 알림 정책 조정 / 추가 기능 (사용자 컨펌 후 추가)

### 3순위 — macOS packaging 재시도 (필요 시)
- Electron 30 LTS 다운그레이드 또는 code signing ($99/년)
- 본인 맥은 dev 모드로 사용 중이라 우선순위 낮음

---

## QC 히스토리 (핵심 마일스톤)
- **v1~v7**: 기본 셸 + 데이터 fetch + 디자인 초안
- **v8** (`7988df7`): 폴더 탭 inverse curve
- **v9** (`c94deac → 8731085`): 풀컬러 시도 → revert
- **v10** (`f9595cd`): **그라데이션 헤더 + 카드형 행 + 메트릭 카드** (현재 베이스)
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
- **macOS hang 진단** (`66b5a60`~`0b9360d`): 미해결
- **Windows 폰트 보정** (`5103151`): font-render-hinting + weight 보정
- **start-mac.command** (`a9559c6`, `2dfe303`): 더블클릭 런처 + 자동 git pull
- **백업 관리 탭** (`b7e5ca4`): 💚완료 시트 백업 미체크 추적
- **GAS WIDGET_ prefix** (`d15add0`): namespace 충돌 회피
- **광고주순 중복 제거 + 체크리스트 라벨 + action whitelist** (`60374bf`)
- **S 모드 진짜 컴팩트** (`b52e231`): CompactWidget 240×96 가로형
- **v0.1.0 Windows .exe 빌드 성공**: 한국어 NSIS 인스톨러 + 자동실행 등록 정상
- **v0.2.0 마일스톤**:
  - 사이즈 커스텀: L 400×620 + 가장자리 드래그 + customSize 저장
  - S 모드 컴팩트화: 240×96 → 200×80
  - NEW dot 펄스 개선: box-shadow ring → `::after` + scale 4배 (compositor-only)
  - NEW 카드 클릭 시 markSeen (펄스 즉시 해제)
  - 블랙 테마 프리셋 (hue 시스템 밖 별도 분기)
  - 본문 radial 그라데이션으로 외곽 시각화 (border invalidate 버그 우회)
  - 버튼 focus 노란 ring 제거 (global.css)
  - 스크롤 컨테이너 우측 padding 8px (스크롤바 ↔ 카드 여백)
  - 비고 tooltip 단순화 (긴 안내 → 원본 텍스트만)
  - 이모지 picker 자동 닫힘 제거 (시스템 패널 닫기 불가능 → 일관성 유지)
  - Windows 시작 프로그램 표시명 통일 (extraMetadata.description)
  - NSIS 라이선스 페이지에 패치노트 표시 (CHANGES.txt → CHANGES.rtf 자동 변환)
- **시도했다가 폐기/실패**:
  - L/S 더블클릭 토글 (drag region 위 React 이벤트 미수신 + UX 혼동)
  - 리사이즈 후 border invalidate fix (모든 시도 실패 → border 자체 폐기)
  - 시스템 이모지 패널 자동 닫기 (Win+. 토글이 위치 이동 버그)

---

## 즉시 컨텍스트 (새 대화방 시작 시)

> 디자인팀 위젯. Electron + React. 6명 디자인팀이 시트 안 열고 본인 스케줄·공유대기·백업 관리·새 일정 알림·마감일 그룹·비고 메모 복사까지 한 화면에.
>
> 디자인 = **v10 그라데이션 헤더(핑크) + 카드형 본문** (라이트 단일, hue 슬라이더, 블랙 프리셋).
>
> 사이즈: **L 400×620 (가장자리 드래그로 확대 가능, customSize 저장)** / **S 200×80 (가로형 컴팩트)**
>
> 인프라 풀세트: 캐싱·스켈레톤·persistent NEW·에러 코드 E01-E99·알림 토글·action whitelist·Windows 폰트 보정.
>
> **현 단계: v0.2.0 Windows .exe 빌드 완료 → 디자인팀 5명 배포 직전.** macOS .dmg는 Sequoia 이슈로 보류 (본인 dev 사용). 디자인팀 전부 Windows라 macOS 이슈 영향 X.
>
> 패치노트(CHANGES.txt) 콘텐츠 수정 시 사용자 컨펌 필수. 임의 추정 X.
>
> 사용자는 비개발자·디자인팀 리더. 결정 빠르고 디자인 안목 확실. "예뻐야 정이 간다."
