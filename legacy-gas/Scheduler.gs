// ============================================================
// Scheduler.gs — 디자인팀 스케줄러 자동화
//
// 함수 구성:
//   moveRowOnCheck       — onEdit 트리거: 신규 시트의 M열 공유 체크 → 완료 시트로 이관 + TAT 계산
//   onEditTrigger        — onEdit 트리거: L열 ID 자동 발급 + K열 '진행' 진입 시 캘린더 등록
//   syncToCalendar       — 수동/시간 트리거: 시트 ↔ 캘린더 ID 기반 증분 sync
//   sortCompleteSheet    — 수동: 완료 시트 정렬 (마감일 → 광고주 → 비고)
//   (영업일/TAT/색상 판별 유틸은 위 함수들에서 호출)
//
// 모든 진입 함수는 [함수명] prefix 진단 로그 + try/catch로 가시성 확보.
// 자주 호출되는 onEditTrigger·moveRowOnCheck는 데이터 영역 진입 시에만 로그.
// ============================================================

// ── 상수 ────────────────────────────────────────────────────
const HOLIDAY_CAL_ID = 'ko.south_korea#holiday@group.v.calendar.google.com';
const COMPANY_HOLIDAY_SHEET = '회사휴무일'; // A열에 날짜만 입력하면 됨

// 캘린더 동기화 — 시트 행 ↔ 이벤트 매핑용 hidden tag 키
const SYNC_TAG_KEY = 'rowId';
const SCHEDULE_CALENDAR_NAME = '디자인팀 업무 스케줄러';

// 로그 prefix 유틸 — 모든 Logger.log를 이걸 통하면 [함수명] 형식으로 일관
function log_(fn, msg) {
  Logger.log(`[${fn}] ${msg}`);
}

// 캘린더 이벤트 제목 포맷 — 원칙: '광고주 비고 (요청자)'
// 두 호출 경로(syncToCalendar, onEditTrigger)에서 동일 형식 보장.
// note/manager 비어있어도 '(undefined)' 같은 흉한 표시 없이 안전 fallback.
function formatEventTitle_(advertiser, note, manager) {
  const adv = String(advertiser || '').trim();
  const n = String(note || '').trim();
  const m = String(manager || '').trim();
  const base = n ? `${adv} ${n}` : adv;
  return m ? `${base} (${m})` : base;
}

// ============================================================
// 영업일 계산 (한국 공휴일 + 회사 휴무일 자동 반영)
// ============================================================

/** 한국 공식 공휴일 (Google Calendar 기반, 6시간 캐시) */
function getKoreanHolidays(year) {
  const cache = CacheService.getScriptCache();
  const cacheKey = `kr_holidays_${year}`;
  const cached = cache.get(cacheKey);
  if (cached) return new Set(JSON.parse(cached));

  let cal = CalendarApp.getCalendarById(HOLIDAY_CAL_ID);
  if (!cal) {
    try {
      cal = CalendarApp.subscribeToCalendar(HOLIDAY_CAL_ID);
      log_('getKoreanHolidays', '공휴일 캘린더 신규 구독 완료');
    } catch (err) {
      log_('getKoreanHolidays', `공휴일 캘린더 구독 실패: ${err}`);
    }
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
  log_('getKoreanHolidays', `${year}년 공휴일 ${dates.length}개 fetch 후 cache (6시간)`);
  return new Set(dates);
}

/** 회사 자체 휴무일 ('회사휴무일' 시트 A2:A에서 읽음, 1시간 캐시) */
function getCompanyHolidays(year) {
  const cache = CacheService.getScriptCache();
  const cacheKey = `company_holidays_${year}`;
  const cached = cache.get(cacheKey);
  if (cached) return new Set(JSON.parse(cached));

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(COMPANY_HOLIDAY_SHEET);
  if (!sheet || sheet.getLastRow() < 2) {
    cache.put(cacheKey, JSON.stringify([]), 3600);
    log_('getCompanyHolidays', `'${COMPANY_HOLIDAY_SHEET}' 시트 없음 또는 비어있음 — 빈 결과 cache`);
    return new Set();
  }

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  const dates = values
    .map(row => row[0])
    .filter(v => v instanceof Date && v.getFullYear() === year)
    .map(d => Utilities.formatDate(d, 'Asia/Seoul', 'yyyy-MM-dd'));

  cache.put(cacheKey, JSON.stringify(dates), 3600); // 1시간
  log_('getCompanyHolidays', `${year}년 회사 휴무일 ${dates.length}개 fetch 후 cache (1시간)`);
  return new Set(dates);
}

/** 영업일 여부 (주말 + 한국 공휴일 + 회사 휴무일 모두 제외) */
function isBusinessDay(date) {
  const day = date.getDay();
  if (day === 0 || day === 6) return false;

  const dateStr = Utilities.formatDate(date, 'Asia/Seoul', 'yyyy-MM-dd');
  const year = date.getFullYear();
  if (getKoreanHolidays(year).has(dateStr)) return false;
  if (getCompanyHolidays(year).has(dateStr)) return false;
  return true;
}

/** 두 날짜 사이 영업일 수 (start 제외, end 포함) */
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

/**
 * TAT 계산: 요청일 ~ 완료일 사이 영업일 수
 * 연말 경계 처리: 요청월 > 완료월이면 요청일은 전년도로
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
// moveRowOnCheck — 신규·유지보수 시트의 M열 공유 체크박스 → 완료 시트로 이관
// (v0.2.4: L열 ID 신설로 공유 체크박스가 M열로 시프트. ID도 같이 이관)
// 신규 시트: B타입 C팀 D담당자 E광고주 F작업자 G온/오프 H작업유형 I수량 J비고 K상태 L:ID M:공유 N~날짜
// 완료 시트: B타입 ... J비고 K상태 L:ID M:공유 N:백업 O:요청일 P:공유일 Q:TAT
//
// onEdit installable trigger에서 호출. 모든 셀 편집마다 발사되므로
// 관련 없는 셀은 silent skip. 진입 확정 시점부터 로그.
// ============================================================
function moveRowOnCheck(e) {
  if (!e) return;

  try {
    const range = e.range;
    const col = range.getColumn();
    const value = e.value;
    const TARGET_COL = 13; // M열 (공유 체크박스)

    if (col !== TARGET_COL || value !== 'TRUE') return;

    const sheet = range.getSheet();
    const sheetName = sheet.getName();
    if (!sheetName.includes('신규') || !sheetName.includes('유지보수')) return;

    const row = range.getRow();
    log_('moveRowOnCheck', `시작 — 시트 '${sheetName}' 행 ${row} 공유 체크됨`);

    const lock = LockService.getScriptLock();
    try {
      const locked = lock.tryLock(5000);
      if (!locked) {
        log_('moveRowOnCheck', `lock 획득 실패 — 다른 처리 진행 중. 행 ${row} skip`);
        return;
      }

      const ss = e.source;
      const targetSheet = ss.getSheetByName('💚완료');
      if (!targetSheet) {
        log_('moveRowOnCheck', `'💚완료' 시트 없음 — 중단`);
        return;
      }

      const lastCol = sheet.getLastColumn();
      const rowRange = sheet.getRange(row, 1, 1, lastCol);
      const rowValues = rowRange.getValues()[0];
      const rowNotes = rowRange.getNotes()[0];
      const rowBackgrounds = rowRange.getBackgrounds()[0];

      // 날짜 헤더는 N열(14)부터
      const DATE_START = 14;
      const headerRange = sheet.getRange(9, DATE_START, 1, lastCol - DATE_START + 1);
      const headers = headerRange.getDisplayValues()[0];

      // 빨강 셀(#ff0000) = 요청일. 가장 좌측 빨강 찾기
      let parsedRequestDate = '';
      for (let i = DATE_START - 1; i < rowBackgrounds.length; i++) {
        const bgColor = rowBackgrounds[i];
        if (bgColor === '#ff0000' || bgColor === 'red') {
          const headerIdx = i - (DATE_START - 1);
          const dateMatch = headers[headerIdx].match(/(\d+)\/(\d+)/);
          if (dateMatch) {
            parsedRequestDate = dateMatch[1].padStart(2, '0') + '/' + dateMatch[2].padStart(2, '0');
          }
          break;
        }
      }

      const today = Utilities.formatDate(new Date(), 'GMT+9', 'MM/dd');
      const requestDateFallback = !parsedRequestDate;
      if (requestDateFallback) parsedRequestDate = today;
      const tat = calcBusinessDays(parsedRequestDate, today);

      log_(
        'moveRowOnCheck',
        `요청일=${parsedRequestDate}${requestDateFallback ? '(fallback)' : ''}, 완료일=${today}, TAT=${tat}일`
      );

      const advertiser = String(rowValues[4] || '').trim(); // E열
      const note = String(rowValues[9] || '').trim();        // J열

      // 신규 시트 B~J(인덱스 1~9) + L열 ID(인덱스 11)
      const sourceValues = rowValues.slice(1, 10);
      const sourceNotes = rowValues.slice(1, 10).map((_, i) => rowNotes[i + 1]);
      let id = String(rowValues[11] || '').trim();
      const idIssued = !id;
      if (idIssued) {
        id = Utilities.getUuid();
      }
      log_(
        'moveRowOnCheck',
        `식별 — 광고주='${advertiser}', 비고='${note}', ID=${id}${idIssued ? ' (신규 발급)' : ' (시트에서 가져옴)'}`
      );

      // 완료 시트 행 구성 (B~Q, 16열)
      const finalRowData = [
        ...sourceValues,              // B~J
        '완료',                       // K
        id,                           // L
        true,                         // M 공유
        false,                        // N 백업
        parsedRequestDate,            // O 요청일
        today,                        // P 공유일
        tat                           // Q TAT
      ];
      const finalNotes = [...sourceNotes, '', '', '', '', '', '', ''];

      const insertRow = Math.max(targetSheet.getLastRow(), 9) + 1;
      const targetRange = targetSheet.getRange(insertRow, 2, 1, 16);

      targetRange.setValues([finalRowData]);
      targetRange.setNotes([finalNotes]);
      targetRange.setBackground('#ffffff')
                 .setFontColor('#000000')
                 .setFontSize(9)
                 .setHorizontalAlignment('center')
                 .setVerticalAlignment('middle')
                 .setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);

      // 체크박스: M(공유) + N(백업)
      targetSheet.getRange(insertRow, 13, 1, 2).insertCheckboxes();
      targetSheet.getRange(insertRow, 13).setValue(true);
      targetSheet.getRange(insertRow, 14).setValue(false);

      sheet.deleteRow(row);

      log_(
        'moveRowOnCheck',
        `완료 — '💚완료' ${insertRow}행에 삽입, '${sheetName}' ${row}행 삭제`
      );
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    log_('moveRowOnCheck', `에러: ${err}\n${err.stack || ''}`);
  }
}

// ============================================================
// syncToCalendar — v0.2.4 ID 기반 증분 sync
// - 시트 L열 UUID를 캘린더 이벤트 hidden tag(rowId)에 박아 매핑
// - 변경분만 처리 → quota burst 회피
// - tag 없는 이벤트는 안 건드림 (개인 일정 등 보호)
// - 각 액션(create/update/delete) 행별로 로그
// ============================================================
function syncToCalendar() {
  log_('syncToCalendar', '시작');
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('💛신규·유지보수');
    if (!sheet) {
      log_('syncToCalendar', `'💛신규·유지보수' 시트 없음 — 중단`);
      return;
    }
    const calendar = CalendarApp.getCalendarsByName(SCHEDULE_CALENDAR_NAME)[0];
    if (!calendar) {
      log_('syncToCalendar', `캘린더 '${SCHEDULE_CALENDAR_NAME}' 없음 — 중단`);
      return;
    }

    const DATE_ROW = 9;
    const DATE_START_COL = 14; // N열부터 날짜
    const DATA_START_ROW = 10;
    const ID_COL = 12;       // L
    const ADV_COL = 5;       // E
    const NOTE_COL = 10;     // J
    const MANAGER_COL = 4;   // D — 담당자(요청자)
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();

    if (lastRow < DATA_START_ROW) {
      log_('syncToCalendar', '데이터 행 없음 — 종료');
      return;
    }

    // 1. 시트 활성 행 수집
    const dateValues = sheet.getRange(DATE_ROW, DATE_START_COL, 1, lastCol - DATE_START_COL + 1).getValues()[0];
    const allValues = sheet.getRange(DATA_START_ROW, 1, lastRow - DATA_START_ROW + 1, lastCol).getValues();
    const allBackgrounds = sheet.getRange(DATA_START_ROW, DATE_START_COL, lastRow - DATA_START_ROW + 1, lastCol - DATE_START_COL + 1).getBackgrounds();

    const sheetRows = [];
    let skipNoId = 0, skipNoAdv = 0, skipNoDate = 0;
    for (let i = 0; i < allValues.length; i++) {
      const rowData = allValues[i];
      const id = String(rowData[ID_COL - 1] || '').trim();
      const advertiser = rowData[ADV_COL - 1];
      if (!id) { skipNoId++; continue; }
      if (!advertiser) { skipNoAdv++; continue; }

      const note = rowData[NOTE_COL - 1];
      const manager = rowData[MANAGER_COL - 1];
      const title = formatEventTitle_(advertiser, note, manager);

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
      if (endColIndex === -1) { skipNoDate++; continue; }

      const endDate = parseDate(dateValues[endColIndex]);
      if (!endDate) { skipNoDate++; continue; }

      sheetRows.push({ id: id, title: title, endDate: endDate });
    }
    log_(
      'syncToCalendar',
      `시트 수집 — 활성 ${sheetRows.length}건 / skip: ID없음 ${skipNoId}, 광고주없음 ${skipNoAdv}, 마감일없음 ${skipNoDate}`
    );

    // 2. 캘린더 향후 3개월 이벤트 → tag 매핑
    const today = new Date();
    const future = new Date();
    future.setMonth(future.getMonth() + 3);
    const calEvents = calendar.getEvents(today, future);
    const calById = new Map();
    let untaggedCount = 0;
    for (let i = 0; i < calEvents.length; i++) {
      const tagId = calEvents[i].getTag(SYNC_TAG_KEY);
      if (tagId) calById.set(tagId, calEvents[i]);
      else untaggedCount++;
    }
    log_(
      'syncToCalendar',
      `캘린더 수집 — 향후 3개월 ${calEvents.length}건 (tagged ${calById.size}, untagged 무시 ${untaggedCount})`
    );

    // 3. 비교 → 변경분만 액션
    const fmtDate = (d) => Utilities.formatDate(d, 'Asia/Seoul', 'yyyy-MM-dd');
    let created = 0, updated = 0, unchanged = 0;
    for (let i = 0; i < sheetRows.length; i++) {
      const row = sheetRows[i];
      const existing = calById.get(row.id);
      if (!existing) {
        const ev = calendar.createAllDayEvent(row.title, row.endDate);
        ev.setTag(SYNC_TAG_KEY, row.id);
        created++;
        log_('syncToCalendar', `create: ${row.title} / ${fmtDate(row.endDate)}`);
      } else {
        const titleChanged = existing.getTitle() !== row.title;
        const dateChanged = fmtDate(existing.getStartTime()) !== fmtDate(row.endDate);
        if (titleChanged || dateChanged) {
          const oldTitle = existing.getTitle();
          const oldDate = fmtDate(existing.getStartTime());
          if (titleChanged) existing.setTitle(row.title);
          if (dateChanged) existing.setAllDayDate(row.endDate);
          updated++;
          log_(
            'syncToCalendar',
            `update: ${oldTitle} / ${oldDate} → ${row.title} / ${fmtDate(row.endDate)}`
          );
        } else {
          unchanged++;
        }
        calById.delete(row.id);
      }
    }

    // 4. 시트에서 사라진 ID의 이벤트 → 삭제 (tag 있는 것만)
    let deleted = 0;
    for (const [id, ev] of calById) {
      const title = ev.getTitle();
      const date = fmtDate(ev.getStartTime());
      ev.deleteEvent();
      deleted++;
      log_('syncToCalendar', `delete: ${title} / ${date} (시트에서 사라진 ID ${id})`);
    }

    log_(
      'syncToCalendar',
      `완료 요약 — create ${created} / update ${updated} / delete ${deleted} / unchanged ${unchanged}`
    );
  } catch (err) {
    log_('syncToCalendar', `에러: ${err}\n${err.stack || ''}`);
  }
}

// ── 색상·날짜 유틸 ──────────────────────────────────────────
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
// onEditTrigger — installable onEdit 트리거 (수동 등록 필요)
// 역할:
//   1. 빈 L열 ID 자동 발급 (신규·완료 시트 공통, 감시견)
//   2. 신규 시트의 K열 상태가 '진행'으로 바뀐 순간 캘린더에 단건 등록
//      (어떤 이전 상태에서든 — 예정→진행, 대기→진행 둘 다)
//      v0.2.8 변경: 옛 '미정→대기' 트리거를 '진행 진입' 트리거로 교체.
//      디자이너 운영상 '진행' 시점이 캘박 의도와 일치.
//
// 중복 체크는 시트 L열 UUID(rowId)를 캘린더 이벤트 tag로 매핑해서 판정.
// 같은 rowId tag 가진 이벤트가 향후 3개월에 있으면 skip (제목·날짜 변경에도 안전).
//
// 모든 셀 편집마다 발사되므로 관련 없는 입력은 silent skip.
// 데이터 영역 + 관련 시트에 진입한 시점부터 로그 시작.
// ============================================================
function onEditTrigger(e) {
  if (!e) return;

  try {
    const sheet = e.range.getSheet();
    const sheetName = sheet.getName();
    const isSchedule = sheetName.includes('신규') && sheetName.includes('유지보수');
    const isCompleted = sheetName === '💚완료';
    if (!isSchedule && !isCompleted) return;

    const row = e.range.getRow();
    if (row < 10) return;

    const col = e.range.getColumn();
    log_(
      'onEditTrigger',
      `진입 — sheet='${sheetName}', row=${row}, col=${col}, value='${e.value}', old='${e.oldValue}'`
    );

    // [감시견] 빈 L열 ID 자동 발급
    const issuedId = assignIdIfNeeded_(sheet, row);
    if (issuedId) {
      log_('onEditTrigger', `ID 자동 발급 — row=${row}, uuid=${issuedId}`);
    }

    // [캘린더 등록] 신규 시트의 K열이 '진행'으로 진입할 때 (어떤 경로든)
    if (!isSchedule) return;
    if (col !== 11) return;
    if (e.value !== '진행' || e.oldValue === '진행') {
      log_('onEditTrigger', `K열 변경이지만 '진행' 진입 아님 (old='${e.oldValue}', new='${e.value}') — 캘린더 등록 skip`);
      return;
    }

    log_('onEditTrigger', `'진행' 진입 감지 (이전: '${e.oldValue}') — 캘린더 등록 시도`);

    const calendar = CalendarApp.getCalendarsByName(SCHEDULE_CALENDAR_NAME)[0];
    if (!calendar) {
      log_('onEditTrigger', `캘린더 '${SCHEDULE_CALENDAR_NAME}' 없음 — 등록 중단`);
      return;
    }

    const DATE_START = 14;
    const lastCol = sheet.getLastColumn();
    const backgrounds = sheet.getRange(row, DATE_START, 1, lastCol - DATE_START + 1).getBackgrounds()[0];
    const dateValues = sheet.getRange(9, DATE_START, 1, lastCol - DATE_START + 1).getValues()[0];

    const advertiser = sheet.getRange(row, 5).getValue();
    const manager = sheet.getRange(row, 4).getValue();
    const note = sheet.getRange(row, 10).getValue();
    const title = formatEventTitle_(advertiser, note, manager);

    let endColIndex = -1;
    for (let i = 0; i < backgrounds.length; i++) {
      if (isPink(backgrounds[i])) endColIndex = i;
    }
    if (endColIndex === -1) {
      for (let i = 0; i < backgrounds.length; i++) {
        if (isRed(backgrounds[i])) endColIndex = i;
      }
    }
    if (endColIndex === -1) {
      log_('onEditTrigger', `마감일 셀(pink/red) 못 찾음 — 등록 skip ('${title}')`);
      return;
    }

    const endDate = parseDate(dateValues[endColIndex]);
    if (!endDate) {
      log_('onEditTrigger', `마감일 파싱 실패 — 등록 skip ('${title}')`);
      return;
    }

    // rowId(시트 L열 UUID)를 미리 추출 — 중복 체크와 tag 부착 모두에 사용
    const rowId = String(sheet.getRange(row, 12).getValue() || '').trim();

    if (isDuplicateEvent(calendar, rowId, title, endDate)) {
      log_('onEditTrigger', `중복 이벤트 존재 — 등록 skip ('${title}' / ${Utilities.formatDate(endDate, 'Asia/Seoul', 'yyyy-MM-dd')}, rowId=${rowId || '없음'})`);
      return;
    }

    const ev = calendar.createAllDayEvent(title, endDate);
    if (rowId) ev.setTag(SYNC_TAG_KEY, rowId);
    log_(
      'onEditTrigger',
      `캘린더 등록 완료 — '${title}' / ${Utilities.formatDate(endDate, 'Asia/Seoul', 'yyyy-MM-dd')}${rowId ? ` (rowId=${rowId})` : ' (rowId 없음 — tag 미부착)'}`
    );
  } catch (err) {
    log_('onEditTrigger', `에러: ${err}\n${err.stack || ''}`);
  }
}

/**
 * L열(12) ID 빈 셀에 UUID 자동 발급
 * - 광고주(E) 또는 작업자(F) 중 하나라도 있어야 데이터 행으로 판단
 * - 발급한 UUID 반환 / 이미 ID 있거나 빈 행이면 null
 */
function assignIdIfNeeded_(sheet, row) {
  const ID_COL = 12;     // L
  const ADV_COL = 5;     // E
  const WORKER_COL = 6;  // F

  const currentId = sheet.getRange(row, ID_COL).getValue();
  if (currentId) return null;

  const adv = String(sheet.getRange(row, ADV_COL).getValue() || '').trim();
  const worker = String(sheet.getRange(row, WORKER_COL).getValue() || '').trim();
  if (!adv && !worker) return null;

  const uuid = Utilities.getUuid();
  sheet.getRange(row, ID_COL).setValue(uuid);
  return uuid;
}

// 중복 체크 — rowId tag 우선, 없으면 제목+날짜로 fallback (v0.2.8 강화)
//
// rowId가 있으면 향후 3개월에서 같은 tag 가진 이벤트 검사 →
//   제목·날짜가 바뀌어도 중복 인식. syncToCalendar와 매핑 일관성 보장.
// rowId가 없으면 옛 방식(같은 날짜의 같은 제목)으로 fallback.
function isDuplicateEvent(calendar, rowId, title, date) {
  if (rowId) {
    const today = new Date();
    const future = new Date();
    future.setMonth(future.getMonth() + 3);
    const events = calendar.getEvents(today, future);
    return events.some(e => e.getTag(SYNC_TAG_KEY) === rowId);
  }
  // fallback — tag 없는 이벤트 호환
  const start = new Date(date);
  const end = new Date(date);
  end.setDate(end.getDate() + 1);
  const events = calendar.getEvents(start, end);
  return events.some(e => e.getTitle() === title);
}

// ============================================================
// sortCompleteSheet — 완료 시트 정렬 (수동 실행)
// 정렬 키: 마감일(O열 인덱스 14) → 광고주(E열 인덱스 4) → 비고(J열 인덱스 9, 한글 우선)
// 셀 스타일·노트·정렬·폰트 크기 등 모두 보존
// ============================================================
function sortCompleteSheet() {
  log_('sortCompleteSheet', '시작');
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('💚완료');
    if (!sheet) {
      log_('sortCompleteSheet', `'💚완료' 시트 없음 — 중단`);
      return;
    }

    const DATA_START_ROW = 10;
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();

    if (lastRow < DATA_START_ROW) {
      log_('sortCompleteSheet', `데이터 행 없음 (lastRow=${lastRow}) — 종료`);
      return;
    }

    const rowCount = lastRow - DATA_START_ROW + 1;
    const dataRange = sheet.getRange(DATA_START_ROW, 1, rowCount, lastCol);
    const values = dataRange.getValues();
    const backgrounds = dataRange.getBackgrounds();
    const fontColors = dataRange.getFontColors();
    const notes = dataRange.getNotes();
    const fontSizes = dataRange.getFontSizes();
    const horizontalAlignments = dataRange.getHorizontalAlignments();
    const verticalAlignments = dataRange.getVerticalAlignments();

    const isKorean = (str) => /[가-힣ᄀ-ᇿ㄰-㆏]/.test(str.toString().trim().charAt(0));

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
        if (val instanceof Date) return val.getMonth() * 100 + val.getDate();
        const str = val.toString().trim();
        if (!str) return 9999;
        const parts = str.split('/');
        if (parts.length === 2) return parseInt(parts[0]) * 100 + parseInt(parts[1]);
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

    log_('sortCompleteSheet', `완료 — ${rowCount}행 정렬 (마감일 → 광고주 → 비고[한글 우선])`);
  } catch (err) {
    log_('sortCompleteSheet', `에러: ${err}\n${err.stack || ''}`);
  }
}
