// ============================================================
// 스케줄 위젯 API — schedule-widget-api.gs
// 💛신규·유지보수 시트 기반, 팀원별 미완료 작업 + 공유대기 반환
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

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getSchedule(member) {
  if (!member) return { error: 'member 파라미터 필요' };
  if (!MEMBERS.includes(member)) return { error: '등록되지 않은 팀원: ' + member };

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SCHEDULE_SHEET_NAME);
  if (!sheet) return { error: '시트를 찾을 수 없습니다: ' + SCHEDULE_SHEET_NAME };

  const lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) return { schedule: [], pending: [], summary: { total: 0, pending: 0 } };

  const range = sheet.getRange(DATA_START_ROW, 1, lastRow - DATA_START_ROW + 1, COL.공유);
  const rows = range.getValues();

  const schedule = [];
  const pending = [];

  for (const row of rows) {
    const 작업자 = String(row[COL.작업자 - 1] || '').trim();
    if (작업자 !== member) continue;

    const 광고주 = String(row[COL.광고주 - 1] || '');
    const 수량 = row[COL.수량 - 1] || 0;
    const 비고 = String(row[COL.비고 - 1] || '');
    const 상태 = String(row[COL.상태 - 1] || '').trim();
    const 공유 = row[COL.공유 - 1];

    if (상태 === '완료' && 공유 !== true) {
      pending.push({ 광고주, 비고, 수량 });
    } else if (상태 !== '완료') {
      schedule.push({ 광고주, 비고, 수량, 상태 });
    }
  }

  return {
    schedule,
    pending,
    summary: {
      total: schedule.length,
      pending: pending.length,
    },
  };
}
