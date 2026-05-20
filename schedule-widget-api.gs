// ============================================================
// 스케줄 위젯 API — schedule-widget-api.gs
// 💛신규·유지보수 시트 기반
// - doGet: 팀원별 미완료 작업 + 공유대기 반환 (rowIndex 포함)
//   · 각 작업 행의 '마감일'을 시트 셀 배경색으로 파싱
//     - 9행 M열~ 끝열에 날짜 헤더가 있음
//     - 데이터 행의 M열~ 끝열 셀 배경색을 검사:
//       핑크(#ffdcef)가 하나라도 있으면 가장 우측 핑크 = 마감일
//       핑크가 없고 빨강(#ff0000)이 있으면 가장 우측 빨강 = 마감일
//       둘 다 없으면 due = null
// - doPost: 상태(K열) / 공유(L열) 변경
//   · LockService로 동시 실행 직렬화
//   · expect(광고주/비고) 검증으로 행 어긋남(stale rowIndex) 방지
// ============================================================

const SCHEDULE_SHEET_NAME = '💛신규·유지보수';
const DATA_START_ROW = 10;
const MEMBERS = ['부수빈', '이소빈', '조희주', '강진이', '김수현', '서아라'];

// 컬럼 인덱스 (1-based)
const COL = {
  광고주: 5,   // E
  작업자: 6,   // F
  수량: 9,     // I
  비고: 10,    // J
  상태: 11,    // K
  공유: 12,    // L
};

// 마감일 추출용
const DATE_HEADER_ROW = 9;     // 9행에 날짜 헤더
const DATE_START_COL = 13;     // M열부터 날짜
const DUE_COLOR_PINK = '#ffdcef';  // 마감 범위
const DUE_COLOR_RED = '#ff0000';   // 단독 마감일(예: 이미 지난 마감)

// 상태 화이트리스트 (POST 검증)
const VALID_STATUSES = ['미정', '대기', '진행', '완료'];

// 동시 실행 직렬화 락 대기 한도
const LOCK_TIMEOUT_MS = 10000;

// ============================================================
// GET
// ============================================================
function doGet(e) {
  try {
    const params = e.parameter || {};
    const type = params.type || 'schedule';
    let result;

    if (type === 'members') {
      result = { members: MEMBERS };
    } else if (type === 'schedule') {
      result = getSchedule(params.member);
    } else {
      result = { error: '알 수 없는 type: ' + type };
    }

    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function getSchedule(member) {
  if (!member) return { error: 'member 파라미터 필요' };
  if (!MEMBERS.includes(member)) return { error: '등록되지 않은 팀원: ' + member };

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SCHEDULE_SHEET_NAME);
  if (!sheet) return { error: '시트를 찾을 수 없습니다: ' + SCHEDULE_SHEET_NAME };

  const lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) return { schedule: [], pending: [], summary: { total: 0, pending: 0 } };

  const lastCol = sheet.getLastColumn();
  const dateColCount = Math.max(0, lastCol - DATE_START_COL + 1);
  const dataRowCount = lastRow - DATA_START_ROW + 1;

  // 9행 날짜 헤더 (Date 객체)와 데이터 영역 배경색 일괄 조회
  let dateValues = [];
  let bgMatrix = [];
  if (dateColCount > 0) {
    dateValues = sheet
      .getRange(DATE_HEADER_ROW, DATE_START_COL, 1, dateColCount)
      .getValues()[0];
    bgMatrix = sheet
      .getRange(DATA_START_ROW, DATE_START_COL, dataRowCount, dateColCount)
      .getBackgrounds();
  }

  // 비고(J열) 셀 메모 일괄 조회 — 메모 = 원본 메일 제목
  // 위젯에서 비고 클릭 시 메일 제목 복사용
  const noteMemos = sheet
    .getRange(DATA_START_ROW, COL.비고, dataRowCount, 1)
    .getNotes()
    .map((row) => row[0] || '');

  const tz = Session.getScriptTimeZone();
  function findDueForRow(rowIdxInBlock) {
    const bgRow = bgMatrix[rowIdxInBlock] || [];
    let pinkIdx = -1;
    let redIdx = -1;
    // 가장 우측부터 검사
    for (let j = bgRow.length - 1; j >= 0; j--) {
      const c = String(bgRow[j] || '').toLowerCase();
      if (pinkIdx === -1 && c === DUE_COLOR_PINK) pinkIdx = j;
      if (redIdx === -1 && c === DUE_COLOR_RED) redIdx = j;
    }
    // 핑크 우선, 핑크 없으면 빨강
    const idx = pinkIdx !== -1 ? pinkIdx : redIdx;
    if (idx === -1) return null;
    const v = dateValues[idx];
    if (v instanceof Date) {
      return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
    }
    return null;
  }

  const range = sheet.getRange(DATA_START_ROW, 1, dataRowCount, COL.공유);
  const rows = range.getValues();

  const schedule = [];
  const pending = [];

  rows.forEach((row, i) => {
    const 작업자 = String(row[COL.작업자 - 1] || '').trim();
    if (작업자 !== member) return;

    const rowIndex = DATA_START_ROW + i; // 시트 절대 행 번호 (위젯이 POST 시 사용)
    const 광고주 = String(row[COL.광고주 - 1] || '');
    const 수량 = row[COL.수량 - 1] || 0;
    const 비고 = String(row[COL.비고 - 1] || '');
    const 상태 = String(row[COL.상태 - 1] || '').trim();
    const 공유 = row[COL.공유 - 1];
    const due = findDueForRow(i); // 'YYYY-MM-DD' or null
    const noteText = noteMemos[i] || null; // 비고 셀 메모(=메일 제목), 없으면 null

    if (상태 === '완료' && 공유 !== true) {
      pending.push({ rowIndex, 광고주, 비고, 수량, noteText });
    } else if (상태 !== '완료') {
      schedule.push({ rowIndex, 광고주, 비고, 수량, 상태, due, noteText });
    }
  });

  return {
    schedule,
    pending,
    summary: {
      total: schedule.length,
      pending: pending.length,
    },
  };
}

// ============================================================
// POST — 상태/공유 변경
// 요청 본문(JSON):
//   { action: 'setStatus', rowIndex, value, expect: { 광고주, 비고 } }
//   { action: 'setShare',  rowIndex, value, expect: { 광고주, 비고 } }
//
// expect: 클라이언트가 마지막 fetch 시 본 광고주/비고. 현재 시트와 다르면
//         행 어긋남(운영자가 행 삽입/삭제)으로 보고 거부.
//
// 응답:
//   { ok: true, action, rowIndex, value }
//   { error: '...', code: 'STALE'|'BUSY'|'INVALID' }
// ============================================================
function doPost(e) {
  // 1) 동시 실행 직렬화 — 두 사용자가 동시에 POST 보내도 순서대로 처리
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(LOCK_TIMEOUT_MS);
  } catch (lockErr) {
    return jsonResponse({
      error: '서버가 바쁩니다. 잠시 후 다시 시도해주세요.',
      code: 'BUSY',
    });
  }

  try {
    const body = JSON.parse((e.postData && e.postData.contents) || '{}');
    const action = body.action;
    const rowIndex = body.rowIndex;
    const value = body.value;
    const expect = body.expect;

    if (!Number.isInteger(rowIndex) || rowIndex < DATA_START_ROW) {
      return jsonResponse({ error: 'invalid rowIndex', code: 'INVALID' });
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SCHEDULE_SHEET_NAME);
    if (!sheet) return jsonResponse({ error: 'sheet not found', code: 'INVALID' });
    if (rowIndex > sheet.getLastRow()) return jsonResponse({ error: 'rowIndex out of range', code: 'STALE' });

    // 2) Optimistic Locking — 클라이언트가 본 광고주/비고가 현재 시트와 일치하는지 확인
    //    expect 제공 시에만 적용 (구버전 위젯 호환)
    if (expect && (expect['광고주'] != null || expect['비고'] != null)) {
      const currentClient = String(sheet.getRange(rowIndex, COL.광고주).getValue() || '').trim();
      const currentNote   = String(sheet.getRange(rowIndex, COL.비고).getValue() || '').trim();
      const expectClient  = String(expect['광고주'] || '').trim();
      const expectNote    = String(expect['비고'] || '').trim();
      if (currentClient !== expectClient || currentNote !== expectNote) {
        return jsonResponse({
          error: '시트가 변경되었습니다. 새로고침 후 다시 시도해주세요.',
          code: 'STALE',
        });
      }
    }

    if (action === 'setStatus') {
      if (!VALID_STATUSES.includes(value)) return jsonResponse({ error: 'invalid status', code: 'INVALID' });
      sheet.getRange(rowIndex, COL.상태).setValue(value);
      return jsonResponse({ ok: true, action, rowIndex, value });
    }

    if (action === 'setShare') {
      const v = Boolean(value);
      sheet.getRange(rowIndex, COL.공유).setValue(v);

      // GAS의 onEdit 트리거는 스크립트의 setValue로는 발동되지 않음.
      // 사용자가 체크박스를 직접 클릭한 것과 동일한 효과를 내기 위해
      // 같은 프로젝트에 있는 moveRowOnCheck를 가짜 이벤트로 호출.
      // (Code.gs와 같은 Apps Script 프로젝트에 통합되어 있어야 함)
      if (v === true && typeof moveRowOnCheck === 'function') {
        try {
          moveRowOnCheck({
            range: sheet.getRange(rowIndex, COL.공유),
            value: 'TRUE',
            source: SpreadsheetApp.getActiveSpreadsheet()
          });
        } catch (moveErr) {
          Logger.log('자동 이관 실패: ' + moveErr);
        }
      }

      return jsonResponse({ ok: true, action, rowIndex, value: v });
    }

    return jsonResponse({ error: 'unknown action: ' + action, code: 'INVALID' });
  } catch (err) {
    return jsonResponse({ error: err.message });
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// 헬퍼
// ============================================================
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
