// ============================================================
// 영업일 계산 (한국 공휴일 + 회사 휴무일 자동 반영)
// ============================================================
const HOLIDAY_CAL_ID = 'ko.south_korea#holiday@group.v.calendar.google.com';
const COMPANY_HOLIDAY_SHEET = '회사휴무일'; // A열에 날짜만 입력하면 됨

/**
 * 한국 공식 공휴일 (Google Calendar 기반, 6시간 캐시)
 * 음력/대체공휴일 자동 반영. 매년 손댈 필요 없음.
 * 첫 실행 시 캘린더 미구독 상태면 자동 구독 시도.
 */
function getKoreanHolidays(year) {
  const cache = CacheService.getScriptCache();
  const cacheKey = `kr_holidays_${year}`;
  const cached = cache.get(cacheKey);
  if (cached) return new Set(JSON.parse(cached));

  let cal = CalendarApp.getCalendarById(HOLIDAY_CAL_ID);
  if (!cal) {
    try { cal = CalendarApp.subscribeToCalendar(HOLIDAY_CAL_ID); }
    catch (err) { Logger.log(`공휴일 캘린더 구독 실패: ${err}`); }
  }
  if (!cal) return new Set();

  const events = cal.getEvents(
    new Date(year, 0, 1),
    new Date(year, 11, 31, 23, 59, 59)
  );
  const dates = events.map(e =>
    Utilities.formatDate(e.getStartTime(), 'Asia/Seoul', 'yyyy-MM-dd')
  );
  cache.put(cacheKey, JSON.stringify(dates), 21600); // 6시간
  return new Set(dates);
}

/**
 * 회사 자체 휴무일 ('회사휴무일' 시트 A2:A에서 읽음, 1시간 캐시)
 * 시트가 없거나 비어있으면 빈 Set 반환.
 */
function getCompanyHolidays(year) {
  const cache = CacheService.getScriptCache();
  const cacheKey = `company_holidays_${year}`;
  const cached = cache.get(cacheKey);
  if (cached) return new Set(JSON.parse(cached));

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(COMPANY_HOLIDAY_SHEET);
  if (!sheet || sheet.getLastRow() < 2) {
    cache.put(cacheKey, JSON.stringify([]), 3600);
    return new Set();
  }

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  const dates = values
    .map(row => row[0])
    .filter(v => v instanceof Date && v.getFullYear() === year)
    .map(d => Utilities.formatDate(d, 'Asia/Seoul', 'yyyy-MM-dd'));

  cache.put(cacheKey, JSON.stringify(dates), 3600); // 1시간 (시트는 변경 잦을 수 있음)
  return new Set(dates);
}

/**
 * 영업일 여부 (주말 + 한국 공휴일 + 회사 휴무일 모두 제외)
 */
function isBusinessDay(date) {
  const day = date.getDay();
  if (day === 0 || day === 6) return false;

  const dateStr = Utilities.formatDate(date, 'Asia/Seoul', 'yyyy-MM-dd');
  const year = date.getFullYear();
  if (getKoreanHolidays(year).has(dateStr)) return false;
  if (getCompanyHolidays(year).has(dateStr)) return false;
  return true;
}

/**
 * 두 날짜 사이 영업일 수 (start 제외, end 포함)
 * 대시보드의 일평균 건수 계산 등에서 활용
 */
function countBusinessDays(startDate, endDate) {
  let count = 0;
  const cur = new Date(startDate);
  cur.setDate(cur.getDate() + 1); // 시작일 제외 (TAT 계산 관행)
  while (cur <= endDate) {
    if (isBusinessDay(cur)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// ============================================================
// 체크박스 → 완료 시트 이동 + TAT 계산
// (v0.2.4: L열 ID 신설로 공유 체크박스가 M열로 시프트. ID도 같이 이관)
// 신규 시트: B타입 C팀 D담당자 E광고주 F작업자 G온/오프 H작업유형 I수량 J비고 K상태 L:ID M:공유 N~날짜
// 완료 시트: B타입 ... J비고 K상태 L:ID M:공유 N:백업 O:요청일 P:공유일 Q:TAT
// ============================================================
function moveRowOnCheck(e) {
  if (!e) return;

  const range = e.range;
  const col = range.getColumn();
  const value = e.value;
  const TARGET_COL = 13; // M열 (공유 체크박스, L에서 한 칸 시프트)

  if (col !== TARGET_COL || value !== "TRUE") return;

  const sheet = range.getSheet();
  const sheetName = sheet.getName();
  if (!sheetName.includes("신규") || !sheetName.includes("유지보수")) return;

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);

    const row = range.getRow();
    const ss = e.source;
    const targetSheet = ss.getSheetByName("💚완료");
    if (!targetSheet) return;

    const lastCol = sheet.getLastColumn();
    const rowRange = sheet.getRange(row, 1, 1, lastCol);
    const rowValues = rowRange.getValues()[0];
    const rowNotes = rowRange.getNotes()[0];
    const rowBackgrounds = rowRange.getBackgrounds()[0];

    // 날짜 헤더는 N열(14)부터 시작
    const DATE_START = 14;
    const headerRange = sheet.getRange(9, DATE_START, 1, lastCol - DATE_START + 1);
    const headers = headerRange.getDisplayValues()[0];

    // 빨강 셀(#ff0000) = 요청일. 가장 좌측 빨강 찾기 (요청일은 한 셀만)
    let parsedRequestDate = "";
    for (let i = DATE_START - 1; i < rowBackgrounds.length; i++) {
      const bgColor = rowBackgrounds[i];
      if (bgColor === "#ff0000" || bgColor === "red") {
        const headerIdx = i - (DATE_START - 1);
        const dateMatch = headers[headerIdx].match(/(\d+)\/(\d+)/);
        if (dateMatch) {
          parsedRequestDate = dateMatch[1].padStart(2, '0') + "/" + dateMatch[2].padStart(2, '0');
        }
        break;
      }
    }

    const today = Utilities.formatDate(new Date(), "GMT+9", "MM/dd");
    if (!parsedRequestDate) parsedRequestDate = today;
    const tat = calcBusinessDays(parsedRequestDate, today);

    // 신규 시트의 B~J(인덱스 1~9) 데이터와 노트, L열(인덱스 11)의 ID 추출
    const sourceValues = rowValues.slice(1, 10);
    const sourceNotes = rowValues.slice(1, 10).map((_, i) => rowNotes[i + 1]);
    let id = String(rowValues[11] || ""); // L열 = ID (0-based 11)
    if (!id) {
      // ID 없으면 즉시 발급 (onEdit 누락 백업)
      id = Utilities.getUuid();
    }

    // 완료 시트 행 구성 (B~Q, 16열)
    // [B타입 C팀 D담당자 E광고주 F작업자 G온/오프 H작업유형 I수량 J비고 K상태 L:ID M:공유 N:백업 O:요청일 P:공유일 Q:TAT]
    const finalRowData = [
      ...sourceValues,              // B~J (9개)
      "완료",                       // K: 상태
      id,                           // L: ID
      true,                         // M: 공유
      false,                        // N: 백업
      parsedRequestDate,            // O: 요청일
      today,                        // P: 공유일
      tat                           // Q: TAT
    ];
    const finalNotes = [...sourceNotes, "", "", "", "", "", "", ""];

    const insertRow = Math.max(targetSheet.getLastRow(), 9) + 1;
    const targetRange = targetSheet.getRange(insertRow, 2, 1, 16); // B~Q

    targetRange.setValues([finalRowData]);
    targetRange.setNotes([finalNotes]);

    targetRange.setBackground("#ffffff")
               .setFontColor("#000000")
               .setFontSize(9)
               .setHorizontalAlignment("center")
               .setVerticalAlignment("middle")
               .setBorder(true, true, true, true, true, true, "#000000", SpreadsheetApp.BorderStyle.SOLID);

    // 체크박스: M(공유) + N(백업)
    targetSheet.getRange(insertRow, 13, 1, 2).insertCheckboxes();
    targetSheet.getRange(insertRow, 13).setValue(true);   // 공유 = true (이미 set 됐지만 명시)
    targetSheet.getRange(insertRow, 14).setValue(false);  // 백업 = false

    sheet.deleteRow(row);

  } catch (err) {
    console.error("에러: " + err.toString());
  } finally {
    lock.releaseLock();
  }
}

/**
 * TAT 계산: 요청일 ~ 완료일 사이 영업일 수
 * 주말 + 한국 공휴일 + 회사 휴무일 모두 제외
 * 연말 경계 처리: 요청월 > 완료월이면 요청일은 전년도로 간주
 *   예) 12/31 → 01/02 호출 시 시작=작년 12/31, 끝=올해 01/02
 */
function calcBusinessDays(startStr, endStr) {
  const currentYear = new Date().getFullYear();
  const [startM, startD] = startStr.split('/').map(Number);
  const [endM, endD] = endStr.split('/').map(Number);

  const startYear = startM > endM ? currentYear - 1 : currentYear;
  const endYear = currentYear;

  const start = new Date(startYear, startM - 1, startD);
  const end = new Date(endYear, endM - 1, endD);

  return countBusinessDays(start, end);
}

// ============================================================
// 캘린더 일괄 동기화
// (v0.2.4: L열 ID 신설로 날짜 헤더 시작이 M→N으로 시프트)
// ============================================================
function syncToCalendar() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('💛신규·유지보수');
  const calendar = CalendarApp.getCalendarsByName('디자인팀 업무 스케줄러')[0];

  if (!calendar) {
    Logger.log('캘린더를 찾을 수 없습니다.');
    return;
  }

  const DATE_ROW = 9;
  const DATE_START_COL = 14; // N열부터 날짜 (L열 ID 신설로 한 칸 시프트)
  const DATA_START_ROW = 10;
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  const today = new Date();
  const future = new Date();
  future.setMonth(future.getMonth() + 3);
  calendar.getEvents(today, future).forEach(e => e.deleteEvent());

  const dateValues = sheet.getRange(DATE_ROW, DATE_START_COL, 1, lastCol - DATE_START_COL + 1).getValues()[0];
  const allValues = sheet.getRange(DATA_START_ROW, 1, lastRow - DATA_START_ROW + 1, lastCol).getValues();
  const allBackgrounds = sheet.getRange(DATA_START_ROW, DATE_START_COL, lastRow - DATA_START_ROW + 1, lastCol - DATE_START_COL + 1).getBackgrounds();

  for (let i = 0; i < allValues.length; i++) {
    const rowData = allValues[i];
    const advertiser = rowData[4];
    if (!advertiser) continue;

    const note = rowData[9];
    const title = note ? `${advertiser} ${note}` : advertiser;

    const backgrounds = allBackgrounds[i];
    let endColIndex = -1;
    for (let j = 0; j < backgrounds.length; j++) {
      if (isPink(backgrounds[j])) endColIndex = j;
    }
    if (endColIndex === -1) {
      for (let j = 0; j < backgrounds.length; j++) {
        if (isRed(backgrounds[j])) endColIndex = j;
      }
    }

    if (endColIndex === -1) continue;

    const endDate = parseDate(dateValues[endColIndex]);
    if (!endDate) continue;

    calendar.createAllDayEvent(title, endDate);
    Logger.log(`생성: ${title} / ${endDate}`);
  }
}

function isPink(hex) {
  if (!hex || hex === '#ffffff' || hex === '') return false;
  return hex.toLowerCase() === '#ffdcef';
}

function isRed(hex) {
  if (!hex) return false;
  return hex.toLowerCase() === '#ff0000';
}

function parseDate(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const parts = value.replace(/\n.*/, '').split('/');
    if (parts.length === 2) {
      return new Date(new Date().getFullYear(), parseInt(parts[0]) - 1, parseInt(parts[1]));
    }
  }
  return null;
}

// ============================================================
// onEdit 트리거 — ID 자동 발급 (감시견) + 상태 변경 시 캘린더 등록
// (v0.2.4: 신규·완료 시트 모두 감시. 빈 L열 ID 자동 발급)
// ============================================================
function onEditTrigger(e) {
  if (!e) return;

  const sheet = e.range.getSheet();
  const sheetName = sheet.getName();
  const isSchedule = sheetName.includes('신규') && sheetName.includes('유지보수');
  const isCompleted = sheetName === '💚완료';
  if (!isSchedule && !isCompleted) return;

  const row = e.range.getRow();
  if (row < 10) return; // 데이터 영역만 (10행부터)

  // [감시견] 빈 L열 ID 자동 발급 (신규·완료 시트 공통)
  assignIdIfNeeded_(sheet, row);

  // [캘린더 등록] 신규 시트의 상태 변경(K열) 시만
  if (!isSchedule) return;

  const col = e.range.getColumn();
  if (col !== 11) return; // K열 상태
  const newValue = e.value;
  const oldValue = e.oldValue;
  if (oldValue !== '미정' || newValue !== '대기') return;

  const calendar = CalendarApp.getCalendarsByName('디자인팀 업무 스케줄러')[0];
  if (!calendar) return;

  const DATE_START = 14; // N열부터 날짜 (L열 ID 신설로 한 칸 시프트)
  const lastCol = sheet.getLastColumn();
  const backgrounds = sheet.getRange(row, DATE_START, 1, lastCol - DATE_START + 1).getBackgrounds()[0];
  const dateValues = sheet.getRange(9, DATE_START, 1, lastCol - DATE_START + 1).getValues()[0];

  const advertiser = sheet.getRange(row, 5).getValue();
  const manager = sheet.getRange(row, 4).getValue();
  const note = sheet.getRange(row, 10).getValue();
  const title = note ? `${advertiser} ${note} (${manager})` : `${advertiser} (${manager})`;

  let endColIndex = -1;
  for (let i = 0; i < backgrounds.length; i++) {
    if (isPink(backgrounds[i])) endColIndex = i;
  }
  if (endColIndex === -1) {
    for (let i = 0; i < backgrounds.length; i++) {
      if (isRed(backgrounds[i])) endColIndex = i;
    }
  }

  if (endColIndex === -1) return;

  const endDate = parseDate(dateValues[endColIndex]);
  if (!endDate) return;

  if (isDuplicateEvent(calendar, title, endDate)) {
    Logger.log(`중복 건너뜀: ${title} / ${endDate}`);
    return;
  }
  calendar.createAllDayEvent(title, endDate);
  Logger.log(`캘린더 등록: ${title} / ${endDate}`);
}

/**
 * L열(12) ID 빈 셀에 UUID 자동 발급
 * - 광고주(E열) 또는 작업자(F열) 중 하나라도 있어야 데이터 행으로 판단
 * - 이미 ID 있으면 안 건드림
 */
function assignIdIfNeeded_(sheet, row) {
  const ID_COL = 12; // L열
  const ADV_COL = 5; // E열 광고주
  const WORKER_COL = 6; // F열 작업자

  const currentId = sheet.getRange(row, ID_COL).getValue();
  if (currentId) return;

  const adv = String(sheet.getRange(row, ADV_COL).getValue() || '').trim();
  const worker = String(sheet.getRange(row, WORKER_COL).getValue() || '').trim();
  if (!adv && !worker) return;

  sheet.getRange(row, ID_COL).setValue(Utilities.getUuid());
}

function isDuplicateEvent(calendar, title, date) {
  const start = new Date(date);
  const end = new Date(date);
  end.setDate(end.getDate() + 1);
  const events = calendar.getEvents(start, end);
  return events.some(e => e.getTitle() === title);
}

// ============================================================
// 급건 자동 이관 (2026.05 트리거 해제, 함수 보존)
// ============================================================
function handleUrgentTask(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheetName = "💛신규·유지보수";
  const targetSheetName = "💜리스트_급건";

  const range = e.range;
  const sheet = range.getSheet();
  const row = range.getRow();
  const col = range.getColumn();

  if (sheet.getName() !== sourceSheetName) return;
  if (row < 10) return;
  if (col < 2 || col > 10) return;

  const rowData = sheet.getRange(row, 2, 1, 9).getValues()[0];
  if (rowData[0] !== "급건") return;

  const requiredIndices = [0, 1, 2, 3, 4, 5, 6, 8];
  const allFilled = requiredIndices.every(i => rowData[i] !== "" && rowData[i] !== null);
  if (!allFilled) return;

  const targetSheet = ss.getSheetByName(targetSheetName);
  if (!targetSheet) {
    Logger.log("💜리스트_급건 시트를 찾을 수 없습니다.");
    return;
  }

  const DATA_START_ROW = 10;
  const targetLastRow = targetSheet.getLastRow();

  let existingRow = -1;
  if (targetLastRow >= DATA_START_ROW) {
    const targetData = targetSheet.getRange(DATA_START_ROW, 2, targetLastRow - DATA_START_ROW + 1, 9).getValues();
    for (let i = 0; i < targetData.length; i++) {
      if (
        targetData[i][3] === rowData[3] &&
        targetData[i][6] === rowData[6] &&
        targetData[i][8] === rowData[8]
      ) {
        existingRow = DATA_START_ROW + i;
        break;
      }
    }
  }

  if (existingRow !== -1) {
    targetSheet.getRange(existingRow, 2, 1, 9).setValues([rowData]);
    Logger.log(`급건 업데이트: 행 ${existingRow}`);
  } else {
    const insertRow = targetLastRow + 1;
    targetSheet.getRange(insertRow, 2, 1, 9).setValues([rowData]);
    targetSheet.getRange(insertRow, 11).insertCheckboxes().setValue(false);
    Logger.log(`급건 추가: 행 ${insertRow}`);
  }
}

// ============================================================
// 완료 시트 정렬
// ============================================================
function sortCompleteSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('💚완료');
  if (!sheet) return;

  const DATA_START_ROW = 10;
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  if (lastRow < DATA_START_ROW) return;

  const dataRange = sheet.getRange(DATA_START_ROW, 1, lastRow - DATA_START_ROW + 1, lastCol);
  const values = dataRange.getValues();
  const backgrounds = dataRange.getBackgrounds();
  const fontColors = dataRange.getFontColors();
  const notes = dataRange.getNotes();
  const fontSizes = dataRange.getFontSizes();
  const horizontalAlignments = dataRange.getHorizontalAlignments();
  const verticalAlignments = dataRange.getVerticalAlignments();

  const isKorean = (str) => /[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]/.test(str.toString().trim().charAt(0));

  const rows = values.map((v, i) => ({
    values: v,
    backgrounds: backgrounds[i],
    fontColors: fontColors[i],
    notes: notes[i],
    fontSizes: fontSizes[i],
    horizontalAlignments: horizontalAlignments[i],
    verticalAlignments: verticalAlignments[i]
  }));

  rows.sort((a, b) => {
    const toDateNum = (val) => {
      if (val instanceof Date) {
        return val.getMonth() * 100 + val.getDate();
      }
      const str = val.toString().trim();
      if (!str) return 9999;
      const parts = str.split('/');
      if (parts.length === 2) {
        return parseInt(parts[0]) * 100 + parseInt(parts[1]);
      }
      return 9999;
    };
    const dateA = toDateNum(a.values[14]);
    const dateB = toDateNum(b.values[14]);
    if (dateA !== dateB) return dateA - dateB;

    const advA = a.values[4].toString().trim();
    const advB = b.values[4].toString().trim();
    if (advA < advB) return -1;
    if (advA > advB) return 1;

    const noteA = a.values[9].toString().trim();
    const noteB = b.values[9].toString().trim();
    const korA = isKorean(noteA) ? 0 : 1;
    const korB = isKorean(noteB) ? 0 : 1;
    if (korA !== korB) return korA - korB;

    if (noteA < noteB) return -1;
    if (noteA > noteB) return 1;
    return 0;
  });

  dataRange.setValues(rows.map(r => r.values));
  dataRange.setBackgrounds(rows.map(r => r.backgrounds));
  dataRange.setFontColors(rows.map(r => r.fontColors));
  dataRange.setNotes(rows.map(r => r.notes));
  dataRange.setFontSizes(rows.map(r => r.fontSizes));
  dataRange.setHorizontalAlignments(rows.map(r => r.horizontalAlignments));
  dataRange.setVerticalAlignments(rows.map(r => r.verticalAlignments));
}

// ============================================================
// OKR 시트 동기화 — v0.2.4에서 제거됨
// (사유: 실 연결 끊김 + 필수 기능 아님 → 죽은 코드 정리)
// 트리거 등록되어 있다면 GAS 콘솔 > 트리거 메뉴에서 함께 제거
// ============================================================

// ============================================================
// 초기 세팅 확인용 (1회 실행 후 삭제해도 됨)
// ============================================================
function testHolidaySetup() {
  const year = new Date().getFullYear();
  const holidays = getKoreanHolidays(year);
  Logger.log(`${year}년 한국 공휴일 ${holidays.size}개 로드됨`);
  Logger.log([...holidays].sort().join('\n'));
}
