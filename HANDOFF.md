# HANDOFF.md — design-widget-schedule

> 새 대화방에서 이 파일을 통째로 컨텍스트로 주면 AI가 현재 상태를 빠르게 흡수합니다.
> 작업 흐름·결정 이력·기술 스택·다음 단계까지 한 번에 정리됨.

---

## 사용자 컨텍스트
- **사용자**: 비개발자, 디자인팀 팀 리더 (광고 디자인팀)
- **목적**: 디자인팀 6명을 위한 바탕화면 위젯. 본인 스케줄·공유대기·셀프 체크 한 화면에.
- **꿈**: 프로덕트 디자인팀 만들기. 이 위젯은 그 첫 케이스 스터디이자 사내 도구.
- **시트 운영자도 사용자 본인** — 데이터 스키마 결정권 100% 본인.
- **개발 흐름**: 시트 함수 → Apps Script → 독립 앱(Electron)으로 진화.

## 작업 원칙 (CLAUDE.md 요약)
- 결정 빠른 스타일. 옵션 던지면 즉답하는 편.
- 자체 결정 박는 것보단 협의 선호하되, 결정 후엔 빠르게 진행.
- "예뻐야 정이 간다" — 미적 완성도가 채택률 결정 요소라는 본인 철학.
- 모든 작업 단위마다 자동 git add → commit → push (한국어 커밋 메시지).
- 푸시 대상은 **현재 작업 브랜치**. 작업 브랜치는 매번 바뀔 수 있으므로 CLAUDE.md / 세션 시작 시 안내를 따를 것.
- **작업 브랜치 푸시 후 매번 `main`에도 fast-forward 머지하여 푸시.** 다른 컴퓨터에서 clone/pull 받을 때 항상 최신 상태가 되도록.

---

## 프로젝트 개요
- **레포**: `Peekaboo325/design-widget-schedule`
- **스택**: Electron 33 + React 18 + Vite (electron-vite)
- **빌드**: `npx electron-vite build`, 실행: `npm run dev`
- **타깃**: Windows 우선 (디자인팀 PC), Mac도 동작 (사용자 본인 집)
- **packaging은 아직 안 함** (electron-builder 미설정 — 추후 단계)

## 디렉토리 구조
```
design-widget-schedule/
├── CLAUDE.md                    # 작업 원칙
├── SPEC.md                      # 요구사항 스펙
├── CHECKLIST.md                 # 셀프 체크리스트 원문
├── HANDOFF.md                   # 이 파일
├── schedule-widget-api.gs       # GAS Apps Script (배포 필수)
├── electron/
│   ├── main.js                  # main 프로세스 (창/트레이/IPC/GAS프록시/캐시)
│   └── preload.js               # contextBridge API 노출
├── resources/
│   ├── design-widget-schedule.ico  # Windows 트레이/창 아이콘
│   └── design-widget-schedule.png  # macOS / Linux 트레이/창 아이콘
├── src/
│   ├── index.html               # CSP, 진입점
│   ├── main.jsx                 # React 진입
│   ├── App.jsx                  # 위젯 셸, 헤더, 본문 분기
│   ├── App.module.css           # 단순 둥근 카드 + 그라데이션 헤더 + 본문 layered
│   ├── assets/fonts/
│   │   └── SUIT-Variable.woff2  # 번들 폰트
│   ├── components/
│   │   ├── ScheduleView.jsx     # L: 메트릭 카드 + 행 카드 + 풋터 / S: 큰 숫자 + 뱃지 / ScheduleSkeleton
│   │   ├── ChecklistView.jsx    # 디자인 체크 탭
│   │   ├── SettingsPanel.jsx    # ⚙ 설정창 (사용자/항상 위/자동실행/투명도/테마컬러)
│   │   ├── MemberPicker.jsx     # 최초 멤버 선택
│   │   ├── Dropdown.jsx         # 커스텀 드롭다운
│   │   ├── Avatar.jsx           # 헤더 좌측 원형 이모지 아바타
│   │   ├── EmojiPicker.jsx      # 프리셋 10 + 직접 입력(1자) 피커
│   │   ├── Toast.jsx            # 카드형 토스트 (wrap 허용 + Undo)
│   │   └── PendingPanel.jsx     # 공유 대기 풀스크린 슬라이드 패널
│   ├── hooks/
│   │   ├── useSettings.js       # store + 테마 적용 (라이트 단일)
│   │   ├── useMembers.js        # 팀원 목록 fetch + 캐시
│   │   ├── useSchedule.js       # 5분 폴링 + 백오프 + mutate + 캐시
│   │   └── useSeenSchedule.js   # 새 스케줄 NEW 추적 (세션)
│   ├── lib/
│   │   ├── api.js               # GAS GET/POST 래퍼
│   │   ├── color.js             # hue 평행이동 + perceptual L 보정
│   │   ├── format.js            # shortName, nextStatus
│   │   └── emoji.js             # 멤버명 해시 → 자동 이모지 폴백
│   ├── data/
│   │   └── checklist.js         # 디자인 체크리스트 데이터
│   └── styles/
│       └── global.css           # CSS 변수, 스크롤바, 폰트, .skeleton 유틸
```

---

## 현재 동작 (v10+ 디자인 시스템)

### 위젯 셸
- frameless + transparent + alwaysOnTop
- **단순 둥근 카드** (R=30 L, R=20 S) + `overflow: hidden` + **옅은 1px border** (그림자 폐기)
- 헤더 그라데이션 + 본문 흰 카드(layered, `margin-top: -14`로 헤더 위로 떠 있음)
- `hasShadow: false`, `resizable: false` (드래그 리사이즈 폐기)
- `skipTaskbar: true` (트레이 전용)
- 사이즈: **S 240×220 / L 360×560** (M 폐기)
- 트레이 아이콘 (좌클릭 토글, 우클릭 메뉴: 새로고침 / 위치 초기화 / ─ / 종료)
- close 시도 시 hide만 (트레이 '종료'에서만 실제 quit)
- 화면 밖 보호: `isWindowOnAnyDisplay` + `showWindowSafely` + `resetWindowPosition`
- **단일 인스턴스 락**

### 헤더
- **그라데이션** `linear-gradient(135deg, --widget-header-from → --widget-header-to)`
  - 디폴트: `#f39ebb → #ff86a2` (핑크)
  - 사용자가 hue 슬라이더로 변경 시 두 색의 H만 평행이동 (S/L은 각자 유지)
  - 옐로/시안 영역은 자동 perceptual L 보정 (시각 무게감 일정)
- 헤더 위 텍스트 색 = `--widget-on-header` (to 컬러의 WCAG luminance로 자동 흑/백)
  - 옐로/라임/시안/그린 → 검정, 빨강/블루/마젠타/핑크 → 흰
- **아바타** (좌측, widget 직속 absolute, z-index 10) — 흰 알약 + 이모지
  - 클릭 → 이모지 피커 펼침 (헤더가 자식이면 본문 카드에 가려져서 z-index 충돌 → absolute 분리로 해결)
  - 사이즈: L 44, S 28
- 헤더 텍스트 stack (centered):
  - 큰 위계: 날짜 `5월 20일 (수)` (18/800 L, 13/800 S)
  - 작은 위계: `수빈 · 최근 갱신 17:00` (11/500 65% opacity)
  - 메타 정보는 모든 탭 + 설정창에서 일관되게 노출
- **우측 아이콘** (minimal icon-only, B안) — transparent + 아이콘만, hover 시 옅은 배경
  - 사이즈 토글 (Square / Restore 아이콘)
  - 설정 (Gear)
  - 활성 상태(설정 열림)는 더 진한 배경
- **+N 뱃지** — 새 스케줄 NEW 카운트. 흰 알약 + 액센트 텍스트 + **강한 펄스 (scale + ring expand)**

### 본문 (L 모드)
- **메트릭 카드** — 옅은 액센트 배경 + "잔여 스케줄" 라벨 + 큰 카운트 (30/900 accent-strong)
  - 카운트 = 행 수가 아니라 **수량 합산** (사용자에게 '건' = 수량 단위)
  - 캘린더 아이콘 제거 (디자인 톤 안 맞아서 폐기)
- **행 카드 리스트** — 흰 카드 + 옅은 border
  - 컬럼: [optional dot] / 광고주(14/800) / 비고(13/600 fg) / 수량(11/500 muted, fixed 32px) / chip
  - 비고가 수량보다 시각 위계 위
  - 수량은 1이면 빈 텍스트, 2 이상만 'n건' (대부분 1이라 노이즈 제거)
  - **NEW 0건이면 dot 컬럼 자체 제거** (`hasAnyNew` 분기) → 좌우 여백 균등
  - NEW 항목: 행 좌측 dot + 강한 펄스(scale + ring expand)
  - chip 상태별: 진행(액센트 알약), 대기(옅은 검정 알약), 미정(더 옅게). 클릭 시 다음 상태 순환
- **공유 대기 풋터** — 메일 아이콘 + "공유 대기" + 카운트(수량 합) + `›` 화살표
  - 클릭 시 **PendingPanel 슬라이드 인** (우측에서 본문 풀스크린 차지)

### 본문 (S 모드)
- 큰 숫자 (수량 합) + "공유 대기 N건" 뱃지
- 새로고침 FAB은 우하단 (공유대기 뱃지와 baseline 일치)
- 모든 영역 padding 14로 grid align 통일 (헤더/본문/FAB/뱃지 좌우상하 라인 일치)

### PendingPanel (공유 대기 풀스크린)
- 본문 풀스크린 차지. 풋터의 `›` 의미에 맞춰 우측에서 슬라이드 인 (0.24s ease-out)
- 상단: `< 뒤로` 버튼 + "공유 대기 N건" (N은 accent-strong)
- 리스트: 흰 카드 행. 광고주 / 비고 / 수량 / **완료 버튼**
- 완료 버튼: 옅은 액센트 + 진한 액센트 텍스트 (chip과 통일 톤)
- ESC로 뒤로
- 마지막 항목 처리 후 0건 되면 자동으로 패널 닫힘

### 새로고침 FAB
- 본문 우하단 floating (헤더가 아닌 빈 본문 지면 활용)
- L: 풋터 위 8px 띄움 (bottom 68)
- S: 우하단 코너 (공유대기 뱃지와 baseline 일치)
- 흰 알약 + 액센트 아이콘 + 옅은 그림자 (헤더 minimal과 대비)
- 스케줄 / 디자인 체크 탭 모두에서 노출

### 디자인 체크 탭
- L 사이즈에서만 활성 (S로 가면 강제 스케줄 탭 복귀)
- 6개 섹션 19개 항목, 체크박스
- **저장 없음** (SPEC). 위젯 재시작 시 초기화
- 진행률 표시, RESET 버튼
- 탭 라벨은 "디자인 체크" (기존 "셀프 체크"에서 변경)

### 설정 패널 (⚙)
- 외부 클릭 / ESC로 닫힘
- 헤더는 그대로 유지 (메타 정보 표시 포함)
- 항목: **사용자 / 항상 위 고정 / 시작 시 자동 실행 / 투명도 / 테마 컬러**
  - **크기 옵션 폐기** (헤더 사이즈 토글로 단일화)
  - **다크/라이트 모드 폐기** (라이트 단일)
- 테마 컬러: hue 슬라이더(무지개 트랙) + 6 hue 프리셋
- 토글: iOS 표준 톤 (흰 knob + 옅은 회색/액센트 트랙)

### 사이즈 토글
- 헤더 우상단 버튼 한 번에 S ↔ L
- L 상태: Restore(두 사각형 겹침) 아이콘 = "작게"
- S 상태: Square(단일 사각형) 아이콘 = "크게"
- 드래그 리사이즈는 폐기 (`resizable: false`)

### 데이터 캐싱 — 첫 실행 깜빡임 방지
- `electron-store`에 마지막 멤버 목록 + 활성 멤버 스케줄 저장
- IPC: `cache:get-members` / `set-members` / `get-schedule` / `set-schedule`
- `useMembers`: 캐시에서 즉시 로드 → 백그라운드 fetch → fresh로 덮어쓰고 캐시 갱신
- `useSchedule`: memberName 변경 시 캐시에서 즉시 stale → fetch → fresh
- `lastUpdated`는 timestamp(ms)로 직렬화, 복원 시 `new Date()`

### 스켈레톤 UI (첫 실행 시)
- 캐시 없는 첫 실행에서도 레이아웃 깜빡임 없도록
- `global.css`에 `.skeleton` 유틸 + shimmer 키프레임 (공용)
- 본문: `ScheduleSkeleton` — 메트릭 박스 + 카드 3개 + 풋터 (실제 컴포넌트와 같은 사이즈)
- 헤더: 아바타 자리 회색 원, 메타 자리 회색 라인 (헤더 그라데이션 위에서 보이도록 on-header alpha)
- members 로딩 중에 savedMember 잠정 활성 → picker 잘못 뜨는 깜빡임 제거

### 컬러 시스템 (`src/lib/color.js`)
- **`--widget-header-from / -to`** — 헤더 그라데이션 두 색 (hue 평행이동 + perceptual L 보정)
- **`--widget-on-header`** — 헤더 텍스트 자동 흑/백 (`to`의 luminance > 0.5면 검정)
- **`--widget-accent`** — 헤더 grad와 어울리는 옅은 톤
- **`--widget-accent-strong`** — 흰 배경 위 강조용 진한 톤 (hue별 perceptual L 보정)
  - 옐로/시안 영역은 baseline L 0.48에서 최대 -0.10 보정 → 가독성 일정
- **`--widget-accent-soft`** — 메트릭 카드/chip 배경용 옅은 hue (S 85%, L 94%)
- **`--widget-surface / on-surface`** — 흰 알약 (아바타·뱃지·메트릭 카드 등)
- **`--widget-fg / muted / overlay / border`** — 본문 텍스트·라인 (검정 알파)

### 새 스케줄 알림 (세션 기반)
- 키: `광고주|비고`
- 멤버별 메모리 기준선
- 첫 fetch 결과는 자동 "본 것"으로 등록 → NEW 도배 방지
- 이후 fetch에서 기준선에 없는 키 = NEW (행 dot + 헤더 +N 알약 뱃지)
- 사라진 키는 자동 정리 → 옮겼다가 다시 들어온 작업도 NEW로 잡힘
- +N 클릭 → 현재 키 전체로 기준선 갱신 (NEW 사라짐)
- 새 NEW 발생 시 OS 토스트 알림 (Notification API)
- 펄스 애니메이션: ring expand + scale (1.4~1.6s ease-out, 강하고 유려한 톤)

### 시트 쓰기 (POST)
- GAS doPost로 `setStatus` / `setShare` 액션
- **LockService** — 동시 실행 직렬화 (10초 대기)
- **Optimistic Locking** — `expect: {광고주, 비고}`가 시트 현재 값과 다르면 거부 (STALE)
- 실패 시 자동 refresh + 에러 토스트 (축약 메시지)

### Toast
- 알약 → **카드** (라운드 12px, `line-clamp: 2`, `word-break: keep-all`)
- 좌우 14px 풀폭 활용 → 두 줄까지 wrap
- 에러 메시지 축약 ("변경 실패. 잠시 후 다시 시도해주세요.")
- Undo 액션 5초

### 이모지 피커
- 프리셋 10 (🐶🐱🐰🐻🐼🌸👑💸🍩🎀) + 직접 입력 **1자만** 허용
- 입력 시 onChange에서 즉시 1 grapheme으로 자름
- macOS: 시스템 이모지 패널 자동 호출
- Windows: PowerShell + Win32 `keybd_event`로 `Win+.` 시뮬레이션

---

## GAS API 스키마
배포 URL은 `electron/main.js`의 `GAS_BASE` 상수.

### GET
- `?type=members` → `{ members: string[] }`
- `?type=schedule&member=이름` →
  ```json
  {
    "schedule": [{ "rowIndex": 10, "광고주": "..", "비고": "..", "수량": 1, "상태": "대기" }],
    "pending":  [{ "rowIndex": 11, "광고주": "..", "비고": "..", "수량": 1 }],
    "summary":  { "total": 7, "pending": 2 }
  }
  ```
  (summary는 GAS 응답에 있지만 클라이언트는 schedule/pending 배열에서 직접 수량 합산함)

### POST (Content-Type: text/plain, body는 JSON)
- `{ action: "setStatus", rowIndex, value: "미정"|"대기"|"진행"|"완료", expect?: {광고주, 비고} }`
- `{ action: "setShare",  rowIndex, value: true|false, expect?: {광고주, 비고} }`
- 응답: `{ ok: true, action, rowIndex, value }` 또는 `{ error: "...", code: "STALE"|"BUSY"|"INVALID" }`
- `setShare(true)` 시 `moveRowOnCheck` 가짜 이벤트 호출로 자동 이관 트리거

### 시트
- 시트명: `💛신규·유지보수`
- 데이터 시작: 10행
- 컬럼: E(광고주) F(작업자) I(수량) J(비고) K(상태) L(공유)

---

## 주요 디자인 결정 + 이유

| 결정 | 이유 |
|---|---|
| GAS 호출을 main 프로세스에서 | 렌더러는 CSP/CORS로 막힘 |
| **단일 둥근 카드** (폴더 탭/inverse curve 폐기) | v8까지 박았던 폴더 탭 컨셉을 v10에서 단순화. 그라데이션 헤더 + layered 본문이 더 안정적 |
| **그라데이션 헤더** (#f39ebb → #ff86a2) | 단조로움 해소, 미적 완성도 ↑. 두 색 hue 평행이동으로 사용자 hue 변경 지원 |
| **hue 슬라이더 + 6 프리셋** (S/V 고정 아닌 두 색 각자 S/L 유지) | 색상 커스텀 단순화. 옐로/시안 영역도 perceptual L 보정으로 가독성 확보 |
| **다크 모드 폐기** | 라이트 풀컬러 단일 컨셉 확정 |
| **M 사이즈 폐기** | 사용 패턴이 양극단(카운트만/전체)이라 중간 사이즈 의미 약함. 코드 100줄 단순화 |
| **드래그 리사이즈 폐기** | 폰만큼 매끄럽지 못한 UX. 헤더 사이즈 토글 버튼으로 단일화 |
| **카드형 행** (단순 테이블 행에서 변경) | 위계 강화, 시각 정돈 |
| **메트릭 카드** (단순 카운트 텍스트에서 변경) | 첫 인상 데이터 명확. 옅은 액센트 배경으로 강조 |
| **공유대기 풀스크린 PendingPanel** (팝오버에서 변경) | 풋터의 `›` 화살표 의미와 시각 일치. 슬라이드 인 |
| **완료 버튼** (체크박스에서 변경) | 빈 체크박스는 동작 시그널 약함. 명확한 액션 텍스트 버튼 |
| **새로고침 FAB** (헤더에서 본문 우하단으로 이동) | 헤더에 원형 4개 누적되는 시각 노이즈 해소 |
| **헤더 우측 minimal icon-only** | 아바타/뱃지 흰 알약과 별도 톤. 헤더 그라데이션 자체가 시각 중심 |
| **수량 1 숨김 + 2 이상 `n건`** | 대부분 1건이라 노이즈 |
| **NEW dot은 hasAnyNew일 때만 컬럼 부여** | dot 자리 빈 공간으로 좌우 여백 비대칭 방지 |
| **카운트 = 수량 합** (행 수 X) | 사용자 인식과 일치 ('건' = 수량 단위) |
| **첫 실행 캐싱 + 스켈레톤** | 깜빡임 zero. cached schedule 즉시 표시 → 백그라운드 fetch |
| **외곽 그림자 폐기 → 1px border** | 그림자가 사각 잘림 문제 + 흰 배경 대비 약함 |
| **iOS 토글 톤** | 검은 knob이 OFF인데 ON처럼 보이던 시각 오해 해소 |
| **이모지 1자 제한** | 멀티 이모지 입력 방지 |
| **이모지 자동 폴백 풀 10개** | 🐶🐱🐰🐻🐼🌸👑💸🍩🎀 (사용자 지정) |
| **Toast 카드형 + wrap** | 알약 + nowrap이라 긴 메시지 잘림 → 두 줄까지 wrap |
| **아바타 widget 직속 absolute** | 헤더 자식이면 본문 카드 z-index에 밀려 이모지 피커 가려짐 → 분리로 해결 |

---

## 알려진 한계 / 미해결
- **packaging 안 됨**: electron-builder 미설정. dev 모드로만 실행 중.
  - 자동 실행 토글은 dev에선 electron.exe 경로로 등록 (실 .exe로 빌드되어야 의미)
  - Windows 알림 토스트 표시 이름이 식별자(`com.peekaboo325...`)로 나옴
- **GAS 응답에 user_content_key 캐싱**: 5분 폴링 정상. 추가 토큰 인증 없음
- **시트 스키마 변경 시 GAS 코드 수정 필요** (헤더 위치 의존)

---

## 다음 단계 후보

### 1. packaging (electron-builder) — 현 시점 1순위
- Windows .exe 인스톨러
- 트레이/알림 표시 이름 정상화
- 자동 실행 진짜 동작
- 디자인팀 5명에게 배포 가능해짐

### 2. 추가 폴리시 (필요 시)
- 디자인 v10 컨셉(그라데이션 헤더 + 카드형) 확정 후 미세 톤 조정
- 다른 디자인 디렉션 시도하고 싶으면 의견 받음

### 3. 추가 기능 후보
- 알림 끄기 토글
- 일별/주별 통계 (선택)
- 멀티 멤버 빠른 전환

---

## QC 히스토리 (요약)
- **v1~7**: 기본 셸 + 데이터 fetch + 라벨/위계/스크롤/이름축약 등
- **v8** (`7988df7`): **폴더 탭 inverse curve** — 두 카드 분리 + clip-path 시도
- **이모지 피커 잘림/Windows 이모지 패널** (`91be62a`)
- **이모지 5×2 + 박스 밖 삐져나감 픽스** (`711b453`)
- **v9** (`c94deac`): 풀컬러 컨셉 시도 → 같은 날 revert (`8731085`)
- **v10** (`f9595cd`): **그라데이션 헤더 + 카드형 행 + 메트릭 카드**. 폴더 탭 폐기. 현재 디자인의 베이스
- **v10.1** (`ccb573b`): 본문 카드를 헤더 위로 layered (margin-top -14)
- **hue별 가독성 보정** (`f1137dd`): 옐로/시안 perceptual L 자동 보정
- **M 사이즈 폐기** (`e7da676`): S/L 두 단계
- **사이즈 토글 버튼** (`eea958f`): 헤더 우상단 한 클릭 S ↔ L
- **새로고침 FAB** (`0b770de`): 헤더 → 본문 우하단 floating
- **드래그 리사이즈 폐기** (`fb9e645`): resizable: false
- **위젯 외곽 그림자** (`18652d0`) → 후에 **shadow 폐기 → border** (`c97b909`)
- **본문 잘림 픽스** (`190e985`): height 100vh → 100%
- **첫 실행 캐싱** (`8f1de8b`): cached schedule + members
- **스켈레톤 UI** (`d9f9088`): 첫 실행 깜빡임 zero
- **S 모드 grid align 14px 통일** (`a47cc6b`)
- **헤더 상단 여백 축소** (`3eb73fd`): S 76→68, L 92→84
- **크기/모드 옵션 폐기** (`bf7dcb2`): 설정 패널에서 제거, 라이트 단일
- **행 위계 정리 + 강화된 펄스** (`be30078`): 비고 > 수량, scale + ring expand
- **공유대기 풀스크린 PendingPanel** (`887dea0`): 슬라이드 인
- **수량 합산 카운트 + Toast wrap** (`4526fd0`)
- **PendingPanel 완료 버튼 + 아바타 분리 + NEW dot 동적** (`c97b909`)
- **완료 버튼 톤다운 + 토글 iOS + 달력 아이콘 제거** (`a946fc4`)
- **헤더 우측 minimal icon-only** (`b447cad`): B안

---

## 즉시 컨텍스트 (새 대화방 시작 시)
> 디자인팀 위젯 프로젝트. Electron + React. 6명 디자인팀이 시트 일일이 안 열고 본인 스케줄·공유대기·새 항목 알림을 받기 위한 도구.
>
> 현재 디자인 = **v10 그라데이션 헤더 + 카드형 본문** (라이트 단일 모드, S/L 두 사이즈, hue 슬라이더로 색 커스텀). 헤더는 minimal icon-only, 본문은 행 카드 + 메트릭 카드 + 공유대기 PendingPanel(슬라이드 인). 캐싱·스켈레톤·수량 합산·iOS 토글까지 다 박힘.
>
> 다음 작업 후보 1순위는 **packaging (electron-builder)** — 디자인팀 5명 배포 가능해지면 실 사용 데이터부터 모이기 시작.
>
> 사용자는 비개발자·디자인팀 리더. 결정 빠른 스타일. "예뻐야 정이 간다"가 디렉션 기준.
