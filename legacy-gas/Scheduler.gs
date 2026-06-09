// ============================================================
// Scheduler.gs — 디자인팀 스케줄러 자동화
//
// 함수 구성:
//   moveRowOnCheck            — onEdit 트리거: 신규 시트 M열 공유 체크 → 완료 시트 이관 + TAT 계산
//   onEditTrigger             — onEdit 트리거: L열 ID 자동 발급 + K열 '진행' 진입 시 캘박 단건 등록
//   syncToCalendar            — 시간 트리거: 시트 '진행' 행 ↔ 캘박 update 전용 sync (v0.2.9 재설계)
//   backfillCalendarDryRun    — 수동(콘솔 ▶): 캘박 없는 '진행' 작업 리스트 미리보기 (변경 없음)
//   backfillCalendarApply     — 수동(콘솔 ▶): dry-run 후 일괄 캘박 생성 (1회용)
//   enableSyncTrigger         — 수동(콘솔 ▶): syncToCalendar 시간 trigger 등록 (1시간 주기)
//   sortCompleteSheet         — 수동: 완료 시트 정렬 (마감일 → 광고주 → 비고)
//   (영업일/TAT/색상 판별 유틸은 위 함수들에서 호출)
//
// 모든 진입 함수는 [함수명] prefix 진단 로그 + try/catch로 가시성 확보.
// 자주 호출되는 onEditTrigger·moveRowOnCheck는 데이터 영역 진입 시에만 로그.
//
// 캘박 동기화는 v0.2.9에서 안전 재설계. 상세 원칙은 syncToCalendar 섹션 헤더 주석 참조.
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

    let row = range.getRow();
    log_('moveRowOnCheck', `시작 — 시트 '${sheetName}' 행 ${row} 공유 체크 이벤트 수신`);

    const lock = LockService.getScriptLock();
    try {
      const locked = lock.tryLock(5000);
      if (!locked) {
        log_('moveRowOnCheck', `lock 획득 실패 — 다른 처리 진행 중. 행 ${row} skip`);
        return;
      }

      // [race 방어 v0.2.8] lock 대기 중 인접 행 deleteRow로 시트가 시프트되면
      // e.range.getRow()는 다른 행을 가리킬 수 있음. lock 획득 후 그 행의 M열이
      // 진짜 TRUE인지 재확인. FALSE면 시트에서 M열 TRUE 행을 다시 찾는다.
      const checkedNow = sheet.getRange(row, TARGET_COL).getValue();
      if (checkedNow !== true) {
        log_(
          'moveRowOnCheck',
          `시프트 감지 — lock 획득 후 row ${row}의 M열 = ${checkedNow} (TRUE 아님). 시트에서 진짜 TRUE 행 재탐색`
        );
        const trueRow = findFirstSharedRow_(sheet, TARGET_COL);
        if (!trueRow) {
          log_('moveRowOnCheck', `시트에 M열 TRUE 행 없음 — 다른 처리에서 이미 처리됨. skip`);
          return;
        }
        log_('moveRowOnCheck', `재탐색 완료 — 처리 대상 row ${row} → ${trueRow}`);
        row = trueRow;
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

      // 빨강 셀(#ff0000) = 요청일. 가장 우측 빨강 사용 (안전장치).
      // 행 복사/붙여넣기 실수로 빨강 셀이 한 행에 여러 개 생기는 경우 대비.
      // 사용자 운영 룰: 더 오른쪽 = 더 최근 = 진짜 의도. 좌측은 잔존으로 간주.
      // 여러 개 감지 시 진단 로그로 사용자 인지 가능.
      let parsedRequestDate = '';
      let lastRedIndex = -1;
      let redCount = 0;
      for (let i = DATE_START - 1; i < rowBackgrounds.length; i++) {
        const bgColor = rowBackgrounds[i];
        if (bgColor === '#ff0000' || bgColor === 'red') {
          lastRedIndex = i;
          redCount++;
        }
      }
      if (redCount > 1) {
        log_(
          'moveRowOnCheck',
          `⚠ 빨강 셀 ${redCount}개 발견 (행 복사 잔존 의심) — 가장 우측 셀 사용. 시트에서 정정 권장`
        );
      }
      if (lastRedIndex !== -1) {
        const headerIdx = lastRedIndex - (DATE_START - 1);
        const dateMatch = headers[headerIdx].match(/(\d+)\/(\d+)/);
        if (dateMatch) {
          parsedRequestDate = dateMatch[1].padStart(2, '0') + '/' + dateMatch[2].padStart(2, '0');
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

/**
 * 시트 데이터 영역(10행~)에서 지정 컬럼이 TRUE인 첫 번째 행 번호 반환.
 * moveRowOnCheck의 race 방어용 — 시트 시프트로 e.range가 어긋났을 때
 * 진짜 처리할 M열 TRUE 행을 다시 찾기 위해 사용.
 * 없으면 null. (다른 처리에서 이미 이관됐다는 신호)
 */
function findFirstSharedRow_(sheet, col) {
  const DATA_START = 10;
  const lastRow = sheet.getLastRow();
  if (lastRow < DATA_START) return null;
  const values = sheet.getRange(DATA_START, col, lastRow - DATA_START + 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (values[i][0] === true) return DATA_START + i;
  }
  return null;
}

// ============================================================
// 캘린더 동기화 — v0.2.9 안전 재설계
//
// 사고 배경 (2026-06): 옛 syncToCalendar(증분 sync)가 setTag/getTag 매칭 실패 시
// 무한 신규 create로 폭주 (같은 이름·같은 날짜 1000건+ 누적). 캘박 4500건 wipe 후 재설계.
//
// 새 원칙:
//   [create] onEditTrigger 단독. K열이 '진행'으로 진입한 그 순간 단건만.
//   [update] syncToCalendar 시간 trigger. 시트 '진행' 행 ↔ 캘박 비교, 날짜만 이동.
//            create 절대 안 함. delete 절대 안 함.
//   [delete] 자동화 0. 사람이 캘린더 앱에서 직접만.
//   [backfill] 1회용 backfillCalendarDryRun / backfillCalendarApply.
//              wipe 등으로 캘박이 비었을 때만 사용.
//
// 매칭: 라벨(rowId) 우선 → 이름 fallback. 어느 쪽도 매칭 안 되면 syncToCalendar는 무시(=create 없음).
// 폭주 가드:
//   syncToCalendar 한 회 update 50건 초과 시 즉시 abort + 시간 trigger 자동 정지.
//   backfillCalendarApply 한 회 100건 초과 시 즉시 abort (수동 점검 요구).
//
// 사용자 정책 (운영):
//   - AE(타 부서)가 보는 공유 캘린더. 같은 이름 폭주 = 신뢰 즉사. 재발 0이 목표.
//   - 시트 비고/광고주 변경 시 캘박 제목 안 따라감 (이름 매칭이 깨질 일 거의 없음).
//   - 시트에서 행 사라져도(완료/이관/삭제) 캘박 그대로 둠. 마감일 지나면 자연 소멸.
// ============================================================

const CAL_UPDATE_GUARD_MAX = 50;
const CAL_BACKFILL_GUARD_MAX = 100;
const CAL_LOOKBACK_DAYS = 90;
const CAL_LOOKAHEAD_DAYS = 180;

// ── 캘린더 동기화 공통 헬퍼 ──────────────────────────────────

/**
 * 시트의 '진행' 상태 행만 수집.
 * 반환: [{ id, title, endDate, sheetRow }]
 * - id: 시트 L열 UUID (빈 값일 수도 있음)
 * - title: '광고주 비고 (요청자)' 포맷
 * - endDate: 마감일 (Date, 핑크 우선 → 빨강 fallback)
 * - sheetRow: 시트 행 번호 (로그용)
 */
function collectActiveProgressRows_(sheet) {
  const DATE_ROW = 9;
  const DATE_START_COL = 14; // N열
  const DATA_START_ROW = 10;
  const ID_COL = 12;       // L
  const ADV_COL = 5;       // E
  const NOTE_COL = 10;     // J
  const STATUS_COL = 11;   // K
  const MANAGER_COL = 4;   // D — 담당자(요청자)

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < DATA_START_ROW) return [];

  const dateValues = sheet.getRange(DATE_ROW, DATE_START_COL, 1, lastCol - DATE_START_COL + 1).getValues()[0];
  const allValues = sheet.getRange(DATA_START_ROW, 1, lastRow - DATA_START_ROW + 1, lastCol).getValues();
  const allBackgrounds = sheet.getRange(DATA_START_ROW, DATE_START_COL, lastRow - DATA_START_ROW + 1, lastCol - DATE_START_COL + 1).getBackgrounds();

  const rows = [];
  for (let i = 0; i < allValues.length; i++) {
    const r = allValues[i];
    const status = String(r[STATUS_COL - 1] || '').trim();
    if (status !== '진행') continue;

    const advertiser = r[ADV_COL - 1];
    if (!advertiser) continue;

    const id = String(r[ID_COL - 1] || '').trim();
    const note = r[NOTE_COL - 1];
    const manager = r[MANAGER_COL - 1];
    const title = formatEventTitle_(advertiser, note, manager);

    const bgs = allBackgrounds[i];
    let endIdx = -1;
    for (let j = 0; j < bgs.length; j++) {
      if (isPink(bgs[j])) endIdx = j;
    }
    if (endIdx === -1) {
      for (let j = 0; j < bgs.length; j++) {
        if (isRed(bgs[j])) endIdx = j;
      }
    }
    if (endIdx === -1) continue;

    const endDate = parseDate(dateValues[endIdx]);
    if (!endDate) continue;

    rows.push({ id: id, title: title, endDate: endDate, sheetRow: DATA_START_ROW + i });
  }
  return rows;
}

/**
 * 캘박 매칭용 인덱스 구축.
 * 조회 범위: 오늘 -90일 ~ +180일 (마감일 옮길 때 과거 캘박도 찾을 수 있게 넉넉히)
 * 반환: { events, byTag(rowId→event), byTitle(title→event[]), untagged, range }
 */
function buildCalendarIndex_(calendar) {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - CAL_LOOKBACK_DAYS);
  const end = new Date(now);
  end.setDate(end.getDate() + CAL_LOOKAHEAD_DAYS);

  const events = calendar.getEvents(start, end);
  const byTag = new Map();
  const byTitle = new Map();
  let untagged = 0;

  for (const ev of events) {
    const tag = ev.getTag(SYNC_TAG_KEY);
    if (tag) byTag.set(tag, ev);
    else untagged++;

    const t = ev.getTitle();
    if (!byTitle.has(t)) byTitle.set(t, []);
    byTitle.get(t).push(ev);
  }

  return { events: events, byTag: byTag, byTitle: byTitle, untagged: untagged, range: { start: start, end: end } };
}

/**
 * 시트 행에 대응하는 캘박 찾기.
 * 1) 라벨(rowId) 매칭 — 가장 신뢰
 * 2) 이름 매칭 — 라벨 깨졌거나 옛 캘박 대응
 * 둘 다 못 찾으면 null (syncToCalendar는 create 안 함, 정책)
 */
function matchEventForRow_(index, rowId, title) {
  if (rowId && index.byTag.has(rowId)) {
    return index.byTag.get(rowId);
  }
  const events = index.byTitle.get(title);
  if (events && events.length > 0) {
    return events[0]; // 동명 여러 개면 첫 거 update
  }
  return null;
}

// ── 시간 trigger 관리 (비개발자가 GAS 콘솔에서 ▶로 직접 호출) ──

/** 시간 trigger 등록 — 1시간마다 syncToCalendar 실행. 이미 있으면 중복 생성 안 함. */
function enableSyncTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  for (const t of triggers) {
    if (t.getHandlerFunction() === 'syncToCalendar' && t.getEventType() === ScriptApp.EventType.CLOCK) {
      log_('enableSyncTrigger', `기존 시간 trigger 있음 — 추가 등록 안 함`);
      return;
    }
  }
  ScriptApp.newTrigger('syncToCalendar').timeBased().everyHours(1).create();
  log_('enableSyncTrigger', `시간 trigger 등록 완료 — 1시간마다 syncToCalendar 실행`);
}

/** 폭주 가드 발동 시 자동 호출. 시간 trigger 전부 제거. */
function disableSyncTrigger_() {
  const triggers = ScriptApp.getProjectTriggers();
  let removed = 0;
  for (const t of triggers) {
    if (t.getHandlerFunction() === 'syncToCalendar' && t.getEventType() === ScriptApp.EventType.CLOCK) {
      try {
        ScriptApp.deleteTrigger(t);
        removed++;
      } catch (err) {
        log_('disableSyncTrigger_', `trigger 삭제 실패: ${err}`);
      }
    }
  }
  log_('disableSyncTrigger_', `시간 trigger ${removed}개 제거`);
}

// ============================================================
// syncToCalendar — 시간 trigger용 update 전용 sync
// - 시트 '진행' 행 ↔ 캘박 비교, 날짜만 이동
// - create 절대 안 함 (사용자 정책). 캘박 없는 작업은 로그만.
// - delete 절대 안 함 (사용자 정책). 시트 사라진 캘박도 그대로.
// - 가드: 한 회 update 50건 초과 시 즉시 abort + 시간 trigger 자동 정지
// ============================================================
function syncToCalendar() {
  log_('syncToCalendar', '시작 — update 전용 모드 (create/delete 안 함)');
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

    const rows = collectActiveProgressRows_(sheet);
    log_('syncToCalendar', `시트 수집 — '진행' 상태 ${rows.length}건`);
    if (rows.length === 0) {
      log_('syncToCalendar', '처리할 행 없음 — 종료');
      return;
    }

    const index = buildCalendarIndex_(calendar);
    log_(
      'syncToCalendar',
      `캘린더 수집 — ${index.events.length}건 (tagged ${index.byTag.size}, untagged ${index.untagged})`
    );

    const fmtDate = (d) => Utilities.formatDate(d, 'Asia/Seoul', 'yyyy-MM-dd');
    let updated = 0, unchanged = 0, missing = 0;
    const updateLog = [];
    const missingLog = [];

    for (const row of rows) {
      const ev = matchEventForRow_(index, row.id, row.title);
      if (!ev) {
        missing++;
        missingLog.push(`  - ${row.title} / ${fmtDate(row.endDate)} (시트 ${row.sheetRow}행)`);
        continue;
      }

      const evDate = fmtDate(ev.getStartTime());
      const rowDate = fmtDate(row.endDate);
      if (evDate === rowDate) { unchanged++; continue; }

      // 폭주 가드 — update 시도 직전에 검사
      if (updated >= CAL_UPDATE_GUARD_MAX) {
        log_('syncToCalendar', `⚠ 폭주 가드 발동 — update ${CAL_UPDATE_GUARD_MAX}건 초과. 즉시 중단`);
        log_('syncToCalendar', `이미 처리한 update ${updated}건은 유지. 처리 못한 행은 다음 회차로 미룸`);
        disableSyncTrigger_();
        log_('syncToCalendar', `시간 trigger 자동 정지. 원인 점검 후 enableSyncTrigger 수동 호출로 재가동 필요`);
        return;
      }

      ev.setAllDayDate(row.endDate);
      // 라벨 없으면 부착 시도 (다음 회차부터 라벨 매칭으로 더 견고). 실패해도 이름 매칭으로 동작하므로 무시.
      if (row.id && !ev.getTag(SYNC_TAG_KEY)) {
        try { ev.setTag(SYNC_TAG_KEY, row.id); } catch (tagErr) { /* 의존 안 함 */ }
      }
      updated++;
      updateLog.push(`  - ${row.title}: ${evDate} → ${rowDate}`);
    }

    log_('syncToCalendar', `완료 — update ${updated}, unchanged ${unchanged}, missing(캘박없음) ${missing}`);
    if (updated > 0) {
      log_('syncToCalendar', '날짜 이동된 일정:');
      updateLog.forEach(l => log_('syncToCalendar', l));
    }
    if (missing > 0) {
      log_('syncToCalendar', `⚠ 시트엔 '진행'인데 캘박 없는 작업 ${missing}건 (create 안 함, 사용자 정책):`);
      missingLog.forEach(l => log_('syncToCalendar', l));
      log_('syncToCalendar', `→ 필요 시 backfillCalendarDryRun 먼저 확인 후 backfillCalendarApply로 채우세요`);
    }
  } catch (err) {
    log_('syncToCalendar', `에러: ${err}\n${err.stack || ''}`);
  }
}

// ============================================================
// backfillCalendarDryRun — 1회용. 캘박 없는 '진행' 작업 리스트만 로그.
// 실제 캘박 변경 없음. backfillCalendarApply 실행 전 무조건 먼저 돌려서 확인.
// ============================================================
function backfillCalendarDryRun() {
  log_('backfillCalendarDryRun', '시작 — 시트의 \'진행\' 행 중 캘박 없는 작업 리스트 (실제 변경 없음)');
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('💛신규·유지보수');
    if (!sheet) { log_('backfillCalendarDryRun', `'💛신규·유지보수' 시트 없음 — 중단`); return; }

    const calendar = CalendarApp.getCalendarsByName(SCHEDULE_CALENDAR_NAME)[0];
    if (!calendar) { log_('backfillCalendarDryRun', `캘린더 '${SCHEDULE_CALENDAR_NAME}' 없음 — 중단`); return; }

    const rows = collectActiveProgressRows_(sheet);
    log_('backfillCalendarDryRun', `시트 수집 — '진행' 상태 ${rows.length}건`);

    const index = buildCalendarIndex_(calendar);
    log_('backfillCalendarDryRun', `캘린더 수집 — ${index.events.length}건 (tagged ${index.byTag.size}, untagged ${index.untagged})`);

    const fmtDate = (d) => Utilities.formatDate(d, 'Asia/Seoul', 'yyyy-MM-dd');
    const candidates = [];
    let existing = 0;

    for (const row of rows) {
      const ev = matchEventForRow_(index, row.id, row.title);
      if (ev) { existing++; continue; }
      candidates.push(row);
    }

    log_('backfillCalendarDryRun', `결과 — 이미 캘박 있음 ${existing}건, 만들 후보 ${candidates.length}건`);
    if (candidates.length === 0) {
      log_('backfillCalendarDryRun', '만들 후보 없음. backfill 불필요 — 작업 완료');
      return;
    }

    log_('backfillCalendarDryRun', '만들 후보 리스트:');
    candidates.forEach((row, i) => {
      log_('backfillCalendarDryRun', `  ${i + 1}. ${row.title} / ${fmtDate(row.endDate)} (시트 ${row.sheetRow}행)`);
    });

    if (candidates.length > CAL_BACKFILL_GUARD_MAX) {
      log_('backfillCalendarDryRun', `⚠ 후보 ${candidates.length}건이 가드(${CAL_BACKFILL_GUARD_MAX}) 초과. backfillCalendarApply 실행 시 자동 중단됨. 시트 확인 또는 가드 임계 조정 필요`);
    } else {
      log_('backfillCalendarDryRun', `→ 위 리스트가 OK면 backfillCalendarApply 실행. 실제로 ${candidates.length}건 캘박 생성 + 라벨 부착`);
    }
  } catch (err) {
    log_('backfillCalendarDryRun', `에러: ${err}\n${err.stack || ''}`);
  }
}

// ============================================================
// backfillCalendarApply — 1회용. dry-run 결과대로 일괄 캘박 생성.
// 가드: 후보 100건 초과 시 즉시 중단 (수동 점검 요구).
// ============================================================
function backfillCalendarApply() {
  log_('backfillCalendarApply', '시작 — 시트의 \'진행\' 행 중 캘박 없는 작업 일괄 생성');
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('💛신규·유지보수');
    if (!sheet) { log_('backfillCalendarApply', `'💛신규·유지보수' 시트 없음 — 중단`); return; }

    const calendar = CalendarApp.getCalendarsByName(SCHEDULE_CALENDAR_NAME)[0];
    if (!calendar) { log_('backfillCalendarApply', `캘린더 '${SCHEDULE_CALENDAR_NAME}' 없음 — 중단`); return; }

    const rows = collectActiveProgressRows_(sheet);
    const index = buildCalendarIndex_(calendar);

    const fmtDate = (d) => Utilities.formatDate(d, 'Asia/Seoul', 'yyyy-MM-dd');
    const candidates = [];

    for (const row of rows) {
      const ev = matchEventForRow_(index, row.id, row.title);
      if (ev) continue;
      candidates.push(row);
    }

    log_('backfillCalendarApply', `시트 '진행' ${rows.length}건 중 만들 후보 ${candidates.length}건`);

    if (candidates.length === 0) {
      log_('backfillCalendarApply', '만들 후보 없음 — 종료');
      return;
    }

    if (candidates.length > CAL_BACKFILL_GUARD_MAX) {
      log_('backfillCalendarApply', `⚠ 후보 ${candidates.length}건이 가드(${CAL_BACKFILL_GUARD_MAX}) 초과 — 중단`);
      log_('backfillCalendarApply', `시트 확인 또는 코드 상단 CAL_BACKFILL_GUARD_MAX 조정 후 재실행`);
      return;
    }

    let created = 0, failed = 0;
    for (const row of candidates) {
      try {
        const ev = calendar.createAllDayEvent(row.title, row.endDate);
        if (row.id) {
          try { ev.setTag(SYNC_TAG_KEY, row.id); }
          catch (tagErr) { log_('backfillCalendarApply', `라벨 부착 실패 (이름 매칭은 동작): ${row.title}`); }
        }
        created++;
        log_('backfillCalendarApply', `  생성 ${created}: ${row.title} / ${fmtDate(row.endDate)}${row.id ? '' : ' (rowId 없음)'}`);
      } catch (createErr) {
        failed++;
        log_('backfillCalendarApply', `  실패: ${row.title} / ${fmtDate(row.endDate)} — ${createErr}`);
      }
    }

    log_('backfillCalendarApply', `완료 — 생성 ${created}, 실패 ${failed}`);
  } catch (err) {
    log_('backfillCalendarApply', `에러: ${err}\n${err.stack || ''}`);
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
//      v0.2.9: 이름+날짜 중복 체크 강화. 같은 제목·같은 날짜 캘박 있으면 무조건 skip.
//              라벨(rowId) 매칭이 깨져도 폭주 안 일어남.
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

    // [캘린더 등록] 신규 시트의 K열이 '진행'으로 진입할 때
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

    const rowId = String(sheet.getRange(row, 12).getValue() || '').trim();

    if (isDuplicateEvent(calendar, rowId, title, endDate)) {
      log_('onEditTrigger', `중복 이벤트 존재 — 등록 skip ('${title}' / ${Utilities.formatDate(endDate, 'Asia/Seoul', 'yyyy-MM-dd')}, rowId=${rowId || '없음'})`);
      return;
    }

    const ev = calendar.createAllDayEvent(title, endDate);
    if (rowId) {
      try { ev.setTag(SYNC_TAG_KEY, rowId); }
      catch (tagErr) { log_('onEditTrigger', `라벨 부착 실패 (이름 매칭으로 동작): ${tagErr}`); }
    }
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

// 중복 체크 — v0.2.9: 같은 날짜·같은 제목 또는 같은 rowId 라벨 둘 중 하나라도 매칭되면 중복
//
// 사고 교훈: 라벨에만 의존하면 setTag/getTag가 깨질 때 폭주.
// 이름+날짜 매칭을 1차 안전판으로 두면 라벨 깨져도 중복 만들 일 없음.
// 범위를 같은 날짜로 좁혀서 조회 비용도 최소.
function isDuplicateEvent(calendar, rowId, title, date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setDate(end.getDate() + 1);
  end.setHours(0, 0, 0, 0);

  const events = calendar.getEvents(start, end);
  for (const ev of events) {
    if (rowId && ev.getTag(SYNC_TAG_KEY) === rowId) return true;
    if (ev.getTitle() === title) return true;
  }
  return false;
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
