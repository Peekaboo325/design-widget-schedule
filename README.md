# 디자인팀 스케줄 위젯

<!-- 스크린샷 추가 예정 (docs/screenshots/widget-l.png / widget-s.png) -->
<!-- ![L 모드](docs/screenshots/widget-l.png) -->

IMC 3본부 디자인팀 6명을 위한 바탕화면 위젯.
**본인 배정 스케줄·공유대기·백업·새 일정 알림**을 한 화면에서 처리합니다.

## 주요 기능

- 시트의 본인 스케줄 자동 동기화 (5분 폴링)
- 마감일 그룹화 + 새 일정 NEW 펄스 알림
- 공유 대기 / 백업 관리 / 셀프 체크리스트 — 3개 탭 한 화면
- 비고 메모 클릭 → 메일 제목 클립보드 복사
- L (400×620, 가장자리 드래그로 확대) / S (200×80 컴팩트) 두 사이즈
- 테마 컬러 — hue 슬라이더 + 7개 프리셋 (블랙 포함)
- 자동 업데이트 내장 (다운로드 완료 즉시 silent 재시작)

## 기술 스택

Electron 33 · React 18 · Vite (electron-vite) · electron-builder · electron-updater

데이터는 Google Apps Script Web App을 통해 시트와 연결.

## 디자인팀 설치

[Releases 페이지](https://github.com/Peekaboo325/design-widget-schedule/releases)에서
최신 `.exe` 다운로드 후 실행. 한국어 인스톨러, 사용자 단위 설치, 시작 메뉴·바탕화면 바로가기 자동 생성.
설치 후엔 자동 업데이트로 알아서 최신 상태 유지.

---

© 2026 Peekaboo325
