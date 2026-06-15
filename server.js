// 국회 토론회 레이더 — 무의존성 정적 서버 + API 프록시
//
// 역할
//  1) index.html 등 정적 파일 제공
//  2) /api/seminars : 서버에서 공공데이터 API를 호출해 정규화 결과를 JSON으로 반환
//     - API 키는 클라이언트가 아니라 서버 환경변수 ASSEMBLY_API_KEY 로 읽음
//     - 브라우저 CORS 문제를 서버 프록시로 해결
//  3) /api/digest.md : 기본 키워드/2주 기준 마크다운 다이제스트
//
// 실행:  node --env-file=.env server.js   (또는 npm start)

import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { loadEnv } from "./lib/env.js";
import {
  KEYWORDS,
  parseApiRows,
  extractResult,
  buildEvents,
  toMarkdown,
  sampleEvents,
} from "./lib/seminars.js";

loadEnv();

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const DEFAULT_ENDPOINT =
  process.env.ASSEMBLY_ENDPOINT ||
  "https://open.assembly.go.kr/portal/openapi/nfcoioopazrwmjrgs";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

// 서버에서 공공데이터 API 호출 → 정규화된 이벤트 배열
async function fetchSeminars({ endpoint = DEFAULT_ENDPOINT, size = 300 } = {}) {
  const key = process.env.ASSEMBLY_API_KEY;
  if (!key) {
    const error = new Error("ASSEMBLY_API_KEY 환경변수가 설정되지 않았습니다.");
    error.code = "NO_KEY";
    throw error;
  }

  const url = new URL(endpoint);
  url.searchParams.set("KEY", key);
  url.searchParams.set("Type", "json");
  url.searchParams.set("pIndex", "1");
  url.searchParams.set("pSize", String(size));

  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`공공데이터 API 응답 오류 (HTTP ${response.status})`);
  }

  const payload = await response.json();
  const events = parseApiRows(payload);
  if (!events.length) {
    const result = extractResult(payload);
    const detail = result ? ` (${result.code} ${result.message})` : "";
    throw new Error(`응답에서 세미나 목록을 찾지 못했습니다.${detail}`);
  }
  return events;
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
  });
  res.end(data);
}

async function handleApiSeminars(req, res, query) {
  const useSample = query.get("sample") === "1";
  try {
    const events = useSample ? sampleEvents() : await fetchSeminars();
    sendJson(res, 200, {
      ok: true,
      source: useSample ? "sample" : "api",
      count: events.length,
      fetchedAt: new Date().toISOString(),
      events,
    });
  } catch (error) {
    sendJson(res, error.code === "NO_KEY" ? 200 : 502, {
      ok: false,
      source: "error",
      error: error.message,
      // 키가 없을 때만 클라이언트가 샘플로 자연스럽게 넘어가도록 신호
      fallback: error.code === "NO_KEY" ? "sample" : null,
      events: [],
    });
  }
}

async function handleDigest(req, res) {
  try {
    const events = process.env.ASSEMBLY_API_KEY ? await fetchSeminars() : sampleEvents();
    const filtered = buildEvents(events, { keywords: KEYWORDS, days: 14 });
    const md = toMarkdown(filtered, { rangeLabel: "2주 이내", today: new Date() });
    res.writeHead(200, {
      "Content-Type": "text/markdown; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(md);
  } catch (error) {
    res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`다이제스트 생성 실패: ${error.message}`);
  }
}

async function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === "/" || rel === "") rel = "/index.html";

  // dotfile(.env, .git 등) 및 민감 파일 접근 차단
  const segments = rel.split("/").filter(Boolean);
  if (segments.some((seg) => seg.startsWith("."))) {
    res.writeHead(403); res.end("Forbidden"); return;
  }

  // 경로 탈출 방지
  const safe = normalize(join(ROOT, rel));
  if (!safe.startsWith(ROOT + sep) && safe !== join(ROOT, "index.html")) {
    res.writeHead(403); res.end("Forbidden"); return;
  }

  try {
    const data = await readFile(safe);
    res.writeHead(200, { "Content-Type": MIME[extname(safe)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  const { pathname, searchParams } = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    });
    res.end();
    return;
  }

  if (pathname === "/api/seminars") return handleApiSeminars(req, res, searchParams);
  if (pathname === "/api/digest.md") return handleDigest(req, res);
  return serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  const keyState = process.env.ASSEMBLY_API_KEY ? "설정됨" : "없음(샘플 모드)";
  console.log(`국회 토론회 레이더 → http://localhost:${PORT}`);
  console.log(`ASSEMBLY_API_KEY: ${keyState}`);
});
