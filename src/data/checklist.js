// 체크리스트 데이터 — CHECKLIST.md 원문을 JS 구조로
// SPEC: 기록 저장 없음. 위젯 재시작 시 초기화.
// CHECKLIST.md 수정 시 이 파일도 함께 갱신 필요.

const CHECKLIST = [
  {
    id: 'pre',
    title: '1. 착수 전 기본 확인',
    items: [
      '스케줄과 기획안 일치 여부 확인하기',
      '누락 파일 여부 확인하기',
      '요청 매체 / 사이즈 / 수량 / 매체 규정 확인하기'
    ]
  },
  {
    id: 'brief',
    title: '2. 기획안 해석',
    items: [
      '이번 작업에서 절대 지켜야 할 요소는 무엇인가?',
      '이번 작업에서 변경해도 되는 요소는 무엇인가?',
      '가장 강조되는 메시지는 무엇인가?'
    ]
  },
  {
    id: 'design',
    title: '3. 작업 설계',
    items: [
      '레퍼런스를 확보하였는가?',
      '메인 비주얼이 무엇인지 정하였는가?',
      '보조 요소는 무엇인지 구분하였는가?'
    ]
  },
  {
    id: 'progress',
    title: '4. 작업 중 점검',
    items: [
      '막힌 지점을 30분 이상 방치하지 않았는가?',
      '메인/서브 요소의 위계가 명확한가?',
      '내가 강조한 요소가 기획안 의도와 일치하는가?',
      '고안한 아이디어를 논리적인 문장으로 설득 가능한가?'
    ]
  },
  {
    id: 'self',
    title: '5. 셀프 컨펌',
    items: [
      '기획 의도와 반대로 해석한 부분은 없는가?',
      '선임 디자이너가 가장 먼저 지적할 것 같은 부분은?'
    ]
  },
  {
    id: 'compare',
    title: '6. 기존 컨펌 시안과 비교',
    items: [
      '퀄리티가 비교 시안과 견줄 수 있는가?',
      '밀도 / 정렬 / 여백 / 위계 등 완성도가 뒤떨어지지 않는가?'
    ]
  }
]

export default CHECKLIST

// 전체 항목 수 (진행률 계산용)
export const TOTAL_ITEMS = CHECKLIST.reduce((sum, s) => sum + s.items.length, 0)

// 키 생성: 섹션id + index
export const itemKey = (sectionId, index) => `${sectionId}:${index}`
