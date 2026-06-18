// ============================================================
// 💚완료 → IMC 3본부 업무 데이터 자동 이식 스크립트
// 작성: 2026.04 | syncCompletedToDataSheet()
// 버전: v2.2.0
// 변경(v2.0.0): 주차 계산 로직 전면 제거 (Looker Studio 연동 종료)
//              - 이식 컬럼 수 19 → 17열로 축소
// 변경(v2.1.0, 2026.05): L열 ID 신설 대응
//              - 완료 시트 컬럼 한 칸씩 시프트 (L=ID, M=공유, N=백업, O=요청일, P=공유일, Q=TAT)
//              - 데이터 시트 R열에 ID 이관 (lifecycle 추적)
//              - 중복 체크 키: ID 우선, 없으면 기존 4-field fallback
//              - 데이터 시트 8000+ 행 일괄 마이그레이션 함수 추가 (배치 처리)
// 변경(v2.2.0, 2026.06): 중복 체크 키 4-field 단독으로 회귀 — ID 우선 폐기
//              - 사고 배경: v2.1.0 도입 후 행 복사로 인한 시트 내 ID 중복이 완료 시트로
//                전파되면 idSet.has(id) 첫 행만 통과 → 묶음 단위로 5월 데이터 로스 발생.
//              - 4-field 시절엔 비고가 다르면 키도 달라 묶음 행 다 정상 이관됐음.
//              - 이관은 단방향이라 stable ID 매칭 필요 없음. 중복만 안 들어가면 충분.
//              - R열 ID는 계속 운반 (lifecycle 추적용 데이터). 중복 체크 키로만 안 씀.
//              - 회복: 본 코드로 syncCompletedToDataSheet 재실행하면 5월 누락분 자동 보강.
// ============================================================

// ▶ 설정값 (환경에 맞게 수정 필수)
const DATA_SHEET_ID   = "1KukGD6VbYDHYx7vfFBs4P7-OVZFAuV97wneIQCzR7Ng";   // 업무 데이터 파일이 다른 구글 시트면 ID 입력. 같은 파일이면 "" 유지.
const DATA_SHEET_NAME = "업무데이터"; // 업무 데이터 시트 탭 이름 (정확히 일치해야 함)
const COMPLETED_SHEET_NAME   = "💚완료";
const COMPLETED_DATA_START_ROW = 10; // 완료 시트 데이터 시작 행

// ▶ 단가 / 수치 테이블
const PRICE_TABLE = {
  "KV(프리미엄)":              { price: 500000,   score: 4    },
  "배너(미니)":                { price: 25000,    score: 0.3  },
  "배너(심플)":                { price: 70000,    score: 0.6  },
  "배너(베이직)":              { price: 110000,   score: 1    },
  "배너(프리미엄)":            { price: 160000,   score: 2    },
  "배너(GIF)":                 { price: 150000,   score: 1    },
  "사이즈베리(미니)":          { price: 2500,     score: 0.1  },
  "사이즈베리(심플)":          { price: 10000,    score: 0.2  },
  "사이즈베리(베이직)":        { price: 10000,    score: 0.2  },
  "사이즈베리(프리미엄)":      { price: 10000,    score: 0.2  },
  "사이즈베리(GIF)":           { price: 20000,    score: 0.3  },
  "카드뉴스":                  { price: 100000,   score: 0.5  },
  "브랜드검색_서브(img)":      { price: 25000,    score: 0.2  },
  "브랜드검색_서브(txt)":      { price: 10000,    score: 0.2  },
  "브랜드페이지(심플)":        { price: 220000,   score: 2    },
  "브랜드페이지(베이직)":      { price: 300000,   score: 2.5  },
  "정보형페이지":              { price: 280000,   score: 3    },
  "웹진형페이지":              { price: 500000,   score: 4    },
  "상세페이지(심플)":          { price: 600000,   score: 4    },
  "상세페이지(베이직)":        { price: 900000,   score: 4.5  },
  "상세페이지(프리미엄)":      { price: 1200000,  score: 5    },
  "이벤트페이지(심플)":        { price: 300000,   score: 2.5  },
  "이벤트페이지(베이직)":      { price: 500000,   score: 3    },
  "스킨(심플)":                { price: 120000,   score: 1.5  },
  "스킨(베이직)":              { price: 150000,   score: 2    },
  "리터칭(심플)":              { price: 10000,    score: 0.4  },
  "리터칭(베이직)":            { price: 50000,    score: 0.6  },
  "리터칭(프리미엄)":          { price: 80000,    score: 1    },
  "영상(심플)":                { price: 40000,    score: 0.6  },
  "영상(베이직)":              { price: 70000,    score: 1    },
  "영상(프리미엄)":            { price: 110000,   score: 1.5  },
  "PPT":                       { price: 35000,    score: 0.6  },
  "기타":                      { price: 10000,    score: 0.2  },
  "유지보수(심플)":            { price: 5000,     score: 0.2  },
  "유지보수(베이직)":          { price: 10000,    score: 0.3  },
  "홈페이지PC_메인(심플)":     { price: 800000,   score: 2    },
  "홈페이지PC_메인(베이직)":   { price: 1300000,  score: 3    },
  "홈페이지PC_메인(프리미엄)": { price: 1800000,  score: 4    },
  "홈페이지PC_서브(심플)":     { price: 200000,   score: 1.5  },
  "홈페이지PC_서브(베이직)":   { price: 300000,   score: 2    },
  "홈페이지PC_서브(프리미엄)": { price: 500000,   score: 3    },
  "홈페이지PC_서브(기타1)":    { price: 100000,   score: 1    },
  "홈페이지PC_서브(기타ALL)":  { price: 300000,   score: 2.5  },
  "사내":                      { price: 0,        score: 0    },
  "X":                         { price: 0,        score: 0    },
  "KV(off)":                   { price: 2000000,  score: 10   },
  "디지털(메인)":              { price: 300000,   score: 2    },
  "디지털(베리)":              { price: 50000,    score: 0.4  },
  "디지털(ALL)":               { price: 700000,   score: 5.2  },
  "옥외A(M)":                  { price: 400000,   score: 3    },
  "옥외A(L)":                  { price: 600000,   score: 4    },
  "옥외B(심플)":               { price: 150000,   score: 2    },
  "옥외B(베이직)":             { price: 250000,   score: 2.5  },
  "포스터(S)":                 { price: 300000,   score: 2.5  },
  "포스터(M)":                 { price: 450000,   score: 3    },
  "포스터(L)":                 { price: 600000,   score: 4    },
  "잡지(1P미만)":              { price: 150000,   score: 1.5  },
  "잡지(1P)":                  { price: 300000,   score: 2    },
  "잡지(2P)":                  { price: 500000,   score: 3.5  },
  "책자_커버":                 { price: 250000,   score: 2.5  },
  "책자_내지(심플)":           { price: 80000,    score: 1    },
  "책자_내지(베이직)":         { price: 120000,   score: 1.5  },
  "리플렛(8절)":               { price: 300000,   score: 3    },
  "리플렛(4절)":               { price: 400000,   score: 3.5  },
  "리플렛(특수)":              { price: 500000,   score: 4    },
  "신문(2단)":                 { price: 150000,   score: 1.5  },
  "신문(6단)":                 { price: 250000,   score: 2.5  },
  "신문(10단)":                { price: 400000,   score: 3.5  },
  "신문(15단)":                { price: 500000,   score: 4    },
  "제품패키지":                { price: 600000,   score: 4    },
  "라벨(S)":                   { price: 30000,    score: 0.5  },
  "라벨(M/L)":                 { price: 100000,   score: 1    },
  "명함(심플)":                { price: 150000,   score: 1.5  },
  "명함(베이직)":              { price: 200000,   score: 2    },
  "로고(심플)":                { price: 300000,   score: 1.5  },
  "로고(베이직)":              { price: 1200000,  score: 4    },
  "로고(프리미엄)":            { price: 2000000,  score: 10   },
  "기타(off)":                 { price: 20000,    score: 0.4  },
  "사내(off)":                 { price: 0,        score: 0    },
  "사이즈베리(심플off)":       { price: 30000,    score: 0.2  },
  "사이즈베리(베이직off)":     { price: 100000,   score: 0.4  },
  "사이즈베리(프리미엄off)":   { price: 200000,   score: 0.8  },
};

// ============================================================
// 메인 함수 — 수동 실행 or 시간 기반 트리거로 호출
// ============================================================
function syncCompletedToDataSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const completedSheet = ss.getSheetByName(COMPLETED_SHEET_NAME);

  // 업무 데이터 시트: 같은 파일이면 ss, 다른 파일이면 ID로 열기
  const dataSS   = DATA_SHEET_ID ? SpreadsheetApp.openById(DATA_SHEET_ID) : ss;
  const dataSheet = dataSS.getSheetByName(DATA_SHEET_NAME);

  if (!completedSheet) { Logger.log("❌ 완료 시트를 찾을 수 없습니다."); return; }
  if (!dataSheet)      { Logger.log("❌ 업무 데이터 시트를 찾을 수 없습니다."); return; }

  const lastRow = completedSheet.getLastRow();
  if (lastRow < COMPLETED_DATA_START_ROW) { Logger.log("완료 시트에 데이터 없음"); return; }

  // 완료 시트 전체 읽기 (B~Q, 16열)
  // 열 순서: B타입 C팀 D담당자 E광고주 F작업자 G온오프 H작업유형 I수량 J비고
  //          K상태 L:ID M공유 N백업 O요청일 P공유일 Q:TAT
  const sourceData = completedSheet
    .getRange(COMPLETED_DATA_START_ROW, 2, lastRow - COMPLETED_DATA_START_ROW + 1, 16)
    .getValues();

  // 기존 업무 데이터 키 세트 (중복 방지) — 광고주+작업유형+비고+완료일
  const existingKeys = buildExistingKeys(dataSheet);

  const newRows = [];

  for (const row of sourceData) {
    const [type, team, manager, advertiser, worker, onoff, workType, qty, note,
           status, id, shared, backup, requestDate, shareDate, tat] = row;

    // 빈 행 · 미이식 대상 스킵
    if (!advertiser || !workType) {
      Logger.log(`⚠️ [빈 행 스킵] 광고주: "${advertiser}" / 작업유형: "${workType}"`);
      continue;
    }

    // 공유일 파싱
    const parsedDate = parseDateValue(shareDate);
    if (!parsedDate) {
      Logger.log(`⚠️ [날짜 파싱 실패] 광고주: "${advertiser}" / 공유일 원본값: "${shareDate}"`);
      continue;
    }

    const year   = parsedDate.getFullYear();
    const month  = parsedDate.getMonth() + 1;
    const completedDateStr = formatDateKR(parsedDate);

    // 중복 체크: 4-field (광고주+작업유형+비고+완료일)
    const key = `${advertiser}|${workType}|${note}|${completedDateStr}`;
    if (existingKeys.has(key)) {
      Logger.log(`⚠️ [중복 스킵] ${key}`);
      continue;
    }

    // 단가 / 수치 조회
    const info     = PRICE_TABLE[workType] || null;
    const price    = info !== null ? info.price : "";
    const score    = info !== null ? info.score : "";
    const qtyPrice = (price !== "" && qty !== "" && qty !== 0) ? qty * price : "";
    const qtyScore = (score !== "" && qty !== "" && qty !== 0) ? qty * score : "";

    newRows.push([
      year,             // A: 연도
      `${month}월`,     // B: 월
      type,             // C: 타입
      team,             // D: 팀
      manager,          // E: 담당자
      advertiser,       // F: 광고주
      worker,           // G: 작업자
      onoff,            // H: ON/OFF
      workType,         // I: 작업유형
      qty,              // J: 수량
      price,            // K: 단가
      score,            // L: 수치
      qtyPrice,         // M: 수량*단가
      qtyScore,         // N: 수량*수치
      note,             // O: 비고
      parsedDate,       // P: 완료일 (Date 객체)
      tat,              // Q: TAT
      id || ""          // R: ID (완료 시트에서 운반된 UUID, 없으면 빈 문자열)
    ]);

    existingKeys.add(key);
  }

  if (newRows.length === 0) {
    Logger.log("✅ 이식할 신규 데이터 없음 (모두 기존 등록)");
    return;
  }

  const insertStart = dataSheet.getLastRow() + 1;
  dataSheet.getRange(insertStart, 1, newRows.length, 18).setValues(newRows); // 18열 (R열 포함)
  Logger.log(`✅ ${newRows.length}건 이식 완료 (행 ${insertStart}~${insertStart + newRows.length - 1})`);
}

// ============================================================
// 트리거 설정 함수 — 한 번만 실행하면 됨
// ============================================================
function setTimeTrigger() {
  // 기존 트리거 중복 방지: 같은 함수명 트리거 제거 후 재등록
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "syncCompletedToDataSheet") {
      ScriptApp.deleteTrigger(t);
    }
  });

  // 매일 오전 9시 실행 (원하는 주기로 변경 가능)
  ScriptApp.newTrigger("syncCompletedToDataSheet")
    .timeBased()
    .everyDays(1)
    .atHour(9)
    .create();

  Logger.log("✅ 트리거 설정 완료: 매일 오전 9시 자동 실행");
}

// ============================================================
// 헬퍼 함수
// ============================================================

/**
 * 업무 데이터 시트의 기존 행들로 중복 체크용 Set 생성
 * 키: 광고주(F=6열) + 작업유형(I=9열) + 비고(O=15열) + 완료일(P=16열)
 *
 * v2.2.0: ID 기반 검사 제거. 사고 회피용 단순화 (헤더 주석 참조).
 * R열 ID는 데이터로만 운반되고 중복 체크엔 안 씀.
 */
function buildExistingKeys(dataSheet) {
  const existingKeys = new Set();
  const lastRow = dataSheet.getLastRow();
  if (lastRow < 2) return existingKeys;

  const data = dataSheet.getRange(2, 1, lastRow - 1, 16).getValues(); // 16열 (P 완료일까지)
  data.forEach(row => {
    const dateVal = row[15]; // P: 완료일
    const dateStr = dateVal instanceof Date ? formatDateKR(dateVal) : String(dateVal);
    const key = `${row[5]}|${row[8]}|${row[14]}|${dateStr}`;
    existingKeys.add(key);
  });
  return existingKeys;
}

/**
 * 완료 시트의 공유일(MM/dd 문자열 또는 Date) → Date 객체
 * 연말 경계 처리: 현재 1월인데 날짜가 12월이면 전년도로 처리
 */
function parseDateValue(value) {
  if (value instanceof Date && !isNaN(value)) return value;
  if (typeof value === "string") {
    const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})$/);
    if (match) {
      const now = new Date();
      const m   = parseInt(match[1]);
      const d   = parseInt(match[2]);
      let   y   = now.getFullYear();
      if (now.getMonth() === 0 && m === 12) y -= 1; // 1월에 12월 데이터 → 전년도
      return new Date(y, m - 1, d);
    }
  }
  return null;
}

/**
 * Date → "YYYY. MM. DD." 형식 (업무 데이터 시트 완료일 형식)
 */
function formatDateKR(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}. ${m}. ${d}.`;
}

// ============================================================
// 마이그레이션 — 업무 데이터 시트 8000+ 행에 R열 ID 일괄 부여
// (1회 실행. 큰 분량이라 시간 한도(GAS 6분) 대비 배치 처리 + 이어 진행)
//
// 사용법:
//   1) GAS 콘솔에서 migrateDataSheetIds 선택 후 ▶ 실행
//   2) 로그에 "전체 마이그레이션 완료" 보일 때까지 반복 실행 (5분 한도 도달 시 자동 종료, 다시 실행하면 이어서 진행)
//   3) 처음부터 다시 하려면 resetMigrateDataSheetIdsProgress 실행
// ============================================================
function migrateDataSheetIds() {
  const ss = DATA_SHEET_ID ? SpreadsheetApp.openById(DATA_SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(DATA_SHEET_NAME);
  if (!sheet) { Logger.log('❌ 업무 데이터 시트 없음: ' + DATA_SHEET_NAME); return; }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) { Logger.log('✅ 데이터 없음'); return; }

  const ID_COL = 18; // R열
  const ADV_COL = 6; // F: 광고주

  const props = PropertiesService.getScriptProperties();
  const lastProcessedRow = parseInt(props.getProperty('migrateDataSheetIds_lastRow') || '1', 10);
  const startRow = Math.max(2, lastProcessedRow + 1);

  if (startRow > lastRow) {
    Logger.log(`✅ 이미 모두 마이그레이션 완료 (마지막 처리 행: ${lastProcessedRow})`);
    return;
  }

  const startTime = new Date().getTime();
  const TIME_LIMIT_MS = 5 * 60 * 1000; // 5분 안전 마진 (GAS 6분 한도)
  const BATCH_SIZE = 500;

  let totalAssigned = 0;
  let row = startRow;

  Logger.log(`📊 시작: 행 ${row}부터 (전체 ${lastRow}행, 진행률 ${Math.round((row-1)/lastRow*100)}%)`);

  while (row <= lastRow) {
    if (new Date().getTime() - startTime > TIME_LIMIT_MS) {
      Logger.log(`⏱ 시간 한도 도달. 행 ${row - 1}까지 처리. 다시 실행하면 이어서 진행 (${Math.round((row-1)/lastRow*100)}%)`);
      break;
    }

    const batchEnd = Math.min(row + BATCH_SIZE - 1, lastRow);
    const batchSize = batchEnd - row + 1;

    const existingIds = sheet.getRange(row, ID_COL, batchSize, 1).getValues();
    const advValues = sheet.getRange(row, ADV_COL, batchSize, 1).getValues();

    const newIds = [];
    let assignedInBatch = 0;
    for (let i = 0; i < batchSize; i++) {
      if (existingIds[i][0]) {
        newIds.push([existingIds[i][0]]); // 기존 ID 유지
      } else if (advValues[i][0]) {
        newIds.push([Utilities.getUuid()]);
        assignedInBatch++;
      } else {
        newIds.push([""]); // 빈 행
      }
    }

    sheet.getRange(row, ID_COL, batchSize, 1).setValues(newIds);
    totalAssigned += assignedInBatch;

    props.setProperty('migrateDataSheetIds_lastRow', String(batchEnd));
    row = batchEnd + 1;
  }

  if (row > lastRow) {
    Logger.log(`✅ 전체 마이그레이션 완료. 이번 실행 ${totalAssigned}개 부여 (이미 ID 있던 행은 유지)`);
    props.deleteProperty('migrateDataSheetIds_lastRow');
  } else {
    Logger.log(`📊 진행 상황: ${row - 1}/${lastRow} 행 처리. 이번 실행 ${totalAssigned}개 부여. 다시 함수 실행하면 이어서 진행`);
  }
}

// 마이그레이션 진행 상태 리셋 (처음부터 다시 하려면)
function resetMigrateDataSheetIdsProgress() {
  PropertiesService.getScriptProperties().deleteProperty('migrateDataSheetIds_lastRow');
  Logger.log('✅ 진행 상태 리셋됨. 다음 migrateDataSheetIds 실행은 행 2부터 시작');
}
