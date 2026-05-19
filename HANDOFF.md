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
- 푸시 대상: 작업 브랜치 `claude/start-stage-one-RHl4J` (main과 동일하게 머지된 상태).

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
│   ├── main.js                  # main 프로세스 (창/트레이/IPC/GAS프록시)
│   └── preload.js               # contextBridge API 노출
├── resources/
│   └── design-widget-schedule.ico
├── src/
│   ├── index.html               # CSP, 진입점
│   ├── main.jsx                 # React 진입
│   ├── App.jsx                  # 위젯 셸, 핸들러 모음
│   ├── App.module.css
│   ├── assets/fonts/
│   │   └── SUIT-Variable.woff2  # 번들 폰트
│   ├── components/
│   │   ├── ScheduleView.jsx     # 사이즈별 본문 (S/M/L 분기)
│   │   ├── ChecklistView.jsx    # 셀프 체크 탭
│   │   ├── SettingsPanel.jsx    # ⚙ 설정창
│   │   ├── MemberPicker.jsx     # 최초 멤버 선택
│   │   ├── Dropdown.jsx         # 커스텀 드롭다운
│   │   ├── Toast.jsx            # 5초 토스트 + Undo
│   │   └── PendingPopover.jsx   # 공유 대기 펼침
│   ├── hooks/
│   │   ├── useSettings.js       # store + 테마 적용
│   │   ├── useMembers.js        # 팀원 목록 fetch
│   │   ├── useSchedule.js       # 5분 폴링 + 백오프 재시도 + mutate
│   │   └── useSeenSchedule.js   # 새 스케줄 NEW 추적 (세션)
│   ├── lib/
│   │   ├── api.js               # GAS GET/POST 래퍼
│   │   └── format.js            # shortName, nextStatus
│   ├── data/
│   │   └── checklist.js         # 셀프 체크리스트 데이터
│   └── styles/
│       └── global.css           # CSS 변수, 스크롤바, 폰트
```

---

## 현재 동작 (구현 완료)

### 위젯 셸
- frameless + transparent + alwaysOnTop
- 헤더 드래그로 창 이동
- `skipTaskbar: true` — 작업표시줄·Alt+Tab에서 숨김
- 사이즈: S 220×180 / M 300×380 / L 360×560 (resizable 트릭으로 매번 강제 적용)
- 트레이 아이콘 (좌클릭 토글, 우클릭 메뉴: 새로고침 / 위치 초기화 / ─ / 종료)
- close 시도 시 hide만 (트레이 '종료'에서만 실제 quit)
- 화면 밖 보호: `isWindowOnAnyDisplay` + `showWindowSafely` + `resetWindowPosition`

### 설정 패널 (⚙)
- 외부 클릭/ESC로 닫힘
- 펼치면 본문/탭/footer 숨김 (잘림·겹침 방지 + 자체 스크롤)
- 항목: 사용자 / 항상 위 고정 / 시작 시 자동 실행 / 크기 S·M·L / 투명도 40~100% / 모드 다크·라이트 / 테마 컬러
- 모든 설정 electron-store 영구 저장
- S 사이즈도 모든 옵션 노출 (스크롤로 접근)

### 사용자 선택
- 최초 실행 시 본문 전체 덮는 선택 화면 (단축 이름, 풀네임 title)
- 선택값 영구 저장. 다음 실행 시 자동 복원
- 저장값이 현재 멤버 목록에 없으면 stale 처리 후 재선택
- 설정 패널 드롭다운에서 변경 가능

### 스케줄 데이터
- GAS Apps Script Web App에서 fetch (main 프로세스가 호출 → CSP/CORS 우회)
- 5분 자동 새로고침 + 수동 ↻
- **백오프 재시도**: 실패 시 2초 → 4초 → 8초 (총 4번). 모두 실패해야 에러 표시
- 응답: `{ schedule[], pending[], summary{total, pending} }`, 각 항목에 `rowIndex` 포함

### 사이즈별 본문
- **S**: 잔여 스케줄 카운트 큰 숫자 + 공유 대기 알약 뱃지
- **M**: 광고주별 합계 리스트 (원본 순서) + 공유 대기 뱃지
- **L**: 잔여 스케줄 전체 테이블 + 공유 대기 한 줄 요약 (숫자만)
  - 공유 대기 클릭 시 팝오버 펼침 → 각 행 체크박스 → L열 TRUE 처리

### 잔여 스케줄 테이블 (L)
- 컬럼: [선택적 dot] / 광고주(700) / 비고(500) / 수량(작게) / 상태 chip
- 상태 chip 클릭 시 **다음 상태로 순환** (미정→대기→진행→완료)
- 낙관적 업데이트: 클릭 즉시 화면 반영. 완료 시 잔여에서 제거 + 공유 대기 카운트 +1
- 토스트로 "OO → 진행" + 5초 Undo 버튼
- NEW 항목 좌측에 펄스 dot (NEW 없으면 컬럼 자체 숨김)

### 새 스케줄 알림 (세션 기반)
- 키: `광고주|비고`
- 멤버별 메모리 기준선
- 첫 fetch 결과는 자동 "본 것"으로 등록 → NEW 도배 방지
- 이후 fetch에서 기준선에 없는 키 = NEW (행 dot + 헤더 +N 알약 뱃지)
- **사라진 키는 자동 정리** → 옮겼다가 다시 들어온 작업도 NEW로 잡힘
- +N 클릭 → 현재 키 전체로 기준선 갱신 (NEW 사라짐)
- Undo 시 `markSeen()`으로 해당 키 미리 등록 → NEW로 안 잡힘
- 새 NEW 발생 시 OS 토스트 알림 (Notification API, 클릭 시 위젯 표시)

### 셀프 체크 탭
- L 사이즈에서만 노출 (S/M으로 가면 강제 스케줄 탭 복귀)
- 6개 섹션 19개 항목, 체크박스
- **저장 없음** (SPEC 명시). 위젯 재시작 시 초기화
- 진행률 표시, RESET 버튼

### 시트 쓰기 (POST)
- GAS doPost로 `setStatus` / `setShare` 액션
- **LockService** — 동시 실행 직렬화 (10초 대기)
- **Optimistic Locking** — `expect: {광고주, 비고}`가 시트 현재 값과 다르면 거부 (STALE)
- 실패 시 자동 refresh + 에러 토스트

### 디자인 시스템
- **SUIT Variable** 폰트 번들 (`src/assets/fonts/`)
- CSS 변수로 다크/라이트 모드 전환:
  - `--widget-bg`, `--widget-header-bg`, `--widget-fg`, `--widget-muted`
  - `--widget-accent`, `--widget-on-accent` (WCAG 휘도 기반 자동 흑/백)
  - `--widget-overlay`, `--widget-overlay-strong`, `--widget-row-border`
- 다크: 액센트 20% 베이스 + 28% 헤더
- 라이트: 거의 순백 + 액센트 8% 베이스 + 18% 헤더
- 스크롤바 4px + 액센트 컬러 alpha
- 위젯 외곽 라운드 14px (디자인 폴리시에서 22px로 키울 예정)

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

### POST (Content-Type: text/plain, body는 JSON)
- `{ action: "setStatus", rowIndex, value: "미정"|"대기"|"진행"|"완료", expect?: {광고주, 비고} }`
- `{ action: "setShare",  rowIndex, value: true|false, expect?: {광고주, 비고} }`
- 응답: `{ ok: true, action, rowIndex, value }` 또는 `{ error: "...", code: "STALE"|"BUSY"|"INVALID" }`

### 시트
- 시트명: `💛신규·유지보수`
- 데이터 시작: 10행
- 컬럼: E(광고주) F(작업자) I(수량) J(비고) K(상태) L(공유)

---

## 주요 디자인 결정 + 이유

| 결정 | 이유 |
|---|---|
| GAS 호출을 main 프로세스에서 | 렌더러는 CSP/CORS로 막힘 |
| 사이즈별 정보 단계 (S 숫자만 / M 그룹 / L 테이블) | 사용 패턴별 선택권 |
| 다크/라이트 + 6 프리셋 컬러 + 컬러피커 | 개인화. "예뻐야 정이 가" |
| 새 알림 세션 기반 | 실시간 변동 추적. 옮겼다 들어온 것도 잡힘 |
| 셀프 체크 저장 없음 | SPEC 명시. 매 작업마다 새 점검 |
| chip 클릭 순환 | 추가 버튼 없이 즉시 액션 |
| Undo 5초 토스트 | 실수 회복. 확인 다이얼로그보다 마찰 적음 |
| 공유 대기 L에선 한 줄 요약 | 부차 정보. 지면 양보 |
| 공유 대기 클릭 시 팝오버 | 평소 깔끔, 액션 시 펼침 |
| LockService + Optimistic Locking | 동시성 + 행 어긋남 둘 다 방어 |
| 멤버 이름 단축 (성씨 뗌) | 헤더/UI 좁음. 풀네임 title로 보존 |
| ⚙ 우측 끝 고정 | 토글 시 위치 안 바뀌게 (↻ 먼저, ⚙ 끝) |
| 트레이 좌클릭 토글 + 화면 밖 자동 보정 | 모니터 분리 케이스 복구 |

---

## 알려진 한계 / 미해결
- **packaging 안 됨**: electron-builder 미설정. dev 모드로만 실행 중.
  - 자동 실행 토글은 dev에선 electron.exe 경로로 등록 (실 .exe로 빌드되어야 의미)
  - Windows 알림 토스트 표시 이름이 식별자(`com.peekaboo325...`)로 나옴
- **GAS 응답에 user_content_key 캐싱**: 5분 폴링 정상. 추가 토큰 인증 없음
- **시트 스키마 변경 시 GAS 코드 수정 필요** (헤더 위치 의존)

---

## 다음 단계 후보 (사용자 결정)

### 1. 디자인 폴리시 (사용자 강한 의향)
사용자가 두 레퍼런스 제시:
- **컬러감**: told.club (페이스텔 배경 + 흰 카드, 헤더↔본문 대비)
- **쉐입**: OxeliaMetrix (큰 라운드 24px+, 알약 chip, nested 카드, 헤더 아바타)

**구체 요청**:
- 위젯 외곽 라운드 14 → 22~24px
- 헤더 자체를 컬러 카드 (액센트 거의 100% 채움)
- 본문은 흰/무채색 카드로 분리
- chip/segmented 알약형 (999px)
- ⚙ ↻ 원형 배경 버튼
- **헤더 좌측 원형 아바타에 이모지** (멤버별 저장, 클릭 시 이모지 피커)

**작업량**: 30~40분, CSS 중심.
**리스크**: 다크 모드 새로 잡아야. S 사이즈에서 큰 라운드 어색 가능. 박은 후 보고 조정 사이클 필요.

### 2. packaging (electron-builder)
- Windows .exe 인스톨러
- 트레이/알림 표시 이름 정상화
- 자동 실행 진짜 동작
- 디자인팀 5명에게 배포 가능해짐

### 3. 추가 액션
- 시트 스키마에 더 안전한 검증
- 알림 끄기 토글
- 더 다양한 사이즈 (XL?)

---

## QC 히스토리 (요약, 14차 + 알파)
- 1~6차: 라벨/위계/스크롤/드롭다운/사이즈변경 버그/이름축약
- 7차: close 후 재오픈 TypeError 픽스
- 8차: 네트워크 메시지/SUIT 번들/위계 강화/새 스케줄 알림 도입
- 9차: 알림 세션 기반 전환
- 10차: 펄스 잘림 픽스 + 사라진 키 정리 + OS 푸시 알림
- 11차: 카운트 축소/공유대기 동적/자동실행/펄스/알림 이름
- 12차: 행 dot 잘림 + 펄스 추가 (헤더 뱃지가 아닌 행 dot)
- 13차: L 공유 대기 한 줄 단순화
- 14차: NEW 0건일 때 dot 컬럼 숨김
- 15차: 탭 flex 균등 분할
- A/B/C단계: 시트 쓰기 (GAS doPost + chip 순환 + 공유 팝오버)
- 백오프 재시도 + 동시성 안전망 (LockService + Optimistic Locking)
- 화면 밖 보호 픽스
- 긴급 TDZ 픽스 (handleStatusClick이 markSeen을 위에서 참조)

---

## 즉시 컨텍스트 (새 대화방 시작 시)
> 디자인팀 위젯 프로젝트. Electron + React. 6명 디자인팀이 시트 일일이 안 열고 본인 스케줄·공유대기·새 항목 알림을 받기 위한 도구.
>
> 현재 모든 핵심 기능 동작 중. dev 모드로 사용 중이고 아직 packaging 안 함.
>
> 다음 작업 후보 1순위는 **디자인 폴리시** (라운드 키움 + 헤더 컬러 카드화 + 이모지 아바타). 사용자가 두 레퍼런스(told.club + OxeliaMetrix) 제시함. 박은 후 보면서 조정 사이클 필요.
>
> 사용자는 비개발자·디자인팀 리더. 결정 빠른 스타일. "예뻐야 정이 간다"가 디렉션 기준.
