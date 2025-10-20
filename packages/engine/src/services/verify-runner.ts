// packages/engine/src/services/verify-runner.ts
import * as fs from "fs-extra";
import { runCmd, pickScript } from "../utils/proc.js";   // ✅ 경로 수정
import { waitForHealth } from "../utils/health.js";      // ✅ 경로 수정

export type VerifyInput = {
  projectDir: string;   // 마이그레이션된 실제 디렉토리
  healthUrl?: string;   // 헬스체크 URL (선택)
  port?: number;        // dev 서버 포트 (선택)
  timeoutInstallMs?: number;
  timeoutBuildMs?: number;
  timeoutRunMs?: number;
};

// TODO: verifyProject 함수 구현부 넣기
export async function verifyProject(input: VerifyInput) {
  // 샘플 구조
  return {
    install: { ok: true, durationMs: 1000 },
    build: { ok: true, durationMs: 2000 },
    run: { ok: true, durationMs: 3000 },
    logs: "Sample verification logs...",
  };
}
