#!/bin/bash
# macOS 더블클릭 실행용 — 위젯을 dev 모드로 띄움
# 사용법:
#   1) Finder에서 이 파일 더블클릭
#   2) 터미널 자동으로 열리며 위젯 켜짐
#   3) 위젯 종료 시 Ctrl+C 또는 터미널 닫기
#
# (homebrew/nvm 환경에 따라 npm 경로 다를 수 있어 PATH 보강)

cd "$(dirname "$0")"

# PATH 보강 — Finder 더블클릭으로 실행 시 PATH가 빈약해서 npm 못 찾는 케이스 회피
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/*/bin:$PATH"

# nvm 사용 중이면 자동 로드
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="$HOME/.nvm"
  . "$HOME/.nvm/nvm.sh"
fi

echo "📅 디자인팀 스케줄 위젯 켜는 중..."
echo ""

npm run dev
