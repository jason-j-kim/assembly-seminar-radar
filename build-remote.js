// 국회 토론회 레이더 — 원격(클라우드 JSON) 페이지 빌더
//
// index.html 에 "이 URL의 JSON을 읽어라"만 박아 넣은 페이지를 만듭니다.
// 만들어진 파일에는 API 키도, 국회 API 직접 호출도 없습니다 — 지정한 공개 JSON URL만
// 매일 읽어 자동 갱신됩니다. 그래서 회사 홈페이지(정적)에 이 파일 하나만 한 번 올리면 됩니다.
//
// 실행:
//   node build-remote.js https://USER.github.io/REPO/data.json
//        → dist/index.html  (회사 홈페이지에 업로드할 파일)
//   node build-remote.js data.json public/index.html
//        → Pages 자체에서 같은 폴더의 data.json 을 읽는 페이지 (워크플로가 사용)

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const DATA_URL = process.argv[2] || process.env.DATA_URL;
const OUT_ARG = process.argv[3];

if (!DATA_URL) {
  console.error("사용법: node build-remote.js <DATA_URL> [출력경로]");
  console.error("예시:   node build-remote.js https://USER.github.io/REPO/data.json");
  process.exit(1);
}

async function main() {
  const template = await readFile(join(ROOT, "index.html"), "utf8");
  if (!template.includes("<!-- BUILD:EMBED -->")) {
    throw new Error("index.html 에 <!-- BUILD:EMBED --> 마커가 없습니다.");
  }

  const island = `<script>window.__DATA_URL__=${JSON.stringify(DATA_URL)};</script>`;
  const html = template.replace("<!-- BUILD:EMBED -->", island);

  const outFile = OUT_ARG
    ? (isAbsolute(OUT_ARG) ? OUT_ARG : join(ROOT, OUT_ARG))
    : join(ROOT, "dist", "index.html");
  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, html, "utf8");

  console.log(`원격 페이지 생성: ${outFile}`);
  console.log(`데이터 URL: ${DATA_URL}`);
  console.log("이 파일에는 키가 없습니다. 회사 홈페이지에 한 번만 업로드하세요.");
}

main().catch((error) => {
  console.error("원격 페이지 빌드 실패:", error.message);
  process.exit(1);
});
