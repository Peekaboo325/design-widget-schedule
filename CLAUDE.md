# CLAUDE.md — design-widget-schedule

## 프로젝트 개요
IMC 3본부 디자인팀 팀원용 바탕화면 위젯 (Electron + React + Vite)
- 본인 배정 스케줄 확인 + 공유대기 리마인드
- 기획 해석 및 실행 점검 체크리스트

## 작업 원칙

### 코드 작성 전
- **반드시 무엇을 할 건지 먼저 설명하고 확인받을 것.** 무언의 코드 출력 금지.
- 새 파일 생성 / 구조 변경 / 라이브러리 추가 시 사전 고지 필수.
- 불확실한 부분은 추정으로 진행하지 말고 질문할 것.

### 코드 작성 중
- 부분 수정보다 **전체 파일 완성본**으로 제공.
- 파일명은 시맨틱 네이밍 준수 (기능이 드러나는 이름).
- 주석은 한국어로, 핵심 로직에만 간결하게.
- 콘솔/터미널 출력 결과도 함께 공유할 것.

### 코드 작성 후
- 변경 사항 요약을 먼저, 코드는 그 다음.
- 에러 발생 시 원인 분석 → 수정안 제시 → 확인 후 적용.

### Git 자동화
- **모든 작업 단위마다 자동으로 `git add` → `git commit` → `git push` 수행.**
- 별도 지시 없이도 변경된 파일은 즉시 커밋·푸시할 것 (확인 대기 X).
- 커밋 메시지는 **한국어**, 무엇을·왜 바꿨는지가 드러나게 작성.
  - 예: `2단계: 투명도 슬라이더와 항상 위 고정 토글 추가`
  - 예: `버그 수정: preload 경로 불일치로 인한 IPC 누락 해결`
- 푸시 대상은 현재 작업 브랜치 (기본: `claude/start-stage-one-RHl4J`).
- 푸시 실패 시 원인 보고 후 재시도 (강제 푸시 / 브랜치 변경은 금지).

## 커뮤니케이션
- 한국어로 대화.
- 결론 먼저, 근거는 그 다음.
- 핵심만 간결하게. 단, 구조적 결정은 충분히 설명.
- "이렇게 해도 될까요?" 보다 "이렇게 하겠습니다, 진행할게요." 톤.
- 무조건 동조하지 말 것. 더 나은 방법이 있으면 제안할 것.

## 기술 스택
- **Electron + React + Vite** (electron-vite 권장)
- **핫 리로드:** 개발 모드에서 코드 저장 → 자동 반영 필수
- **빌드:** electron-builder (.exe)
- **스타일:** CSS Modules (협의 완료)
- **상태 관리:** React 기본 (useState/useContext). 별도 라이브러리 도입 시 사전 협의.
- **설정 영속화:** electron-store (main 프로세스 영구 저장)

## 로컬 개발 주의
- **`git pull` 직후엔 `npm install` 한 번 실행할 것.**
  - dependencies가 늘어났을 가능성 있음 (electron-vite는 main 의존성을 번들하지 않고 런타임 `node_modules`에서 찾음).
  - 빠뜨리면 dev 실행 시 `ERR_MODULE_NOT_FOUND` 발생.
- dependencies가 추가/변경되는 작업 단위에서는 응답에 **"`npm install` 필요"** 라고 명시할 것.

## 데이터 소스
- GAS Web App: `schedule-widget-api.gs`
- `?type=members` → 팀원 목록
- `?type=schedule&member=이름` → 스케줄 + 공유대기 + 요약
- API 응답 구조는 SPEC.md 참조

## 디렉토리 구조 (가이드)
```
design-widget-schedule/
├── CLAUDE.md
├── SPEC.md
├── CHECKLIST.md
├── electron/          # Electron 메인 프로세스
├── src/               # React 렌더러
│   ├── components/    # UI 컴포넌트
│   ├── hooks/         # 커스텀 훅 (API 호출 등)
│   ├── styles/        # 스타일
│   └── App.jsx
├── package.json
└── electron-builder.yml
```
구조 변경 시 반드시 사전 협의.
