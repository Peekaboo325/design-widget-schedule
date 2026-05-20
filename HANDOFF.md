# HANDOFF.md — design-widget-schedule

> 새 대화방에서 이 파일을 통째로 컨텍스트로 주면 AI가 현재 상태를 빠르게 흡수합니다.

---

## 사용자 컨텍스트
- **사용자**: 비개발자, 디자인팀 팀 리더 (IMC 3본부 광고 디자인팀)
- **목적**: 디자인팀 6명을 위한 바탕화면 위젯. 본인 스케줄·공유대기·새 일정 알림을 시트 안 열고 한 화면에.
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

---

## 프로젝트 개요
- **레포**: `Peekaboo325/design-widget-schedule`
- **스택**: Electron 33 + React 18 + Vite (electron-vite) + electron-builder
- **빌드/실행**:
  - dev: `npm run dev` (정상 동작 확인)
  - macOS 패키지: `npm run build:mac` (빌드 되지만 실행 hang — 후술)
  - Windows 패키지: `npm run build:win` (미시도, GitHub Actions로 갈 예정)

---

## 디렉토리 구조
```
design-widget-schedule/
├── CLAUDE.md / SPEC.md / CHECKLIST.md / HANDOFF.md
├── schedule-widget-api.gs       # GAS Apps Script
├── electron-builder.yml         # 패키징 설정
├── electron/
│   ├── main.js                  # main 프로세스 (창/트레이/IPC/GAS프록시/캐시/seen)
│   └── preload.js               # contextBridge API
├── resources/
│   ├── design-widget-schedule.ico  (Win)
│   └── design-widget-schedule.png  (Mac/Linux)
├── src/
│   ├── App.jsx / App.module.css
│   ├── components/
│   │   ├── ScheduleView.jsx     # L: 메트릭+그룹별 행 카드+풋터 / S: 큰 숫자+뱃지
│   │   ├── ChecklistView.jsx
│   │   ├── SettingsPanel.jsx    # 사용자/항상위/자동실행/알림/투명도/테마컬러
│   │   ├── MemberPicker.jsx
│   │   ├── Dropdown.jsx
│   │   ├── Avatar.jsx
│   │   ├── EmojiPicker.jsx      # 프리셋 10 + 직접 입력(1자)
│   │   ├── Toast.jsx            # 카드형 (line-clamp 2, code 표시)
│   │   └── PendingPanel.jsx     # 공유 대기 풀스크린 슬라이드
│   ├── hooks/
│   │   ├── useSettings.js
│   │   ├── useMembers.js        # 캐시
│   │   ├── useSchedule.js       # 캐시 + 5분 폴링 + 백오프
│   │   └── useSeenSchedule.js   # persistent NEW 추적
│   ├── lib/
│   │   ├── api.js               # GAS 래퍼 (error.code 부여)
│   │   ├── color.js             # hue 평행이동 + perceptual L 보정
│   │   ├── errors.js            # E01~E99 코드 카탈로그
│   │   ├── format.js
│   │   └── emoji.js
│   └── styles/
│       └── global.css           # CSS 변수, skeleton, Windows 폰트 보정
```

---

## 현재 동작 (v10+)

### 위젯 셸
- frameless + transparent + alwaysOnTop
- 단순 둥근 카드 (R=30 L, R=20 S) + `overflow: hidden`
- 본문 카드에만 1px 옅은 border (헤더는 그라데이션 자체로 외곽)
- 본문이 헤더 위로 `margin-top: -14` 떠 있는 layered
- 사이즈: S 240×220 / L 360×560 (M 폐기)
- `resizable: false`, `hasShadow: false`, `skipTaskbar: true`
- 트레이 전용. close → hide만, 트레이 '종료'에서만 quit
- 단일 인스턴스 락
- 트레이 메뉴: 새로고침 / 위치 초기화 / ─ / 종료

### 헤더
- **그라데이션**: `linear-gradient(135deg, --widget-header-from → --widget-header-to)` (디폴트 핑크 `#f39ebb → #ff86a2`)
- hue 슬라이더로 두 색 H만 평행이동 (S/L 보존)
- 헤더 위 텍스트 색 = `--widget-on-header` (to의 WCAG luminance로 자동 흑/백)
- 옐로/시안 영역 perceptual L 보정 → hue별 가독성 일정
- **아바타** (widget 직속 absolute, z-index 10) — 흰 알약 + 이모지. 클릭으로 이모지 피커
- **헤더 텍스트 stack**: 날짜(18/800) + 메타(11/500, 65% opacity)
- **우측 아이콘** (minimal icon-only): 사이즈 토글(Square/Restore) + 설정. transparent + hover 시 옅은 배경
- **+N 뱃지**: 흰 알약 + 진한 액센트 텍스트 + 강한 펄스 (scale + ring expand)

### 본문 (L 모드)
- **메트릭 카드** — 옅은 액센트 배경 + "잔여 스케줄" + 큰 카운트(30/900 accent-strong)
  - 카운트 = 수량 합산 (행 수 X)
- **마감일 그룹화** — 시트 색상으로 due 파싱 후 그룹별 묶음
  - 핑크(`#ffdcef`) 우선, 없으면 빨강(`#ff0000`)의 가장 우측 셀의 9행 날짜
  - 그룹 헤더: "5월 18일(월)까지 마감" (accent-strong 11/800)
  - 마감일 미정은 muted 톤, 맨 아래
- **행 카드** — 흰 카드 + 옅은 border
  - 컬럼: 광고주(14/800) / 비고(13/600 fg) / 수량(11/500 muted, fixed 32) / chip
  - 수량 1이면 빈 텍스트, 2 이상만 'n건'
  - **비고 메모 클릭으로 메일 제목 클립보드 복사** (시트 셀에 메모 있을 때만 underline + cursor pointer)
  - **NEW dot은 grid가 아니라 absolute** — NEW 발생/소멸 시 다른 행 정렬 영향 없음
  - NEW 항목 펄스 (ring expand 1.6s ease-out)
- **공유 대기 풋터** — 메일 아이콘 + 카운트 알약 + `›` 화살표
  - 클릭 → PendingPanel 우측 슬라이드 인

### PendingPanel
- 본문 풀스크린 + 우측 슬라이드 인 (0.24s)
- `< 뒤로` + "공유 대기 N건"(수량 합)
- 행: 광고주 / 비고 / 수량 / **완료 버튼** (옅은 액센트 + 진한 텍스트, chip과 동일 톤)
- 비고 메모 클릭으로 메일 제목 복사 동일 적용
- ESC로 뒤로, 0건 되면 자동 닫힘

### 새로고침 FAB
- 본문 우하단 floating. 흰 알약 + 액센트 아이콘
- L: 풋터 위 8px (bottom 68)
- S: 우하단 코너 (bottom 14, 32×32, 공유대기 뱃지와 baseline 일치)
- 스케줄/디자인 체크 두 탭 모두에서 노출

### 디자인 체크 탭
- L에서만 활성. 6 섹션 19 항목. 저장 없음 (SPEC). RESET 버튼

### 설정 패널
- 외부 클릭/ESC 닫힘. 헤더(메타 포함) 그대로 유지
- 항목: 사용자 / 항상 위 / 시작 시 자동 실행 / **새 스케줄 알림 토글** / 투명도 / 테마 컬러
- 토글: iOS 표준 (흰 knob + 옅은 회색/액센트 트랙)
- 테마 컬러: hue 슬라이더(무지개) + 6 hue 프리셋
- 크기·모드 옵션 폐기 (사이즈 토글은 헤더, 라이트 단일)

### 사이즈 토글 (헤더)
- L→S, S→L 한 클릭. Square / Restore 아이콘 (Windows 표준 톤)
- 드래그 리사이즈 폐기 (`resizable: false`)

### 알림
- 새 NEW 발생 시 OS 토스트 (Notification API)
- **설정창 토글로 on/off** (회의 중 거슬릴 때 OFF). OFF 시 OS 알림만 끔, 위젯 내 펄스+뱃지는 유지

### 데이터 캐싱 (첫 실행 깜빡임 zero)
- `electron-store`에 `cachedMembers`, `cachedScheduleByMember`
- IPC: `cache:get-members/set-members/get-schedule/set-schedule`
- useMembers/useSchedule: 캐시 즉시 로드 → 백그라운드 fetch → fresh로 덮어쓰고 캐시 갱신
- 첫 실행에 캐시 없으면 스켈레톤 UI (실제 레이아웃과 동일 사이즈)

### Persistent NEW (위젯 종료 사이 추가된 일정 감지)
- `seenKeysByMember` store에 영구 저장
- IPC: `cache:get-seen / set-seen`
- 컴퓨터 끄고 켜는 동안 시트에 추가된 작업도 NEW로 잡힘 → 출근 시 알림 보기 좋음

### 에러 코드 카탈로그 (`src/lib/errors.js`)
| 코드 | 친화 메시지 | 원인 |
|---|---|---|
| E01 | 인터넷 연결을 확인해주세요. | NETWORK |
| E02 | 서버가 잠시 바빠요. 다시 시도해주세요. | GAS BUSY |
| E03 | 시트가 바뀌었어요. 새로고침 후 다시 시도해주세요. | GAS STALE |
| E04 | 잘못된 요청이에요. | GAS INVALID |
| E05 | 복사에 실패했어요. | clipboard |
| E99 | 알 수 없는 오류가 발생했어요. | catch-all |

- Toast 우측에 작은 알약으로 코드 표시
- 팀원이 "E03 떴어요"만 알려줘도 사용자가 진단 가능
- `console.error`에 원본 에러 동시 로깅 (dev 환경 디버그)

### 컬러 시스템 (`src/lib/color.js`)
- `--widget-header-from / -to` — 그라데이션 두 색 (hue 평행이동 + perceptual L 보정)
- `--widget-on-header` — to의 luminance로 자동 흑/백
- `--widget-accent` — 헤더 grad와 어울리는 옅은 톤
- `--widget-accent-strong` — 흰 위 강조용 진한 톤 (hue별 가독성 보정)
- `--widget-accent-soft` — 옅은 hue 배경 (메트릭/chip)
- `--widget-surface / on-surface` — 흰 알약
- `--widget-fg / muted / overlay / border` — 본문 텍스트·라인

### Toast
- 카드 (12px 라운드, line-clamp 2, word-break keep-all)
- 좌우 14px 풀폭. 두 줄까지 wrap
- 에러: 코드(E01~E99) 우측 알약 표시
- info: 5초 자동 dismiss + Undo 액션

### Windows 폰트 보정 (NEW)
- macOS는 Retina + sub-pixel rendering으로 폰트가 더 부드럽고 두꺼워 보임
- Windows ClearType은 sharp픽셀이지만 시각 무게가 야윔
- 보정 두 가지:
  1. `app.commandLine.appendSwitch('font-render-hinting', 'none')` — Windows에서 hinting 약화하여 맥 톤 가깝게
  2. `[data-platform='win32']`로 강조 텍스트 weight 살짝 올림 (.date 800→850, .headerMeta 500→600)
- `preload.js`에 `platform: process.platform` 노출 → App.jsx의 `.widget`에 `data-platform` 부여

---

## GAS API (`schedule-widget-api.gs`)

### GET
- `?type=members` → `{ members: string[] }`
- `?type=schedule&member=이름` →
  ```json
  {
    "schedule": [{ "rowIndex", "광고주", "비고", "수량", "상태", "due": "2026-05-21" | null, "noteText": "...메일제목..." | null }],
    "pending":  [{ "rowIndex", "광고주", "비고", "수량", "noteText": "..." | null }],
    "summary":  { "total": 7, "pending": 2 }
  }
  ```

### POST (Content-Type: text/plain, body는 JSON)
- `{ action: "setStatus", rowIndex, value, expect: {광고주, 비고} }`
- `{ action: "setShare",  rowIndex, value, expect }`
- 응답: `{ ok: true, action, rowIndex, value }` 또는 `{ error, code: STALE|BUSY|INVALID }`
- LockService(10초 대기) + Optimistic Locking

### 시트 스키마
- 시트명: `💛신규·유지보수`
- 데이터 시작: 10행
- 컬럼: E(광고주) F(작업자) I(수량) **J(비고+메모=메일제목)** K(상태) L(공유)
- 9행 M~ 끝열: 날짜 헤더 (Date 객체)
- 데이터 행 M~ 끝열 배경색: 핑크(`#ffdcef`)/빨강(`#ff0000`)으로 마감일 표시

### 현재 deploy URL
- main.js의 `GAS_BASE` 상수에 직접 박힘
- 사용자가 Apps Script 콘솔에서 직접 갱신·재배포 → 새 URL이면 알려줌

---

## 패키징 진행 상황

### electron-builder.yml
- appId: `com.peekaboo325.design-widget-schedule`
- productName: `디자인팀 스케줄 위젯`
- Mac: dmg (x64 + arm64), `identity: '-'` (ad-hoc 서명)
- Windows: NSIS 인스톨러 (사용자 단위 설치, 바탕화면+시작메뉴 바로가기)
- 자동 업데이트 `publish: null`

### 진행 상태
| 환경 | 상태 |
|---|---|
| **dev 모드 (npm run dev)** | ✅ 정상 동작 (Mac/Windows 둘 다) |
| **macOS .dmg 빌드** | ⚠ 빌드 성공, 실행 시 hang (후술) |
| **Windows .exe 빌드** | 미시도 (GitHub Actions로 갈 예정) |

### macOS 패키지 hang 이슈
- 증상: `app.whenReady()` 콜백이 호출되지 않고 무한 대기. dock에서 아이콘 튀기만 함
- 원인 추정: **macOS Sequoia 15.x + Electron 33 + unsigned 조합**의 알려진 이슈
  - Sequoia의 보안 데몬(taskgated)이 unsigned 헬퍼 프로세스 검문하느라 메인 스레드 데드락
  - GPU 헬퍼/Network 프로세스 초기화 IPC가 OS 보안 레이어와 충돌
- 시도한 우회법:
  - `use-mock-keychain` + `disable-gpu-sandbox` + `disableHardwareAcceleration` (Mac만 적용)
  - electron-builder `identity: '-'` (ad-hoc 서명)
  - quarantine 제거 (`xattr`)
  - 재부팅 / Activity Monitor 좀비 프로세스 정리
  - 단계별 stamp 로그(`~/widget-debug.log`)로 정확한 freeze 지점 파악
- 모두 효과 없음. **본인 맥 한정 문제이고 디자인팀(전부 Windows) 배포에 영향 없음**
- 다음 시도 옵션:
  - Electron 33 → 30 LTS 다운그레이드 (5분, 도박 50%)
  - 또는 Apple Developer 계정($99/년)으로 정식 code signing
- **현재는 본인 맥은 `npm run dev`로 사용. macOS packaging은 추후 재시도**

### 진단용 로그 인프라
- main.js 시작 시점부터 단계별 `stamp(label)` 호출 → `~/widget-debug.log`에 기록
- `uncaughtException` / `unhandledRejection` 핸들러도 동일 파일에 기록
- 패키지 hang/crash 진단 시 매우 유용

---

## 알려진 한계 / 미해결
- **macOS .dmg 실행 hang** (위 참조). 본인 한정.
- **시트 스키마 변경 시 GAS 코드 수정 필요** (운영자 = 사용자 본인이라 통제 가능)
- Windows 알림 표시 이름은 packaging 후 정상화 가능 (`appUserModelId` + productName)

---

## 다음 단계 후보

### 1순위 — Windows .exe GitHub Actions 빌드
- Mac에서 wine 없이 GitHub Actions의 Windows runner로 빌드
- 사용자 회사 PC에서 .exe 테스트 → 베타 1명 (디자인팀 신뢰 멤버) → 전체 배포
- macOS Sequoia 이슈와 무관

### 2순위 — macOS packaging 재시도 (필요 시)
- Electron 30 LTS 또는 code signing

### 3순위 — 실 사용 후 피드백 받아 폴리시
- 디자인팀 5명 실 데이터에서 나오는 엣지 케이스
- 알림 정책 / 추가 기능

---

## QC 히스토리 (핵심 마일스톤)
- **v1~v7**: 기본 셸 + 데이터 fetch + 디자인 초안
- **v8** (`7988df7`): 폴더 탭 inverse curve
- **v9** (`c94deac → 8731085`): 풀컬러 시도 → revert
- **v10** (`f9595cd`): **그라데이션 헤더 + 카드형 행 + 메트릭 카드**. 현재 디자인 베이스
- **v10.1** (`ccb573b`): 본문 layered (margin-top -14)
- **hue 보정** (`f1137dd`): 옐로/시안 perceptual L 자동 보정
- **M 폐기** (`e7da676`): S/L 두 단계
- **사이즈 토글 / FAB / minimal icon** (`eea958f`, `0b770de`, `b447cad`)
- **본문 잘림 픽스** (`190e985`): height 100vh → 100%
- **첫 실행 캐싱 + 스켈레톤** (`8f1de8b`, `d9f9088`)
- **크기·모드 폐기** (`bf7dcb2`): 라이트 단일
- **공유대기 PendingPanel** (`887dea0`): 슬라이드 인
- **수량 합산 + Toast wrap** (`4526fd0`)
- **shadow → border + 아바타 분리 + NEW dot 동적** (`c97b909`)
- **헤더 우측 minimal icon-only** (`b447cad`): B안
- **마감일 그룹화** (`0b1aec2`, `8c2b1b3`): 시트 색상 파싱
- **persistent NEW** (`23ce7d0`): 위젯 종료 사이 추가 일정 감지
- **NEW dot absolute** (`49fd7b2`): grid 영향 제거
- **비고 메모 복사** (`babea34`): 시트 노트 → 클립보드
- **알림 토글** (`f732c88`): 설정창
- **에러 코드 카탈로그** (`3f24833`): E01~E99
- **본문 영역만 border** (`f930d7f`): 헤더 border 제거
- **electron-builder 설정** (`59c2e19`): 패키징 시작
- **macOS hang 진단 + 우회 시도** (`66b5a60` ~ `0b9360d`): 미해결
- **Windows 폰트 보정** (이번): font-render-hinting + weight 보정

---

## 즉시 컨텍스트 (새 대화방 시작 시)

> 디자인팀 위젯. Electron + React. 6명 디자인팀이 시트 안 열고 본인 스케줄·공유대기·새 일정 알림·마감일 그룹·비고 메모 복사까지 한 화면에.
>
> 디자인 = **v10 그라데이션 헤더(핑크) + 카드형 본문** (라이트 단일, hue 슬라이더). 헤더 minimal icon-only, 본문 마감일 그룹별 행 카드 + 공유대기 풀스크린 패널.
>
> 인프라 풀세트: 캐싱·스켈레톤·persistent NEW·에러 코드 E01-E99·알림 토글·Windows 폰트 보정.
>
> **현 단계: 패키징 진행 중.** macOS .dmg는 Sequoia + Electron 33 + unsigned 조합 hang으로 보류 (본인 dev로 사용). 진짜 배포 타깃 = Windows = GitHub Actions로 다음 시도 예정. 디자인팀 5명 전부 Windows라 macOS 이슈 영향 X.
>
> 사용자는 비개발자·디자인팀 리더. 결정 빠르고 디자인 안목 확실. "예뻐야 정이 간다."
