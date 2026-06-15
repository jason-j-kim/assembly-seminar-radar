// 국회 토론회 레이더 — 정적 배포본 빌더
//
// 실데이터를 받아 index.html 에 "데이터를 박아 넣은" 단일 파일(dist/index.html)을
// 만듭니다. 결과 파일에는 API 키도, 외부 호출도 없습니다. 그래서 회사 홈페이지처럼
// 내가 통제하지 못하는 정적 호스팅에 그 파일 하나만 올려도 안전합니다.
// (실시간이 아니라 "빌드 시점 기준" 데이터 — 갱신하려면 다시 빌드해 업로드)
//
// 실행:  node build-static.js            (.env 의 키 사용)
//        node build-static.js --sample   (키 없이 샘플 데이터로 빌드)

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./lib/env.js";
import { parseApiRows, extractResult, withinRange, normalizeEvent, sampleEvents } from "./lib/seminars.js";

loadEnv();

const ROOT = dirname(fileURLToPath(import.meta.url));
const USE_SAMPLE = process.argv.includes("--sample");
const ENDPOINT =
  process.env.ASSEMBLY_ENDPOINT ||
  "https://open.assembly.go.kr/portal/openapi/nfcoioopazrwmjrgs";

function pad(n) { return String(n).padStart(2, "0"); }
function stamp(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function fetchRaw() {
  const key = process.env.ASSEMBLY_API_KEY;
  if (!key) throw new Error("ASSEMBLY_API_KEY 가 없습니다. .env 에 키를 넣거나 --sample 로 실행하세요.");

  const url = new URL(ENDPOINT);
  url.searchParams.set("KEY", key);
  url.searchParams.set("Type", "json");
  url.searchParams.set("pIndex", "1");
  url.searchParams.set("pSize", "300");

  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`API HTTP ${response.status}`);
  const payload = await response.json();
  const events = parseApiRows(payload);
  if (!events.length) {
    const result = extractResult(payload);
    throw new Error(`세미나 목록 없음${result ? ` (${result.code} ${result.message})` : ""}`);
  }
  return events;
}

async function main() {
  const now = new Date();
  const raw = USE_SAMPLE ? sampleEvents(now).map(normalizeEvent) : await fetchRaw();

  // 파일 크기·관련성을 위해 어제~앞으로 30일 범위만 임베드 (페이지는 이 안에서 다시 필터)
  const trimmed = withinRange(raw, { today: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1), days: 31 })
    .map(({ timestamp, ...e }) => e);
  const embed = trimmed.length ? trimmed : raw; // 범위 결과가 비면 전체 임베드

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
  console.log(`기준 시각: ${stamp(now)} · 임베드 ${embed.length}건 · 키 포함 안 됨(${USE_SAMPLE ? "샘플" : "실데이터"})`);
  console.log("이 파일 하나만 회사 홈페이지에 업로드하면 됩니다.");
}

main().catch((error) => {
  console.error("정적 빌드 실패:", error.message);
  process.exit(1);
});
