// ================================================================
// IMC 3본부 디자인팀 업무 대시보드 — GAS Web App
// 버전: v1.8.0
// 변경: 유형 분석 엔드포인트(type_analysis) 추가
// ================================================================

const SPREADSHEET_ID = '1KukGD6VbYDHYx7vfFBs4P7-OVZFAuV97wneIQCzR7Ng';
const SHEET_NAME = '업무데이터';
const INTERNAL_TEAMS = ['3본부 1팀', '3본부 2팀'];
const PRIORITY_START_DATE = '2026-01-01';

const TYPE_MAP = {
  '배너(미니)': '배너', '배너(심플)': '배너', '배너(베이직)': '배너',
  '배너(프리미엄)': '배너', '배너(GIF)': '배너',
  '사이즈베리(미니)': '사이즈베리', '사이즈베리(심플)': '사이즈베리',
  '사이즈베리(베이직)': '사이즈베리', '사이즈베리(프리미엄)': '사이즈베리',
  '사이즈베리(GIF)': '사이즈베리', '사이즈베리(심플off)': '사이즈베리',
  '사이즈베리(베이직off)': '사이즈베리', '사이즈베리(프리미엄off)': '사이즈베리',
  '카드뉴스': '카드뉴스',
  '브랜드검색_서브(img)': '브랜드검색', '브랜드검색_서브(txt)': '브랜드검색',
  '브랜드페이지(심플)': '랜딩페이지', '브랜드페이지(베이직)': '랜딩페이지',
  '정보형페이지': '랜딩페이지', '웹진형페이지': '랜딩페이지',
  '이벤트페이지(심플)': '랜딩페이지', '이벤트페이지(베이직)': '랜딩페이지',
  '상세페이지(심플)': '상세페이지', '상세페이지(베이직)': '상세페이지',
  '상세페이지(프리미엄)': '상세페이지',
  '스킨(심플)': '스킨', '스킨(베이직)': '스킨',
  '홈페이지PC_메인(심플)': '홈페이지', '홈페이지PC_메인(베이직)': '홈페이지',
  '홈페이지PC_메인(프리미엄)': '홈페이지', '홈페이지PC_서브(심플)': '홈페이지',
  '홈페이지PC_서브(베이직)': '홈페이지', '홈페이지PC_서브(프리미엄)': '홈페이지',
  '홈페이지PC_서브(기타1)': '홈페이지', '홈페이지PC_서브(기타ALL)': '홈페이지',
  '리터칭(심플)': '리터칭', '리터칭(베이직)': '리터칭', '리터칭(프리미엄)': '리터칭',
  '영상(심플)': '영상', '영상(베이직)': '영상', '영상(프리미엄)': '영상',
  'PPT': 'PPT', 'KV(프리미엄)': 'KV', 'KV(off)': 'KV',
  '디지털(메인)': '오프라인', '디지털(베리)': '오프라인', '디지털(ALL)': '오프라인',
  '옥외A(M)': '오프라인', '옥외A(L)': '오프라인',
  '옥외B(심플)': '오프라인', '옥외B(베이직)': '오프라인',
  '포스터(S)': '오프라인', '포스터(M)': '오프라인', '포스터(L)': '오프라인',
  '잡지(1P미만)': '오프라인', '잡지(1P)': '오프라인', '잡지(2P)': '오프라인',
  '책자_커버': '오프라인', '책자_내지(심플)': '오프라인', '책자_내지(베이직)': '오프라인',
  '리플렛(8절)': '오프라인', '리플렛(4절)': '오프라인', '리플렛(특수)': '오프라인',
  '신문(2단)': '오프라인', '신문(6단)': '오프라인', '신문(10단)': '오프라인',
  '신문(15단)': '오프라인', '제품패키지': '오프라인',
  '라벨(S)': '오프라인', '라벨(M/L)': '오프라인',
  '명함(심플)': '오프라인', '명함(베이직)': '오프라인',
  '로고(심플)': '오프라인', '로고(베이직)': '오프라인', '로고(프리미엄)': '오프라인',
  '기타(off)': '오프라인', '사내(off)': '오프라인',
  '기타': '기타', '사내': '기타', 'X': '기타',
  '유지보수(심플)': '유지보수', '유지보수(베이직)': '유지보수',
};

function normalizePriority(raw, completedDate) {
  if (!completedDate || completedDate < PRIORITY_START_DATE) return null;
  const v = String(raw || '').trim();
  if (v === '급건') return '급건';
  if (v === '일반' || v === '여유') return '일반';
  return null;
}

function normalizeTeam(team) {
  return INTERNAL_TEAMS.includes(team) ? team : '외부 요청';
}

function subtractBusinessDays(dateStr, tat) {
  if (!dateStr || tat === null || tat === undefined) return null;
  const days = Math.max(0, Math.round(tat));
  const date = new Date(dateStr + 'T00:00:00');
  let remaining = days;
  while (remaining > 0) {
    date.setDate(date.getDate() - 1);
    const dow = date.getDay();
    if (dow !== 0 && dow !== 6) remaining--;
  }
  return {
    dateStr:  date.toISOString().slice(0, 10),
    year:     date.getFullYear(),
    month:    date.getMonth() + 1,
    dow:      date.getDay(),
    dowLabel: ['일','월','화','수','목','금','토'][date.getDay()],
  };
}

function doGet(e) {
  try {
    const params = e.parameter || {};
    const type = params.type || 'rows';
    let result;
    if      (type === 'summary')       result = getSummary(params);
    else if (type === 'teams')         result = getTeamList();
    else if (type === 'brands')        result = getBrandList(params);
    else if (type === 'brand_detail')  result = getBrandDetail(params);
    else if (type === 'bottleneck')    result = getBottleneck(params);
    else if (type === 'type_analysis') result = getTypeAnalysis(params);
    else                               result = getRows(params);
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function loadData() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('시트를 찾을 수 없습니다: ' + SHEET_NAME);
  const [headers, ...rows] = sheet.getDataRange().getValues();
  const idx = {};
  headers.forEach((h, i) => { idx[h] = i; });
  const required = ['연도','월','팀','광고주','작업유형','수량','소요일','완료일'];
  required.forEach(col => { if (idx[col] === undefined) throw new Error('필수 컬럼 없음: ' + col); });
  const priorityIdx = idx['우선순위'] ?? idx['긴급도'] ?? idx['타입'] ?? idx['분류'] ?? null;
  return rows.map(row => {
    const completed = parseDate(row[idx['완료일']]);
    const tat = row[idx['소요일']] !== '' ? Number(row[idx['소요일']]) : null;
    const ri = subtractBusinessDays(completed, tat);
    return {
      연도: Number(row[idx['연도']]), 월: String(row[idx['월']] || ''),
      팀: String(row[idx['팀']] || ''), 광고주: String(row[idx['광고주']] || ''),
      작업유형: mapType(String(row[idx['작업유형']] || '')),
      수량: Number(row[idx['수량']] || 0), 소요일: tat, 완료일: completed,
      우선순위: priorityIdx !== null ? normalizePriority(row[priorityIdx], completed) : null,
      요청일: ri ? ri.dateStr : null, 요청연도: ri ? ri.year : null,
      요청월: ri ? ri.month : null, 요청요일: ri ? ri.dow : null,
      요청요일명: ri ? ri.dowLabel : null,
    };
  }).filter(row => row.연도 > 0 && row.팀 !== '');
}

function mapType(raw) { return TYPE_MAP[raw] || '기타'; }

function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  const str = String(val).trim();
  const m = str.match(/(\d{4})[.\s]+(\d{1,2})[.\s]+(\d{1,2})/);
  if (m) return m[1] + '-' + m[2].padStart(2,'0') + '-' + m[3].padStart(2,'0');
  return null;
}

function applyFilters(rows, params) {
  let f = rows;
  if (params.team)  f = f.filter(r => r.팀 === params.team);
  if (params.brand) f = f.filter(r => r.광고주 === params.brand);
  if (params.year)  f = f.filter(r => r.연도 === Number(params.year));
  if (params.start) {
    const s = toDateInt(params.start);
    f = f.filter(r => {
      if (r.완료일) return dateStrToInt(r.완료일) >= s;
      const [ry, rm] = toYearMonth(r.연도, r.월);
      return toDateInt(ry + '-' + String(rm).padStart(2,'0') + '-01') >= s;
    });
  }
  if (params.end) {
    const e2 = toDateInt(params.end + (params.end.length === 7 ? '-31' : ''));
    f = f.filter(r => {
      if (r.완료일) return dateStrToInt(r.완료일) <= e2;
      const [ry, rm] = toYearMonth(r.연도, r.월);
      return toDateInt(ry + '-' + String(rm).padStart(2,'0') + '-01') <= e2;
    });
  }
  return f;
}

function toDateInt(d)    { return Number(d.replace(/-/g,'')); }
function dateStrToInt(d) { return d ? Number(d.replace(/-/g,'')) : 0; }
function toYearMonth(year, monthStr) {
  const M = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  return [year, M.indexOf(monthStr) + 1];
}

function getPrevRange(start, end) {
  if (!start || !end) return null;
  const s = new Date(start), e = new Date(end);
  const diff = e - s;
  const pe = new Date(s - 1), ps = new Date(pe - diff);
  const fmt = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  return { start: fmt(ps), end: fmt(pe) };
}

function getRows(params) {
  const data = loadData();
  const f = applyFilters(data, params);
  return { rows: f, total: f.length };
}

function getSummary(params) {
  const data = loadData();
  const filtered = applyFilters(data, params);
  const withTat = filtered.filter(r => r.소요일 !== null);
  const avgTat = withTat.length > 0 ? withTat.reduce((s,r) => s+r.소요일,0)/withTat.length : 0;
  const within2days = withTat.filter(r => r.소요일 <= 2).length;
  const within2Rate = withTat.length > 0 ? (within2days/withTat.length)*100 : 0;

  const byMonth = {};
  filtered.forEach(r => {
    const key = r.연도 + '-' + r.월;
    if (!byMonth[key]) byMonth[key] = { 연도:r.연도, 월:r.월, 건수:0, tatSum:0, tatCount:0, 급건:0, 일반:0, 분류된건수:0, 팀별급건:{}, 팀별일반:{} };
    const qty = r.수량||1, tk = normalizeTeam(r.팀);
    byMonth[key].건수 += qty;
    if (r.소요일!==null){ byMonth[key].tatSum+=r.소요일; byMonth[key].tatCount++; }
    if (r.우선순위==='급건')  { byMonth[key].급건+=qty; byMonth[key].분류된건수+=qty; byMonth[key].팀별급건[tk]=(byMonth[key].팀별급건[tk]||0)+qty; }
    if (r.우선순위==='일반')  { byMonth[key].일반+=qty; byMonth[key].분류된건수+=qty; byMonth[key].팀별일반[tk]=(byMonth[key].팀별일반[tk]||0)+qty; }
  });
  const monthlyTrend = Object.values(byMonth).map(m => ({
    연도:m.연도, 월:m.월, 건수:m.건수,
    평균TAT: m.tatCount>0 ? Math.round((m.tatSum/m.tatCount)*100)/100 : null,
    급건: m.분류된건수>0 ? m.급건 : null, 일반: m.분류된건수>0 ? m.일반 : null,
    팀별급건: m.분류된건수>0 ? m.팀별급건 : null, 팀별일반: m.분류된건수>0 ? m.팀별일반 : null,
  }));

  const byTeam = {};
  filtered.forEach(r => { const k=normalizeTeam(r.팀); byTeam[k]=(byTeam[k]||0)+(r.수량||1); });
  const byBrand = {};
  filtered.forEach(r => { byBrand[r.광고주]=(byBrand[r.광고주]||0)+(r.수량||1); });
  const topBrands = Object.entries(byBrand).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([b,c])=>({브랜드:b,건수:c}));
  const tatDist = {'1일이내':0,'1-2일':0,'2-3일':0,'3-5일':0,'5일초과':0};
  withTat.forEach(r => {
    if(r.소요일<=1) tatDist['1일이내']++;
    else if(r.소요일<=2) tatDist['1-2일']++;
    else if(r.소요일<=3) tatDist['2-3일']++;
    else if(r.소요일<=5) tatDist['3-5일']++;
    else tatDist['5일초과']++;
  });

  let 이전총건수=null, 이전처리율=null;
  if (params.start && params.end) {
    const prev = getPrevRange(params.start, params.end);
    if (prev) {
      const pf = applyFilters(data, {start:prev.start, end:prev.end});
      const pt = pf.filter(r=>r.소요일!==null);
      이전총건수 = pf.reduce((s,r)=>s+(r.수량||1),0);
      이전처리율 = pt.length>0 ? Math.round((pt.filter(r=>r.소요일<=2).length/pt.length)*100*100)/100 : 0;
    }
  }
  return {
    총건수: filtered.reduce((s,r)=>s+(r.수량||1),0),
    평균TAT: Math.round(avgTat*100)/100,
    이내2일처리율: Math.round(within2Rate*100)/100,
    이전총건수, 이전처리율, 월별추이:monthlyTrend, 팀별건수:byTeam, 상위브랜드:topBrands, TAT분포:tatDist,
  };
}

function getTeamList() {
  const data = loadData();
  const all = [...new Set(data.map(r=>r.팀))];
  const found = INTERNAL_TEAMS.filter(t=>all.includes(t));
  const hasExt = all.some(t=>!INTERNAL_TEAMS.includes(t));
  return { teams: hasExt ? [...found,'외부 요청'] : found };
}

function getBrandList(params) {
  const data = loadData();
  return { brands: [...new Set(applyFilters(data,params).map(r=>r.광고주))].sort() };
}

function getBrandDetail(params) {
  const data = loadData();
  const filtered = applyFilters(data, params);
  const bd = filtered.filter(r=>r.광고주===params.brand);
  if (!bd.length) return { error:'데이터 없음' };
  const byMonth={}, byType={};
  bd.forEach(r => {
    const k=r.연도+'-'+r.월;
    if(!byMonth[k]) byMonth[k]={연도:r.연도,월:r.월,건수:0};
    byMonth[k].건수+=(r.수량||1);
    byType[r.작업유형]=(byType[r.작업유형]||0)+(r.수량||1);
  });
  const withTat=bd.filter(r=>r.소요일!==null);
  const tatDist={'1일이내':0,'1-2일':0,'2일초과':0};
  withTat.forEach(r=>{ if(r.소요일<=1) tatDist['1일이내']++; else if(r.소요일<=2) tatDist['1-2일']++; else tatDist['2일초과']++; });
  const avgTat=withTat.length>0?withTat.reduce((s,r)=>s+r.소요일,0)/withTat.length:0;
  let 긴급도분포=null, 급건합=0, 일반합=0, 분류건수=0;
  const 팀별급건={}, 팀별일반={};
  bd.forEach(r=>{
    const qty=r.수량||1, tk=normalizeTeam(r.팀);
    if(r.우선순위==='급건'){ 급건합+=qty; 분류건수+=qty; 팀별급건[tk]=(팀별급건[tk]||0)+qty; }
    if(r.우선순위==='일반'){ 일반합+=qty; 분류건수+=qty; 팀별일반[tk]=(팀별일반[tk]||0)+qty; }
  });
  if(분류건수>0) 긴급도분포={일반:일반합, 급건:급건합, 팀별일반, 팀별급건};
  return {
    브랜드:params.brand, 총건수:bd.reduce((s,r)=>s+(r.수량||1),0),
    평균TAT:Math.round(avgTat*100)/100, 월별추이:Object.values(byMonth),
    작업유형분포:Object.entries(byType).sort((a,b)=>b[1]-a[1]).map(([t,c])=>({유형:t,건수:c})),
    TAT분포:tatDist, 긴급도분포,
  };
}

function getBottleneck(params) {
  const data = loadData();
  const filtered = applyFilters(data, params);
  const wr = filtered.filter(r=>r.요청일!==null);
  const hmRaw={};
  wr.forEach(r=>{
    const ym=r.요청연도+'-'+String(r.요청월).padStart(2,'0'), team=normalizeTeam(r.팀);
    if(!hmRaw[ym]) hmRaw[ym]={};
    hmRaw[ym][team]=(hmRaw[ym][team]||0)+(r.수량||1);
  });
  const allT=[...new Set(wr.map(r=>normalizeTeam(r.팀)))];
  const orderedTeams=[...INTERNAL_TEAMS.filter(t=>allT.includes(t)), ...(allT.includes('외부 요청')?['외부 요청']:[])];
  const heatmap=Object.keys(hmRaw).sort().map(ym=>{
    const row={ym};
    orderedTeams.forEach(t=>{row[t]=hmRaw[ym][t]||0;});
    row['합계']=orderedTeams.reduce((s,t)=>s+(row[t]||0),0);
    return row;
  });
  const DL={1:'월',2:'화',3:'수',4:'목',5:'금'}, dowRaw={};
  wr.forEach(r=>{
    const d=r.요청요일; if(d===0||d===6) return;
    const team=normalizeTeam(r.팀);
    if(!dowRaw[team]) dowRaw[team]={1:0,2:0,3:0,4:0,5:0};
    dowRaw[team][d]=(dowRaw[team][d]||0)+(r.수량||1);
  });
  const dt={1:0,2:0,3:0,4:0,5:0};
  Object.values(dowRaw).forEach(d=>{[1,2,3,4,5].forEach(k=>{dt[k]+=(d[k]||0);});});
  dowRaw['전체']=dt;
  const dow=[...orderedTeams,'전체'].map(team=>{
    if(!dowRaw[team]) return null;
    const row={team};
    [1,2,3,4,5].forEach(d=>{row[DL[d]]=dowRaw[team][d]||0;});
    row['합계']=[1,2,3,4,5].reduce((s,d)=>s+(dowRaw[team][d]||0),0);
    return row;
  }).filter(Boolean);
  const rYM={}, cYM={};
  wr.forEach(r=>{ const ym=r.요청연도+'-'+String(r.요청월).padStart(2,'0'); rYM[ym]=(rYM[ym]||0)+(r.수량||1); });
  filtered.forEach(r=>{ if(!r.완료일) return; const ym=r.완료일.slice(0,7); cYM[ym]=(cYM[ym]||0)+(r.수량||1); });
  const allYMs=[...new Set([...Object.keys(rYM),...Object.keys(cYM)])].sort();
  const gap=allYMs.map(ym=>({ym, 요청:rYM[ym]||0, 완료:cYM[ym]||0, 갭:(rYM[ym]||0)-(cYM[ym]||0)}));
  const 목금집중도=orderedTeams.map(team=>{
    const d=dowRaw[team]; if(!d) return null;
    const total=[1,2,3,4,5].reduce((s,k)=>s+(d[k]||0),0), tf=(d[4]||0)+(d[5]||0);
    return {team, 목금건수:tf, 전체건수:total, 목금비율:total>0?Math.round((tf/total)*100*10)/10:0};
  }).filter(Boolean);
  return {teams:orderedTeams, heatmap, dow, gap, 목금집중도};
}

function getTypeAnalysis(params) {
  const data = loadData();
  const filtered = applyFilters(data, params);
  const total = filtered.reduce((s,r)=>s+(r.수량||1),0);

  const byType={};
  filtered.forEach(r=>{
    const type=r.작업유형, qty=r.수량||1;
    if(!byType[type]) byType[type]={건수:0, tatSum:0, tatCount:0, 급건:0, 일반:0, 분류건수:0};
    byType[type].건수+=qty;
    if(r.소요일!==null){ byType[type].tatSum+=r.소요일; byType[type].tatCount++; }
    if(r.우선순위==='급건'){ byType[type].급건+=qty; byType[type].분류건수+=qty; }
    else if(r.우선순위==='일반'){ byType[type].일반+=qty; byType[type].분류건수+=qty; }
  });

  const 유형목록=Object.entries(byType).sort((a,b)=>b[1].건수-a[1].건수).map(([type,d])=>({
    유형:type, 건수:d.건수,
    비중: total>0 ? Math.round((d.건수/total)*100*10)/10 : 0,
    평균TAT: d.tatCount>0 ? Math.round((d.tatSum/d.tatCount)*100)/100 : null,
    급건비율: d.분류건수>0 ? Math.round((d.급건/d.분류건수)*100*10)/10 : null,
  }));

  const top5=유형목록.slice(0,5).map(t=>t.유형);
  const trendRaw={};
  filtered.forEach(r=>{
    if(!top5.includes(r.작업유형)||!r.완료일) return;
    const ym=r.완료일.slice(0,7), qty=r.수량||1;
    if(!trendRaw[ym]) trendRaw[ym]={};
    trendRaw[ym][r.작업유형]=(trendRaw[ym][r.작업유형]||0)+qty;
  });
  const 월별추이=Object.keys(trendRaw).sort().map(ym=>{
    const row={ym}; top5.forEach(t=>{row[t]=trendRaw[ym][t]||0;}); return row;
  });

  let 드릴다운=null;
  if(params.drill_type){
    const td=filtered.filter(r=>r.작업유형===params.drill_type);
    const typeTotal=td.reduce((s,r)=>s+(r.수량||1),0);
    const byBrand={};
    td.forEach(r=>{byBrand[r.광고주]=(byBrand[r.광고주]||0)+(r.수량||1);});
    const 상위광고주=Object.entries(byBrand).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([b,c])=>({브랜드:b,건수:c}));
    const byTeam={};
    td.forEach(r=>{ const k=normalizeTeam(r.팀); byTeam[k]=(byTeam[k]||0)+(r.수량||1); });
    const 팀별비중=Object.entries(byTeam).sort((a,b)=>b[1]-a[1]).map(([team,c])=>({
      팀:team, 건수:c, 비중:typeTotal>0?Math.round((c/typeTotal)*100*10)/10:0,
    }));
    const wt=td.filter(r=>r.소요일!==null);
    const tatDist={'1일이내':0,'1-2일':0,'2-3일':0,'3-5일':0,'5일초과':0};
    wt.forEach(r=>{
      if(r.소요일<=1) tatDist['1일이내']++;
      else if(r.소요일<=2) tatDist['1-2일']++;
      else if(r.소요일<=3) tatDist['2-3일']++;
      else if(r.소요일<=5) tatDist['3-5일']++;
      else tatDist['5일초과']++;
    });
    const avgTat=wt.length>0?Math.round((wt.reduce((s,r)=>s+r.소요일,0)/wt.length)*100)/100:null;
    드릴다운={유형:params.drill_type, 총건수:typeTotal, 평균TAT:avgTat, 상위광고주, 팀별비중, TAT분포:tatDist};
  }

  return {총건수:total, 유형목록, 월별추이, 상위5유형:top5, 드릴다운};
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}