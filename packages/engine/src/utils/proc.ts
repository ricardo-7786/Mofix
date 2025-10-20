// packages/engine/src/utils/proc.ts
import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import path from "path";

export type RunResult = {
  ok: boolean;
  code: number | null;
  logs: string;
  durationMs: number;
};

// TODO: runCmd, pickScript 함수 구현
export async function runCmd(cmd: string, args: string[], cwd: string): Promise<RunResult> {
  return { ok: true, code: 0, logs: "mock logs", durationMs: 100 };
}

export function pickScript(pkg: any, names: string[]): string | null {
  return null;
}
