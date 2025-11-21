#!/usr/bin/env node
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

// ✅ 실제 배포된 API 엔드포인트
const API_BASE = "https://api-yqpwamvbqq-du.a.run.app";

/**
 * 결과 리포트 전송
 * - status: "success" | "fail"
 * - errorMessage: 실패 시 stderr / 에러 메시지
 */
function reportResult(
  resultId: string | undefined,
  status: "success" | "fail",
  errorMessage?: string
) {
  if (!resultId) return;

  const gFetch: any = (globalThis as any).fetch;
  if (!gFetch) return; // Node 버전에 따라 fetch 없을 수도 있으니 조용히 무시

  gFetch(`${API_BASE}/verify/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      resultId,
      status,
      errorMessage: errorMessage ?? null,
    }),
  }).catch(() => {
    // 서버 보고 실패해도 로컬 검증 결과에는 영향 없으니까 무시
  });
}

console.log("🔍 Starting MoFix local verification...");

let currentResultId: string | undefined;

try {
  // 1️⃣ .mofix/config.json 찾기
  const configPath = path.join(process.cwd(), ".mofix", "config.json");
  if (!fs.existsSync(configPath)) {
    console.error("❌ Could not find .mofix/config.json file.");
    process.exit(1);
  }

  // 2️⃣ resultId 읽기
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  currentResultId = config.resultId;
  console.log(`📄 resultId = ${config.resultId}`);

  // 3️⃣ npm install
  console.log("📦 Running npm install...");
  execSync("npm install", { stdio: "inherit" });
  console.log("✅ npm install completed.");

  // 4️⃣ npm run build
  console.log("⚙️ Running npm run build...");
  execSync("npm run build", { stdio: "inherit" });
  console.log("✅ Build succeeded!");
  console.log("🎯 Your VS environment successfully built the project!");

  // 5️⃣ 성공 보고 (비동기지만 굳이 기다릴 필요 없음)
  reportResult(currentResultId, "success");
} catch (err: any) {
  // 실패 시 stderr / message를 최대 2000자까지만 잘라서 전송
  let message = "";
  if (err?.stderr) {
    try {
      message = err.stderr.toString().slice(0, 2000);
    } catch {
      message = String(err);
    }
  } else if (err?.message) {
    message = err.message;
  } else {
    message = String(err);
  }

  console.error("❌ Build failed:", message);
  reportResult(currentResultId, "fail", message);
  process.exit(1);
}
