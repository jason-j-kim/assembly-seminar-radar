// 아주 작은 .env 로더 (외부 의존성 없음)
// node --env-file 옵션 대신 어느 Node 버전에서나 동작하도록 직접 읽습니다.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export function loadEnv(file) {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const path = file || join(root, ".env");
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return; // .env 없으면 조용히 통과 (환경변수를 직접 넣은 경우)
  }

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
