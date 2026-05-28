// ============================================================
// 스케줄 위젯 API — schedule-widget-api.gs (v0.2.4)
// 💛신규·유지보수 시트 + 💚완료 시트 기반
//
// 변경 요약 (v0.2.4):
// - L열에 ID 신설 (UUID 자동 발급). 공유 체크박스 L→M, 날짜 헤더 M→N으로 시프트
// - 완료 시트: L=ID, M=공유, N=백업, O=요청일, P=공유일, Q=TAT (마감일 컬럼 제거)
// - 응답에 id 필드 포함 → 위젯이 ID 기반으로 행 식별 (rowIndex 의존 제거)
// - 백업 응답에 공유일 포함 (마감일 대체)
// - GET 시 빈 ID 발견하면 자동 백필 (onEdit 못 잡은 행 안전망)
// - doPost: id 우선 검증, 없으면 expect(광고주/비고)로 fallback
// ============================================================

const WIDGET_SCHEDULE_SHEET = '💛신규·유지보수';
const WIDGET_DONE_SHEET = '💚완료';
const WIDGET_DATA_START_ROW = 10;
const WIDGET_MEMBERS = ['부수빈', '이소빈', '조희주', '강진이', '김수현', '서아라'];

// 컬럼 인덱스 (1-based) — 신규·유지보수 시트
const WIDGET_COL = {
  광고주: 5,   // E
  작업자: 6,   // F
  수량: 9,     // I
  비고: 10,    // J
  상태: 11,    // K
  id: 12,      // L (신설)
  공유: 13,    // M
};

// 컬럼 인덱스 (1-based) — 완료 시트
const WIDGET_DONE_COL = {
  광고주: 5,   // E
  작업자: 6,   // F
  수량: 9,     // I
  비고: 10,    // J
  상태: 11,    // K
  id: 12,      // L (신설)
  공유: 13,    // M
  백업: 14,    // N
  요청일: 15,  // O
  공유일: 16,  // P
  TAT: 17,     // Q
};

// 마감일 추출용 (날짜 헤더 N열로 시프트)
const DATE_HEADER_ROW = 9;
const DATE_START_COL = 14;     // N열부터 날짜
const DUE_COLOR_PINK = '#ffdcef';
const DUE_COLOR_RED = '#ff0000';

const VALID_STATUSES = ['예정', '대기', '진행', '완료']; // v0.2.8: '미정' → '예정'
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
      result = { members: WIDGET_MEMBERS };
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
  if (!WIDGET_MEMBERS.includes(member)) return { error: '등록되지 않은 팀원: ' + member };

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(WIDGET_SCHEDULE_SHEET);
  if (!sheet) return { error: '시트를 찾을 수 없습니다: ' + WIDGET_SCHEDULE_SHEET };

  const lastRow = sheet.getLastRow();
  if (lastRow < WIDGET_DATA_START_ROW) return { schedule: [], pending: [], backup: [], summary: { total: 0, pending: 0, backup: 0 } };

  const lastCol = sheet.getLastColumn();
  const dateColCount = Math.max(0, lastCol - DATE_START_COL + 1);
  const dataRowCount = lastRow - WIDGET_DATA_START_ROW + 1;

  let dateValues = [];
  let bgMatrix = [];
  if (dateColCount > 0) {
    dateValues = sheet
      .getRange(DATE_HEADER_ROW, DATE_START_COL, 1, dateColCount)
      .getValues()[0];
    bgMatrix = sheet
      .getRange(WIDGET_DATA_START_ROW, DATE_START_COL, dataRowCount, dateColCount)
      .getBackgrounds();
  }

  // 비고(J열) 셀 메모 일괄 조회 — 메모 = 원본 메일 제목
  const noteMemos = sheet
    .getRange(WIDGET_DATA_START_ROW, WIDGET_COL.비고, dataRowCount, 1)
    .getNotes()
    .map((row) => row[0] || '');

  const tz = Session.getScriptTimeZone();
  function findDueForRow(rowIdxInBlock) {
    const bgRow = bgMatrix[rowIdxInBlock] || [];
    let pinkIdx = -1;
    let redIdx = -1;
    for (let j = bgRow.length - 1; j >= 0; j--) {
      const c = String(bgRow[j] || '').toLowerCase();
      if (pinkIdx === -1 && c === DUE_COLOR_PINK) pinkIdx = j;
      if (redIdx === -1 && c === DUE_COLOR_RED) redIdx = j;
    }
    const idx = pinkIdx !== -1 ? pinkIdx : redIdx;
    if (idx === -1) return null;
    const v = dateValues[idx];
    if (v instanceof Date) {
      return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
    }
    return null;
  }

  // A~M열 (1~13) 한 번에 읽음 — 광고주, 작업자, 수량, 비고, 상태, id, 공유 모두 포함
  const range = sheet.getRange(WIDGET_DATA_START_ROW, 1, dataRowCount, WIDGET_COL.공유);
  const rows = range.getValues();

  // GET 시 빈 ID 백필 (onEdit 못 잡은 행 안전망) — 변경 있을 때만 일괄 setValue
  const idBackfill = []; // { row, id }
  rows.forEach((row, i) => {
    const 작업자 = String(row[WIDGET_COL.작업자 - 1] || '').trim();
    const 광고주 = String(row[WIDGET_COL.광고주 - 1] || '').trim();
    const id = row[WIDGET_COL.id - 1];
    // 데이터 행이면서 ID 빈 경우만 발급 (광고주 또는 작업자가 있으면 데이터 행으로 간주)
    if (!id && (광고주 || 작업자)) {
      const newId = Utilities.getUuid();
      idBackfill.push({ row: WIDGET_DATA_START_ROW + i, id: newId });
      row[WIDGET_COL.id - 1] = newId; // 응답에도 반영
    }
  });
  if (idBackfill.length > 0) {
    idBackfill.forEach(({ row, id }) => {
      sheet.getRange(row, WIDGET_COL.id).setValue(id);
    });
  }

  const schedule = [];
  const pending = [];

  rows.forEach((row, i) => {
    const 작업자 = String(row[WIDGET_COL.작업자 - 1] || '').trim();
    if (작업자 !== member) return;

    const rowIndex = WIDGET_DATA_START_ROW + i;
    const id = String(row[WIDGET_COL.id - 1] || '');
    const 광고주 = String(row[WIDGET_COL.광고주 - 1] || '');
    const 수량 = row[WIDGET_COL.수량 - 1] || 0;
    const 비고 = String(row[WIDGET_COL.비고 - 1] || '');
    const 상태 = String(row[WIDGET_COL.상태 - 1] || '').trim();
    const 공유 = row[WIDGET_COL.공유 - 1];
    const due = findDueForRow(i);
    const noteText = noteMemos[i] || null;

    if (상태 === '완료' && 공유 !== true) {
      pending.push({ id, rowIndex, 광고주, 비고, 수량, noteText });
    } else if (상태 !== '완료') {
      schedule.push({ id, rowIndex, 광고주, 비고, 수량, 상태, due, noteText });
    }
  });

  const backup = getBackupRows(member);

  return {
    schedule,
    pending,
    backup,
    summary: {
      total: schedule.length,
      pending: pending.length,
      backup: backup.length,
    },
  };
}

// 💚완료 시트에서 본인 작업 중 백업 미체크인 행 반환
// 각 행: { id, rowIndex, 광고주, 비고, 수량, 공유일: 'YYYY-MM-DD' | null }
// (마감일 컬럼 제거됨 → 공유일을 그룹화 키로 사용. 위젯 UI 라벨은 "마감일" 유지 가능)
function getBackupRows(member) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(WIDGET_DONE_SHEET);
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  if (lastRow < WIDGET_DATA_START_ROW) return [];

  const dataRowCount = lastRow - WIDGET_DATA_START_ROW + 1;
  // 광고주(E) ~ TAT(Q)까지 한 번에 읽음
  const range = sheet.getRange(
    WIDGET_DATA_START_ROW,
    1,
    dataRowCount,
    WIDGET_DONE_COL.TAT
  );
  const rows = range.getValues();

  // GET 시 빈 ID 백필 (완료 시트도 안전망)
  const idBackfill = [];
  rows.forEach((row, i) => {
    const 광고주 = String(row[WIDGET_DONE_COL.광고주 - 1] || '').trim();
    const id = row[WIDGET_DONE_COL.id - 1];
    if (!id && 광고주) {
      const newId = Utilities.getUuid();
      idBackfill.push({ row: WIDGET_DATA_START_ROW + i, id: newId });
      row[WIDGET_DONE_COL.id - 1] = newId;
    }
  });
  if (idBackfill.length > 0) {
    idBackfill.forEach(({ row, id }) => {
      sheet.getRange(row, WIDGET_DONE_COL.id).setValue(id);
    });
  }

  const tz = Session.getScriptTimeZone();
  const result = [];

  rows.forEach((row, i) => {
    const 작업자 = String(row[WIDGET_DONE_COL.작업자 - 1] || '').trim();
    if (작업자 !== member) return;

    const 백업 = row[WIDGET_DONE_COL.백업 - 1];
    if (백업 === true) return;

    const rowIndex = WIDGET_DATA_START_ROW + i;
    const id = String(row[WIDGET_DONE_COL.id - 1] || '');
    const 광고주 = String(row[WIDGET_DONE_COL.광고주 - 1] || '');
    const 비고 = String(row[WIDGET_DONE_COL.비고 - 1] || '');
    const 수량 = row[WIDGET_DONE_COL.수량 - 1] || 0;
    const rawShareDate = row[WIDGET_DONE_COL.공유일 - 1];
    let 공유일 = null;
    if (rawShareDate instanceof Date) {
      공유일 = Utilities.formatDate(rawShareDate, tz, 'yyyy-MM-dd');
    } else if (typeof rawShareDate === 'string' && rawShareDate.trim()) {
      // "MM/dd" 형식 (moveRowOnCheck에서 박는 형식) → 현재 연도 가정해서 yyyy-MM-dd 변환
      const m = rawShareDate.trim().match(/^(\d{1,2})\/(\d{1,2})$/);
      if (m) {
        const now = new Date();
        let y = now.getFullYear();
        const mo = parseInt(m[1], 10);
        const d = parseInt(m[2], 10);
        // 연말 경계: 1월에 12월 데이터면 전년도
        if (now.getMonth() === 0 && mo === 12) y -= 1;
        공유일 = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    }

    result.push({ id, rowIndex, 광고주, 비고, 수량, 공유일 });
  });

  return result;
}

// ============================================================
// POST — 상태/공유/백업 변경
// 요청 본문(JSON):
//   { action: 'setStatus', id?, rowIndex, value, expect: { 광고주, 비고 } }
//   { action: 'setShare',  id?, rowIndex, value, expect: { 광고주, 비고 } }
//   { action: 'setBackup', id?, rowIndex, value, expect: { 광고주, 비고 } }
//
// 검증 우선순위:
//   1) id가 있으면 시트에서 그 id를 가진 행을 찾아 사용 (rowIndex 시프트 안전)
//   2) id 없거나 못 찾으면 rowIndex + expect(광고주/비고) fallback
// ============================================================
function doPost(e) {
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
    const id = body.id ? String(body.id) : null;
    let rowIndex = body.rowIndex;
    const value = body.value;
    const expect = body.expect;

    // setBackup은 💚완료 시트
    if (action === 'setBackup') {
      const doneSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(WIDGET_DONE_SHEET);
      if (!doneSheet) return jsonResponse({ error: 'completed sheet not found', code: 'INVALID' });

      // id 우선 lookup
      if (id) {
        const found = findRowByIdInSheet(doneSheet, id, WIDGET_DONE_COL.id);
        if (found > 0) rowIndex = found;
      }

      if (!Number.isInteger(rowIndex) || rowIndex < WIDGET_DATA_START_ROW) {
        return jsonResponse({ error: 'invalid rowIndex', code: 'INVALID' });
      }
      if (rowIndex > doneSheet.getLastRow()) {
        return jsonResponse({ error: 'rowIndex out of range', code: 'STALE' });
      }

      // expect 검증 (id로 못 찾았을 때만 의미 있음, id 매칭됐으면 이미 정확한 행)
      if (!id && expect && (expect['광고주'] != null || expect['비고'] != null)) {
        const c = String(doneSheet.getRange(rowIndex, WIDGET_DONE_COL.광고주).getValue() || '').trim();
        const n = String(doneSheet.getRange(rowIndex, WIDGET_DONE_COL.비고).getValue() || '').trim();
        if (c !== String(expect['광고주'] || '').trim() || n !== String(expect['비고'] || '').trim()) {
          return jsonResponse({
            error: '시트가 변경되었습니다. 새로고침 후 다시 시도해주세요.',
            code: 'STALE',
          });
        }
      }

      doneSheet.getRange(rowIndex, WIDGET_DONE_COL.백업).setValue(Boolean(value));
      return jsonResponse({ ok: true, action, rowIndex, value: Boolean(value) });
    }

    // setStatus / setShare는 💛신규·유지보수 시트
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(WIDGET_SCHEDULE_SHEET);
    if (!sheet) return jsonResponse({ error: 'sheet not found', code: 'INVALID' });

    // id 우선 lookup
    if (id) {
      const found = findRowByIdInSheet(sheet, id, WIDGET_COL.id);
      if (found > 0) rowIndex = found;
    }

    if (!Number.isInteger(rowIndex) || rowIndex < WIDGET_DATA_START_ROW) {
      return jsonResponse({ error: 'invalid rowIndex', code: 'INVALID' });
    }
    if (rowIndex > sheet.getLastRow()) {
      return jsonResponse({ error: 'rowIndex out of range', code: 'STALE' });
    }

    // expect fallback 검증 (id로 못 찾았을 때만)
    if (!id && expect && (expect['광고주'] != null || expect['비고'] != null)) {
      const currentClient = String(sheet.getRange(rowIndex, WIDGET_COL.광고주).getValue() || '').trim();
      const currentNote   = String(sheet.getRange(rowIndex, WIDGET_COL.비고).getValue() || '').trim();
      if (currentClient !== String(expect['광고주'] || '').trim() ||
          currentNote   !== String(expect['비고']   || '').trim()) {
        return jsonResponse({
          error: '시트가 변경되었습니다. 새로고침 후 다시 시도해주세요.',
          code: 'STALE',
        });
      }
    }

    if (action === 'setStatus') {
      if (!VALID_STATUSES.includes(value)) return jsonResponse({ error: 'invalid status', code: 'INVALID' });
      sheet.getRange(rowIndex, WIDGET_COL.상태).setValue(value);
      return jsonResponse({ ok: true, action, rowIndex, value });
    }

    if (action === 'setShare') {
      const v = Boolean(value);
      sheet.getRange(rowIndex, WIDGET_COL.공유).setValue(v);

      // moveRowOnCheck를 가짜 이벤트로 호출 (사용자 직접 클릭과 동일 효과)
      if (v === true && typeof moveRowOnCheck === 'function') {
        try {
          moveRowOnCheck({
            range: sheet.getRange(rowIndex, WIDGET_COL.공유),
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
// ID lookup — 시트의 idCol(1-based)에서 주어진 id의 행 번호 반환 (없으면 0)
// 데이터 영역(10행~끝)만 검색
// ============================================================
function findRowByIdInSheet(sheet, id, idCol) {
  const lastRow = sheet.getLastRow();
  if (lastRow < WIDGET_DATA_START_ROW) return 0;

  const idColValues = sheet
    .getRange(WIDGET_DATA_START_ROW, idCol, lastRow - WIDGET_DATA_START_ROW + 1, 1)
    .getValues();

  for (let i = 0; i < idColValues.length; i++) {
    if (String(idColValues[i][0] || '') === id) {
      return WIDGET_DATA_START_ROW + i;
    }
  }
  return 0;
}

// ============================================================
// 마이그레이션 함수 (1회 실행) — 기존 행에 ID 일괄 부여
// GAS 콘솔에서 함수 선택 후 ▶ 실행 클릭
// ============================================================

// 💛신규·유지보수 시트의 빈 ID 행에 일괄 발급
function widgetMigrateScheduleIds() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(WIDGET_SCHEDULE_SHEET);
  if (!sheet) { Logger.log('❌ 신규·유지보수 시트 없음'); return; }
  const count = migrateSheetIds_(sheet, WIDGET_COL.id, WIDGET_COL.광고주, WIDGET_COL.작업자);
  Logger.log(`✅ 신규·유지보수 시트: ${count}개 행에 ID 부여`);
}

// 💚완료 시트의 빈 ID 행에 일괄 발급
function widgetMigrateCompletedIds() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(WIDGET_DONE_SHEET);
  if (!sheet) { Logger.log('❌ 완료 시트 없음'); return; }
  const count = migrateSheetIds_(sheet, WIDGET_DONE_COL.id, WIDGET_DONE_COL.광고주, WIDGET_DONE_COL.작업자);
  Logger.log(`✅ 완료 시트: ${count}개 행에 ID 부여`);
}

// 공통 — 빈 ID 셀에 UUID 일괄 발급
function migrateSheetIds_(sheet, idCol, advCol, workerCol) {
  const lastRow = sheet.getLastRow();
  if (lastRow < WIDGET_DATA_START_ROW) return 0;

  const dataRowCount = lastRow - WIDGET_DATA_START_ROW + 1;
  const lastCol = Math.max(idCol, advCol, workerCol);
  const data = sheet.getRange(WIDGET_DATA_START_ROW, 1, dataRowCount, lastCol).getValues();

  const updates = []; // { row, id }
  for (let i = 0; i < data.length; i++) {
    const existingId = data[i][idCol - 1];
    if (existingId) continue;
    const adv = String(data[i][advCol - 1] || '').trim();
    const worker = String(data[i][workerCol - 1] || '').trim();
    if (!adv && !worker) continue; // 빈 행 스킵
    updates.push({ row: WIDGET_DATA_START_ROW + i, id: Utilities.getUuid() });
  }

  if (updates.length === 0) return 0;

  // 배치 setValue (개별 setValue 반복보다 빠름)
  updates.forEach(({ row, id }) => {
    sheet.getRange(row, idCol).setValue(id);
  });

  return updates.length;
}

// ============================================================
// 헬퍼
// ============================================================
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
