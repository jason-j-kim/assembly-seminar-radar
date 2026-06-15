// 국회 토론회 레이더 — 매일 아침 자동 조회 스크립트
//
// 동작
//  1) 공공데이터 API 호출(없으면 --sample 로 데모)
//  2) 2주 이내 + 관심 키워드 + 중복 제거 + 중요도 정렬
//  3) digest/YYYY-MM-DD.md 로 저장
//  4) TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 가 있으면 텔레그램으로 발송
//
// 실행:  node fetch-daily.js            (.env 사용)
//        node fetch-daily.js --sample   (키 없이 샘플로 확인)
//
// 매일 08:00 자동 실행은 schedule-windows.ps1 또는 .github/workflows/daily.yml 참고.

import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./lib/env.js";
import {
  KEYWORDS,
  parseApiRows,
  extractResult,
  buildEvents,
  toMarkdown,
  ymd,
  sampleEvents,
} from "./lib/seminars.js";

loadEnv();

const ROOT = dirname(fileURLToPath(import.meta.url));
const USE_SAMPLE = process.argv.includes("--sample");
const ENDPOINT =
  process.env.ASSEMBLY_ENDPOINT ||
  "https://open.assembly.go.kr/portal/openapi/nfcoioopazrwmjrgs";

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

async function sendTelegram(markdown) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;

  // 텔레그램 메시지는 4096자 제한 → 안전하게 자름
  const text = markdown.length > 3900 ? markdown.slice(0, 3870) + "\n…(생략)" : markdown;
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  if (!response.ok) {
    console.warn(`텔레그램 발송 실패: HTTP ${response.status}`);
    return false;
  }
  return true;
}

async function main() {
  const today = new Date();
  const raw = USE_SAMPLE ? sampleEvents(today) : await fetchRaw();
  const events = buildEvents(raw, { keywords: KEYWORDS, days: 14, today });
  const md = toMarkdown(events, {
    rangeLabel: "2주 이내",
    dateLabel: ymd(today),
    today,
  });

  const dir = join(ROOT, "digest");
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${ymd(today)}.md`);
  await writeFile(file, md, "utf8");

  console.log(`[${ymd(today)}] ${USE_SAMPLE ? "샘플" : "API"} · 매칭 ${events.length}건 → ${file}`);

  const sent = await sendTelegram(md);
  if (sent) console.log("텔레그램으로 발송했습니다.");
}

main().catch((error) => {
  console.error("자동 조회 실패:", error.message);
  process.exit(1);
});
