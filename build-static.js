// 국회 토론회 레이더 — 정적 배포본 빌더
//
// 실데이터(예정 + 지난 발제자·토론자)를 index.html 에 박아 넣은 단일 파일(dist/index.html)을
// 만듭니다. 결과 파일에는 API 키도, 외부 호출도 없습니다. 회사 홈페이지처럼 정적 호스팅에
// 그 파일 하나만 올려도 안전합니다. (실시간이 아니라 "빌드 시점 기준" 데이터)
//
// 실행:  node build-static.js            (.env 의 키 사용)
//        node build-static.js --sample   (키 없이 샘플 데이터로 빌드)

import { mkdir, readFile, writeFile } from "node:fs/promises";
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
const UPCOMING_DAYS = 31;
const PAST_DAYS = 45;

function pad(n) { return String(n).padStart(2, "0"); }
function stamp(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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
  return [...up, ...pa];
}

async function gather(now) {
  if (USE_SAMPLE) {
    const upcoming = sampleEvents(now).map(normalizeEvent).map((e) => ({ ...e, kind: "upcoming" }));
    const past = samplePastEvents(now).map(normalizeEvent);
    return { upcoming, past };
  }
  const key = process.env.ASSEMBLY_API_KEY;
  if (!key) throw new Error("ASSEMBLY_API_KEY 가 없습니다. .env 에 키를 넣거나 --sample 로 실행하세요.");
  return fetchAllEvents({ key, today: now });
}

async function main() {
  const now = new Date();
  const { upcoming, past } = await gather(now);
  const embed = combine(upcoming, past, now);

  const template = await readFile(join(ROOT, "index.html"), "utf8");
  if (!template.includes("<!-- BUILD:EMBED -->")) {
    throw new Error("index.html 에 <!-- BUILD:EMBED --> 마커가 없습니다.");
  }

  const island =
    `<script>window.__GENERATED_AT__=${JSON.stringify(stamp(now))};` +
    `window.__EMBEDDED_EVENTS__=${JSON.stringify(embed)};</script>`;
  const html = template.replace("<!-- BUILD:EMBED -->", island);

  const outDir = join(ROOT, "dist");
  await mkdir(outDir, { recursive: true });
  const outFile = join(outDir, "index.html");
  await writeFile(outFile, html, "utf8");

  console.log(`정적 배포본 생성: ${outFile}`);
  console.log(`기준 ${stamp(now)} · 임베드 ${embed.length}건 · 키 포함 안 됨(${USE_SAMPLE ? "샘플" : "실데이터"})`);
  console.log("이 파일 하나만 회사 홈페이지에 업로드하면 됩니다.");
}

main().catch((error) => {
  console.error("정적 빌드 실패:", error.message);
  process.exit(1);
});
