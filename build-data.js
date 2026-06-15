// 국회 토론회 레이더 — 공개 데이터(JSON) 빌더
//
// 두 국회 API를 합쳐 public/data.json 으로 저장합니다. 키는 호출에만 쓰이고 파일엔 없습니다.
//  - 예정/최근: "세미나 일정"(nfcoioopazrwmjrgs)  → 앞으로 31일
//  - 지난(발제자·토론자 포함): "정책세미나 개최 현황"(nbqbmccpamsvwebkn) → 지난 45일
// GitHub Actions 가 매일 이 스크립트를 돌려 data.json 을 갱신 → Pages 에 게시합니다.
//
// 실행:  node build-data.js            (.env 또는 환경변수 ASSEMBLY_API_KEY)
//        node build-data.js --sample   (키 없이 샘플로)

import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./lib/env.js";
import {
  fetchAllEvents,
  normalizeEvent,
  dateValue,
  startOfDay,
  addDays,
  sampleEvents,
  samplePastEvents,
} from "./lib/seminars.js";

loadEnv();

const ROOT = dirname(fileURLToPath(import.meta.url));
const USE_SAMPLE = process.argv.includes("--sample");
const UPCOMING_DAYS = 31; // 앞으로
const PAST_DAYS = 45;     // 지난

function pad(n) { return String(n).padStart(2, "0"); }
function stamp(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 예정([오늘, +UPCOMING_DAYS]) + 지난([-PAST_DAYS, 어제]) 만 추려 합치기
function combine(upcoming, past, now) {
  const todayStart = startOfDay(now).getTime();
  const upEnd = startOfDay(addDays(now, UPCOMING_DAYS)).getTime() + 86399999;
  const pastStart = startOfDay(addDays(now, -PAST_DAYS)).getTime();

  const strip = ({ timestamp, ...e }) => e;
  const up = upcoming
    .map((e) => ({ ...e, timestamp: dateValue(e.date) }))
    .filter((e) => Number.isFinite(e.timestamp) && e.timestamp >= todayStart && e.timestamp <= upEnd)
    .map(strip);
  const pa = past
    .map((e) => ({ ...e, timestamp: dateValue(e.date) }))
    .filter((e) => Number.isFinite(e.timestamp) && e.timestamp >= pastStart && e.timestamp < todayStart)
    .map(strip);
  return { events: [...up, ...pa], upCount: up.length, pastCount: pa.length };
}

async function gather(now) {
  if (USE_SAMPLE) {
    const upcoming = sampleEvents(now).map(normalizeEvent).map((e) => ({ ...e, kind: "upcoming" }));
    const past = samplePastEvents(now).map(normalizeEvent);
    return { upcoming, past };
  }
  const key = process.env.ASSEMBLY_API_KEY;
  if (!key) throw new Error("ASSEMBLY_API_KEY 가 없습니다. .env/환경변수에 키를 넣거나 --sample 로 실행하세요.");
  return fetchAllEvents({ key, today: now });
}

async function main() {
  const now = new Date();
  const { upcoming, past } = await gather(now);
  const { events, upCount, pastCount } = combine(upcoming, past, now);

  const outDir = join(ROOT, "public");
  await mkdir(outDir, { recursive: true });
  const outFile = join(outDir, "data.json");
  await writeFile(outFile, JSON.stringify({ generatedAt: stamp(now), count: events.length, events }), "utf8");

  console.log(`데이터 생성: ${outFile}`);
  console.log(`기준 ${stamp(now)} · 예정 ${upCount}건 + 지난(발제자 포함) ${pastCount}건 = 총 ${events.length}건 · 키 미포함(${USE_SAMPLE ? "샘플" : "실데이터"})`);
}

main().catch((error) => {
  console.error("데이터 빌드 실패:", error.message);
  process.exit(1);
});
