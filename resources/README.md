# resources

위젯에서 사용하는 정적 리소스 (아이콘 등).

## design-widget-schedule.ico
트레이 아이콘 + 위젯 창 아이콘.

### 위치
- **dev 모드:** 이 디렉토리(`resources/design-widget-schedule.ico`)에 두면 main 프로세스가 직접 읽습니다.
- **packaging:** electron-builder에 `extraResources`로 등록되어 `process.resourcesPath`로 접근. (추후 packaging 단계에서 설정)

### 파일 없을 때
앱은 정상 실행되며, 트레이 생성만 스킵하고 콘솔에 경고가 출력됩니다.
