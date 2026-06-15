// 국회 토론회 레이더 — 공개 데이터(JSON) 빌더
//
// 실데이터를 받아 public/data.json 으로 저장합니다.
// 이 파일에는 API 키가 들어가지 않으며(키는 호출에만 사용), 공개 호스팅(GitHub Pages 등)에
// 올려 어느 페이지서든 키 없이 읽도록 쓰는 용도입니다. GitHub Actions 가 매일 이 스크립트를
// 돌려 data.json 을 갱신 → Pages 에 게시합니다.
//
// 실행:  node build-data.js            (.env 또는 환경변수 ASSEMBLY_API_KEY)
//        node build-data.js --sample   (키 없이 샘플로)

import { mkdir, writeFile } from "node:fs/promises";
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
  if (!key) throw new Error("ASSEMBLY_API_KEY 가 없습니다. .env/환경변수에 키를 넣거나 --sample 로 실행하세요.");

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

  // 어제~앞으로 31일만 담아 파일 크기·관련성 유지 (페이지가 이 안에서 다시 필터)
  const trimmed = withinRange(raw, { today: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1), days: 31 })
    .map(({ timestamp, ...e }) => e);
  const events = trimmed.length ? trimmed : raw;

  const outDir = join(ROOT, "public");
  await mkdir(outDir, { recursive: true });
  const outFile = join(outDir, "data.json");
  await writeFile(outFile, JSON.stringify({ generatedAt: stamp(now), count: events.length, events }), "utf8");

  console.log(`데이터 생성: ${outFile}`);
  console.log(`기준 ${stamp(now)} · ${events.length}건 · 키 미포함(${USE_SAMPLE ? "샘플" : "실데이터"})`);
}

main().catch((error) => {
  console.error("데이터 빌드 실패:", error.message);
  process.exit(1);
});
