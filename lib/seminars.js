// 국회 토론회 레이더 — 공용 처리 모듈 (브라우저 / Node 공용 ESM)
//
// 이 파일은 데이터 정규화 → 기간 필터 → 키워드 필터 → 중복 제거 →
// 중요도 점수 → 마크다운/CSV 출력까지의 "순수 함수" 묶음입니다.
// DOM이나 Node 전용 API를 쓰지 않으므로 서버(server.js), 자동 조회
// 스크립트(fetch-daily.js)가 동일한 로직을 공유합니다.

export const KEYWORDS = [
  "재정", "예산", "산업정책", "저출산", "연금", "복지",
  "AI", "지역균형", "문화", "예술", "플랫폼", "디지털",
];

// 별도 강조 표시할 국책·국회 소속 연구기관
export const INSTITUTIONS = [
  { key: "KDI", label: "KDI", pattern: /KDI|한국개발연구원/i },
  { key: "예산정책처", label: "국회예산정책처", pattern: /예산정책처|NABO/i },
  { key: "입법조사처", label: "국회입법조사처", pattern: /입법조사처|NARS/i },
  { key: "미래연구원", label: "국회미래연구원", pattern: /미래연구원|NAFI/i },
];

// ── 날짜 유틸 ───────────────────────────────────────────────
export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function ymd(date) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${z(date.getMonth() + 1)}-${z(date.getDate())}`;
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// "2026.06.20", "2026년 6월 20일", "2026-6-20" 등을 timestamp로
export function dateValue(value) {
  if (!value) return NaN;
  const cleaned = String(value)
    .replace(/[.]/g, "-")
    .replace(/[년월]/g, "-")
    .replace(/일/g, "")
    .replace(/\s+/g, "");
  const match = cleaned.match(/(\d{4})-?(\d{1,2})-?(\d{1,2})/);
  if (!match) return NaN;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime();
}

// 날짜 문자열을 표시용 "YYYY-MM-DD" 로 정리 ("2026.05.27(14:00)" → "2026-05-27")
export function cleanDate(value) {
  const m = String(value).replace(/[.]/g, "-").match(/(\d{4})-?(\d{1,2})-?(\d{1,2})/);
  if (!m) return String(value || "").trim();
  return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
}
// 날짜 문자열에 시간이 묻어 있으면 추출 ("2026.05.27(14:00)" → "14:00")
function extractTime(value) {
  const m = String(value).match(/(\d{1,2}:\d{2})/);
  return m ? m[1] : "";
}

// ── 정규화 ─────────────────────────────────────────────────
// 두 국회 API를 함께 수용합니다.
//  (1) "국회의원 세미나 일정"(nfcoioopazrwmjrgs) — 예정+최근:
//      TITLE, LINK, DESCRIPTION, SDATE, STIME, NAME(주최기관), LOCATION, IMGLINK, PHONE
//  (2) "국회의원 정책 세미나 개최 현황"(nbqbmccpamsvwebkn) — 과거 개최분(발제자·토론자 포함):
//      TITLE, HOST_DT(개최일시), HOST_PLACE_NAME, HOST_INS_NAME(주최),
//      ATTENDANCE_NAME1(발제자), ATTENDANCE_NAME2(토론자), DETAIL_VIEW_URL
export function normalizeEvent(row) {
  const pick = (...names) => {
    for (const name of names) {
      if (row[name] !== undefined && row[name] !== null && String(row[name]).trim()) {
        return String(row[name]).trim();
      }
    }
    return "";
  };

  const rawDate = pick("SDATE", "HOST_DT", "date", "DATE", "SEMINAR_DATE", "EVENT_DT", "EVT_DT", "START_DE", "FR_DT", "DT");
  const time = pick("STIME", "time", "TIME", "SEMINAR_TIME", "EVENT_TIME", "EVT_TIME", "START_TIME") || extractTime(rawDate);

  return {
    title: pick("TITLE", "title", "SEMINAR_TITLE", "EVENT_TITLE", "EVT_NM", "EVENT_NM", "BBS_SJ", "SJ"),
    date: cleanDate(rawDate),
    time,
    place: pick("LOCATION", "HOST_PLACE_NAME", "place", "PLACE", "SEMINAR_PLACE", "EVENT_PLACE", "EVT_PLACE", "PLC", "LC"),
    host: pick("NAME", "HOST_INS_NAME", "host", "HOST", "HOST_NM", "MNA_NM", "POLY_NM", "RPRS_NM", "HG_NM"),
    cohost: pick("cohost", "COHOST", "JOINT_HOST", "ORGANIZER", "ORGNZT_NM", "SPONSOR"),
    committee: pick("committee", "COMMITTEE", "CMIT_NM", "COMMITTEE_NM", "CMT_NM"),
    link: pick("LINK", "DETAIL_VIEW_URL", "link", "URL", "DETAIL_URL", "HMPG_URL"),
    text: pick("DESCRIPTION", "text", "CONTENT", "SUMMARY", "RM", "DESC", "CN"),
    presenters: pick("presenters", "ATTENDANCE_NAME1"),  // 발제자
    discussants: pick("discussants", "ATTENDANCE_NAME2"), // 토론자
    kind: String(row.kind || "").trim(),                 // upcoming | past
  };
}

// 응답 본문 어디에 있든 row 배열을 재귀로 찾아 정규화
export function parseApiRows(payload) {
  const rows = [];
  const visit = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value === "object") {
      if (Array.isArray(value.row)) rows.push(...value.row);
      Object.values(value).forEach(visit);
    }
  };
  visit(payload);
  return rows.map(normalizeEvent).filter((event) => event.title || event.date);
}

// 응답 envelope의 RESULT 코드/메시지 추출 (오류 진단용)
export function extractResult(payload) {
  let found = null;
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (value.RESULT && (value.RESULT.CODE || value.RESULT.MESSAGE)) {
      found = { code: value.RESULT.CODE || "", message: value.RESULT.MESSAGE || "" };
    }
    if (Array.isArray(value)) value.forEach(visit);
    else Object.values(value).forEach(visit);
  };
  visit(payload);
  return found;
}

// ── 데이터 소스 (두 국회 API) ───────────────────────────────
export const SCHEDULE_ENDPOINT = "https://open.assembly.go.kr/portal/openapi/nfcoioopazrwmjrgs"; // 세미나 일정 (예정+최근)
export const RECORD_ENDPOINT = "https://open.assembly.go.kr/portal/openapi/nbqbmccpamsvwebkn";   // 정책세미나 개최 현황 (과거, 발제자·토론자)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 국회 서버는 해외(CI) 망에서 간헐적으로 끊길 수 있어 재시도 + 타임아웃을 둔다.
async function fetchOpenApi(key, endpoint, extra = {}, size = 300, attempts = 4) {
  const url = new URL(endpoint);
  url.searchParams.set("KEY", key);
  url.searchParams.set("Type", "json");
  url.searchParams.set("pIndex", "1");
  url.searchParams.set("pSize", String(size));
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);

  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25000);
      const res = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`API HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) await sleep(2000 * (i + 1));
    }
  }
  throw lastError;
}

// 예정(일정) + 과거(개최현황: 발제자·토론자 포함)를 함께 받아 정규화·태깅
export async function fetchAllEvents({ key, today = new Date(), scheduleEndpoint = SCHEDULE_ENDPOINT, recordEndpoint = RECORD_ENDPOINT } = {}) {
  if (!key) throw new Error("ASSEMBLY_API_KEY 가 필요합니다.");

  const schedule = await fetchOpenApi(key, scheduleEndpoint);
  const upcoming = parseApiRows(schedule).map((e) => ({ ...e, kind: "upcoming" }));

  // 개최 현황은 HOST_DT(개최일시) 검색이 필수 → 올해/작년 연도로 조회 (연초 경계 대비)
  const year = today.getFullYear();
  const records = await Promise.all([
    fetchOpenApi(key, recordEndpoint, { HOST_DT: String(year) }).catch(() => null),
    fetchOpenApi(key, recordEndpoint, { HOST_DT: String(year - 1) }).catch(() => null),
  ]);
  const past = records
    .filter(Boolean)
    .flatMap((p) => parseApiRows(p))
    .map((e) => ({ ...e, kind: "past" }));

  return { upcoming, past };
}

// ── 분석 ───────────────────────────────────────────────────
export function detectInstitutions(event) {
  const haystack = `${event.host} ${event.cohost} ${event.title} ${event.text}`;
  return INSTITUTIONS.filter((inst) => inst.pattern.test(haystack));
}

export function matchedKeywords(event, activeKeywords, keywords = KEYWORDS) {
  const active = activeKeywords || new Set(keywords);
  const haystack = `${event.title} ${event.text} ${event.host} ${event.cohost} ${event.committee}`.toLowerCase();
  return keywords.filter(
    (keyword) => active.has(keyword) && haystack.includes(keyword.toLowerCase())
  );
}

export function scoreEvent(event, matched, weights = {}) {
  let score = matched.reduce((sum, keyword) => sum + (Number(weights[keyword]) || 1) * 2, 0);
  if (/(위원회|특별위원회|예산결산)/.test(event.committee)) score += 2;
  if (/(국회예산정책처|국회입법조사처|국회미래연구원|연구원|학회)/.test(`${event.cohost} ${event.host}`)) score += 2;
  if (/(토론회|세미나|포럼)/.test(event.title)) score += 1;
  score += detectInstitutions(event).length; // 국책 연구기관 참여 가산
  return score;
}

// 기간(오늘 기준 days일 이내) 안의 이벤트만
export function withinRange(events, { today = new Date(), days = 14 } = {}) {
  const start = startOfDay(today).getTime();
  const end = startOfDay(addDays(today, days)).getTime() + 24 * 60 * 60 * 1000 - 1;
  return events
    .map((event) => ({ ...event, timestamp: dateValue(event.date) }))
    .filter((event) => Number.isFinite(event.timestamp) && event.timestamp >= start && event.timestamp <= end);
}

// 전체 파이프라인: raw rows → 화면/마크다운에 쓸 최종 이벤트 배열
export function buildEvents(rawEvents, options = {}) {
  const {
    today = new Date(),
    days = 14,
    keywords = KEYWORDS,
    activeKeywords = new Set(keywords),
    weights = {},
    hostFilter = "",
    committeeFilter = "",
    dedup = true,
    requireKeyword = true,
  } = options;

  const hostQuery = hostFilter.trim().toLowerCase();
  const committeeQuery = committeeFilter.trim().toLowerCase();
  const seen = new Set();

  return withinRange(rawEvents, { today, days })
    .map((event) => {
      const matched = matchedKeywords(event, activeKeywords, keywords);
      return {
        ...event,
        matched,
        institutions: detectInstitutions(event),
        score: scoreEvent(event, matched, weights),
      };
    })
    .filter((event) => (requireKeyword ? event.matched.length > 0 : true))
    .filter((event) => !hostQuery || event.host.toLowerCase().includes(hostQuery))
    .filter((event) => !committeeQuery || event.committee.toLowerCase().includes(committeeQuery))
    .filter((event) => {
      if (!dedup) return true;
      const key = `${event.title.replace(/\s+/g, "")}|${event.date}|${event.place.replace(/\s+/g, "")}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.score - a.score || a.timestamp - b.timestamp);
}

// ── 출력 ───────────────────────────────────────────────────
export function briefingText(event) {
  const host = event.host || "주최 미확인";
  const place = event.place || "장소 미확인";
  const matched = event.matched.length ? event.matched.join(", ") : "관심 키워드";
  const committee = event.committee || "관련 위원회 미확인";
  const insts = event.institutions && event.institutions.length
    ? ` ${event.institutions.map((i) => i.label).join("·")} 참여.`
    : "";
  const people = [];
  if (event.presenters) people.push(`발제: ${event.presenters}`);
  if (event.discussants) people.push(`토론: ${event.discussants}`);
  const peopleStr = people.length ? ` ${people.join(" / ")}.` : "";
  return `${host} 주최, ${place}에서 열립니다. ${matched} 키워드가 잡혔고, ${committee}와 연결해 볼 만합니다.${insts}${peopleStr}`;
}

export function toMarkdown(events, meta = {}) {
  const dateLabel = meta.dateLabel || ymd(new Date(meta.today || Date.now()));
  const rangeLabel = meta.rangeLabel || "2주 이내";
  const lines = [];
  lines.push(`# 국회 토론회 레이더 — ${dateLabel}`);
  lines.push("");
  lines.push(`기준: ${rangeLabel} · 관심 키워드 매칭 ${events.length}건`);
  lines.push("");

  if (!events.length) {
    lines.push("> 조건에 맞는 예정 세미나가 없습니다.");
    return lines.join("\n");
  }

  events.forEach((event, index) => {
    const insts = event.institutions && event.institutions.length
      ? ` _(${event.institutions.map((i) => i.label).join(", ")})_`
      : "";
    lines.push(`## ${index + 1}. ${event.title || "제목 없음"} · 중요도 ${event.score}${insts}`);
    lines.push(`- 일시: ${event.date || "-"} ${event.time || ""}`.trim());
    lines.push(`- 장소: ${event.place || "-"}`);
    lines.push(`- 주최: ${event.host || "-"}${event.cohost ? ` / 공동 ${event.cohost}` : ""}`);
    if (event.presenters) lines.push(`- 발제자: ${event.presenters}`);
    if (event.discussants) lines.push(`- 토론자: ${event.discussants}`);
    if (event.committee) lines.push(`- 위원회: ${event.committee}`);
    if (event.matched.length) lines.push(`- 키워드: ${event.matched.join(", ")}`);
    if (event.link && event.link !== "#") lines.push(`- 링크: ${event.link}`);
    lines.push("");
  });

  return lines.join("\n").trim();
}

export function toCsv(events) {
  const header = ["중요도", "제목", "일자", "시간", "장소", "주최", "발제자", "토론자", "위원회", "키워드", "연구기관", "링크"];
  const cell = (value) => {
    const s = String(value ?? "").replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const rows = events.map((event) => [
    event.score,
    event.title,
    event.date,
    event.time,
    event.place,
    event.host,
    event.presenters || "",
    event.discussants || "",
    event.committee,
    event.matched.join(" "),
    (event.institutions || []).map((i) => i.label).join(" "),
    event.link && event.link !== "#" ? event.link : "",
  ].map(cell).join(","));
  // 엑셀 한글 깨짐 방지용 BOM
  return "﻿" + [header.join(","), ...rows].join("\r\n");
}

// 데모/오프라인 확인용 샘플 데이터 (오늘 기준 상대 날짜)
export function sampleEvents(today = new Date()) {
  const d = (n) => ymd(addDays(today, n));
  return [
    { title: "초고령사회 연금개혁과 재정 지속가능성 정책토론회", date: d(2), time: "10:00", place: "국회의원회관 제2세미나실", host: "김도현 의원", cohost: "한국재정학회, 국회입법조사처", committee: "기획재정위원회", link: "#", text: "연금, 재정, 복지 지출의 장기 지속가능성을 논의한다." },
    { title: "AI 전환 시대 산업정책과 디지털 플랫폼 규제의 방향", date: d(4), time: "14:00", place: "국회의원회관 대회의실", host: "박서연 의원", cohost: "국회미래연구원, 산업연구원", committee: "산업통상자원중소벤처기업위원회", link: "#", text: "AI, 산업정책, 플랫폼, 디지털 전환 정책을 다룬다." },
    { title: "지역균형발전과 문화예술 기반 도시전략 토론회", date: d(6), time: "15:00", place: "국회도서관 강당", host: "이준석 의원", cohost: "한국문화관광연구원", committee: "문화체육관광위원회", link: "#", text: "지역균형, 문화, 예술 정책의 연결을 검토한다." },
    { title: "저출산 대응 복지전달체계 개편 세미나", date: d(8), time: "09:30", place: "국회의원회관 제8간담회의실", host: "한민정 의원", cohost: "보건사회연구원", committee: "보건복지위원회", link: "#", text: "저출산, 복지, 돌봄 전달체계의 제도 개편을 논의한다." },
    { title: "2026 예산안 쟁점과 재정준칙 공개 토론회", date: d(11), time: "13:30", place: "국회의원회관 제1소회의실", host: "정우진 의원", cohost: "국회예산정책처", committee: "예산결산특별위원회", link: "#", text: "예산, 재정준칙, 국가채무 관리 방안을 검토한다." },
    { title: "소상공인 현장 간담회", date: d(5), time: "11:00", place: "국회의원회관", host: "강민수 의원", cohost: "소상공인연합회", committee: "정무위원회", link: "#", text: "일반 민생 현안을 논의한다." },
  ];
}

// 데모용 "지난 세미나"(발제자·토론자 포함) 샘플
export function samplePastEvents(today = new Date()) {
  const d = (n) => ymd(addDays(today, n));
  return [
    { title: "디지털 전환과 지역 문화예술 활성화 토론회", date: d(-3), time: "14:00", place: "국회도서관 소회의실", host: "국회 문화예술연구회", cohost: "", committee: "", link: "#", text: "", presenters: "정란수(한양대학교 관광학부, 겸임교수)", discussants: "김도현(문화체육관광부, 정책관) / 이수진(지역문화진흥원, 본부장)", kind: "past" },
    { title: "복지전달체계 개편과 재정 지속가능성 세미나", date: d(-7), time: "10:00", place: "의원회관 제2세미나실", host: "한국사회보장학회", cohost: "", committee: "", link: "#", text: "", presenters: "김진석(서울여자대학교, 교수)", discussants: "전용호(인천대학교 사회복지학과, 교수)", kind: "past" },
  ];
}
