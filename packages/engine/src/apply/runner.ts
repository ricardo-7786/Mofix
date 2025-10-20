// packages/engine/src/apply/runner.ts
// -----------------------------------------------------------------------------
// Plan/patch 실행기: 파일 생성/수정/삭제, JSON 병합(json.merge), 텍스트 패치(text.patch),
// 의존성 설치(install), 임의 커맨드 실행(run/exec) 등을 처리합니다.
// - MoFix의 "구 스텝 포맷"(target, pkg 등)과 "신 스텝 포맷"(file, deps[])을 모두 지원합니다.
// -----------------------------------------------------------------------------

import fs from "fs-extra";
import path from "path";
import { spawn } from "child_process";
import { suggestVersion } from "../utils/depsRegistry.js";

// -----------------------------------------------------------------------------
// 🔸 스텝 타입(넉넉하게 유니온; 실제 판별은 런타임에서 안전하게 수행)
// -----------------------------------------------------------------------------
export type JsonMergeStep = {
  type: "json.merge";
  file: string;
  merge: Record<string, any>;
};

export type CreateStep =
  | { type: "create"; file: string; content?: string | Buffer; overwrite?: boolean; description?: string; required?: boolean }
  | { type: "create"; target: string; content?: string | Buffer; overwrite?: boolean; description?: string; required?: boolean }; // 구버전 호환

export type ModifyStep = { type: "modify"; target: string; content: string; description?: string; required?: boolean }; // 구버전 호환

export type DeleteStep = { type: "delete"; target: string; description?: string }; // 구버전 호환

export type CopyStep = { type: "copy"; target: string; content?: string; description?: string }; // 구버전 호환(간단히 파일 쓰기로 처리)

export type TextPatchSimple =
  | { search: string; replace: string }
  | { search: string; replace: string }[];

export type TextPatchStep = {
  type: "text.patch";
  file: string;
  before?: string;
  after?: string;
  patches?: TextPatchSimple;
  createIfMissing?: boolean;
};

export type InstallOldStep = { type: "install"; pkg: string; dev?: boolean; description?: string }; // 구포맷: 단일 패키지
export type InstallNewStep = { type: "install"; pm?: "npm" | "pnpm" | "yarn" | "bun"; deps?: string[]; dev?: boolean }; // 신포맷: 다중 deps 또는 전체 install

export type RunStep = {
  type: "run";
  cmd: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  stdio?: "inherit" | "pipe";
  timeoutMs?: number;
};

export type ExecStep = { type: "exec"; cmd: string; args?: string[]; cwd?: string; description?: string }; // 구버전 호환

export type PlanStep =
  | JsonMergeStep
  | CreateStep
  | ModifyStep
  | DeleteStep
  | CopyStep
  | TextPatchStep
  | InstallOldStep
  | InstallNewStep
  | RunStep
  | ExecStep;

// -----------------------------------------------------------------------------
// 🔸 유틸
// -----------------------------------------------------------------------------
function deepMerge<T extends Record<string, any>>(base: T, patch: Record<string, any>): T {
  const out: Record<string, any> = { ...(base ?? {}) };
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = deepMerge(out[k] ?? {}, v as Record<string, any>);
    } else {
      out[k] = v as any;
    }
  }
  return out as T;
}

async function ensureParentDir(filePath: string) {
  await fs.ensureDir(path.dirname(filePath));
}

async function readTextSafe(file: string): Promise<string> {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return "";
  }
}

function toRelFile(step: { file?: string; target?: string }): string {
  return (step as any).file ?? (step as any).target; // 구/신 포맷 호환
}

function detectPackageManager(root: string): "pnpm" | "yarn" | "bun" | "npm" {
  if (fs.existsSync(path.join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(root, "yarn.lock"))) return "yarn";
  if (fs.existsSync(path.join(root, "bun.lockb"))) return "bun";
  return "npm";
}

async function runProcess(
  cmd: string,
  args: string[],
  cwd: string,
  stdio: "inherit" | "pipe" = "inherit",
  env?: Record<string, string>,
  timeoutMs = 15 * 60_000
): Promise<{ code: number; stdout?: string; stderr?: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      env: { ...process.env, ...(env ?? {}) },
      stdio,
      shell: process.platform === "win32",
    });

    let to: NodeJS.Timeout | undefined;
    if (timeoutMs > 0) {
      to = setTimeout(() => {
        try { child.kill("SIGKILL"); } catch {}
        reject(new Error(`Process timeout: ${cmd} ${args.join(" ")}`));
      }, timeoutMs);
    }

    if (stdio === "pipe") {
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (d) => (stdout += String(d)));
      child.stderr?.on("data", (d) => (stderr += String(d)));
      child.on("error", (e) => {
        if (to) clearTimeout(to);
        reject(e);
      });
      child.on("close", (code) => {
        if (to) clearTimeout(to);
        resolve({ code: code ?? -1, stdout, stderr });
      });
    } else {
      child.on("error", (e) => {
        if (to) clearTimeout(to);
        reject(e);
      });
      child.on("close", (code) => {
        if (to) clearTimeout(to);
        resolve({ code: code ?? -1 });
      });
    }
  });
}

async function runCmd(pm: string, args: string[], root: string) {
  const r = await runProcess(pm, args, root, "inherit");
  if (r.code !== 0) throw new Error(`Command failed: ${pm} ${args.join(" ")}`);
}

// 텍스트 치환 도우미
function applyTextPatches(input: string, patches: TextPatchSimple): string {
  if (Array.isArray(patches)) {
    let out = input;
    for (const p of patches) out = out.split(p.search).join(p.replace);
    return out;
  }
  return input.split(patches.search).join(patches.replace);
}

// -----------------------------------------------------------------------------
// 🔸 핵심 실행기
// -----------------------------------------------------------------------------
export async function runPatchStep(root: string, step: PlanStep) {
  switch (step.type) {
    // ── JSON 병합 ────────────────────────────────────────────────────────────
    case "json.merge": {
      const abs = path.join(root, step.file);
      await ensureParentDir(abs);
      const exists = await fs.pathExists(abs);
      const base = exists ? await fs.readJSON(abs) : {};
      const merged = deepMerge(base, step.merge);
      await fs.writeJSON(abs, merged, { spaces: 2 });
      return;
    }

    // ── 파일 생성/쓰기/수정 계열 ────────────────────────────────────────────
    case "create": {
      const rel = toRelFile(step as any);
      if (!rel) return;
      const abs = path.join(root, rel);
      const exists = await fs.pathExists(abs);
      if (exists && !(step as any).overwrite) return; // 덮어쓰기 금지 시 skip
      await ensureParentDir(abs);
      await fs.writeFile(abs, (step as any).content ?? "");
      return;
    }

    case "modify": {
      // 구버전 포맷: target에 그대로 content 덮어쓰기
      const abs = path.join(root, (step as ModifyStep).target);
      await ensureParentDir(abs);
      await fs.writeFile(abs, step.content, "utf8");
      return;
    }

    case "delete": {
      const abs = path.join(root, (step as DeleteStep).target);
      if (await fs.pathExists(abs)) await fs.remove(abs);
      return;
    }

    case "copy": {
      // 간단 모드: content를 target에 씀 (파일 복사와 구분)
      const abs = path.join(root, (step as CopyStep).target);
      await ensureParentDir(abs);
      await fs.writeFile(abs, (step as CopyStep).content ?? "", "utf8");
      return;
    }

    case "text.patch": {
      const abs = path.join(root, step.file);
      let current = await readTextSafe(abs);

      if (!current && step.createIfMissing) {
        await ensureParentDir(abs);
        current = "";
      } else if (!current) {
        return; // 파일 없고 createIfMissing=false면 패스
      }

      if (typeof step.before === "string" && typeof step.after === "string") {
        if (current === step.before) {
          await fs.writeFile(abs, step.after, "utf8");
          return;
        }
        // 전체치환이 아니면 patches로 시도
      }

      if (step.patches) {
        const next = applyTextPatches(current, step.patches);
        await fs.writeFile(abs, next, "utf8");
      }
      return;
    }

    // ── 의존성 설치 ─────────────────────────────────────────────────────────
    case "install": {
      const pm = (step as InstallNewStep).pm ?? detectPackageManager(root);

      // 신포맷: deps[]가 있으면 그 패키지만 설치
      if (Array.isArray((step as InstallNewStep).deps) && (step as InstallNewStep).deps!.length > 0) {
        const deps = (step as InstallNewStep).deps!.map((d) => {
          // 버전이 지정되지 않은 항목에만 버전 추천을 붙인다.
          if (/@/.test(d)) return d;
          return `${d}@${suggestVersion(d)}`;
        });

        let args: string[] = [];
        if (pm === "pnpm") {
          args = ["add", ...deps];
          if ((step as InstallNewStep).dev) args.push("-D");
        } else if (pm === "yarn") {
          args = ["add", ...deps];
          if ((step as InstallNewStep).dev) args.push("--dev");
        } else if (pm === "bun") {
          args = ["add", ...deps];
          if ((step as InstallNewStep).dev) args.push("-d");
        } else {
          args = ["install", ...deps];
          if ((step as InstallNewStep).dev) args.push("--save-dev");
          else args.push("--save");
        }
        await runCmd(pm, args, root);
        return;
      }

      // 구포맷: pkg 단일 설치
      if ((step as InstallOldStep).pkg) {
        const name = (step as InstallOldStep).pkg;
        const withVer = /@/.test(name) ? name : `${name}@${suggestVersion(name)}`;

        let args: string[] = [];
        if (pm === "pnpm") {
          args = ["add", withVer];
          if ((step as InstallOldStep).dev) args.push("-D");
        } else if (pm === "yarn") {
          args = ["add", withVer];
          if ((step as InstallOldStep).dev) args.push("--dev");
        } else if (pm === "bun") {
          args = ["add", withVer];
          if ((step as InstallOldStep).dev) args.push("-d");
        } else {
          args = ["install", withVer];
          if ((step as InstallOldStep).dev) args.push("--save-dev");
          else args.push("--save");
        }
        await runCmd(pm, args, root);
        return;
      }

      // 둘 다 아니면 전체 install
      const args =
        pm === "pnpm" ? ["install"] :
        pm === "yarn" ? [] :
        pm === "bun"  ? ["install"] :
        ["install"];
      await runCmd(pm, args, root);
      return;
    }

    // ── 임의 커맨드 실행(run/exec) ──────────────────────────────────────────
    case "run": {
      const cwd = step.cwd ? (path.isAbsolute(step.cwd) ? step.cwd : path.join(root, step.cwd)) : root;
      const r = await runProcess(step.cmd, step.args ?? [], cwd, step.stdio ?? "inherit", step.env, step.timeoutMs);
      if (r.code !== 0) throw new Error(`Run failed: ${step.cmd} ${(step.args ?? []).join(" ")}`);
      return;
    }

    case "exec": {
      const cwd = (step as ExecStep).cwd
        ? (path.isAbsolute((step as ExecStep).cwd!) ? (step as ExecStep).cwd! : path.join(root, (step as ExecStep).cwd!))
        : root;
      const r = await runProcess((step as ExecStep).cmd, (step as ExecStep).args ?? [], cwd, "inherit");
      if (r.code !== 0) throw new Error(`Exec failed: ${(step as ExecStep).cmd} ${((step as ExecStep).args ?? []).join(" ")}`);
      return;
    }

    default: {
      const _never: never = step as never;
      throw new Error(`Unknown step type: ${(step as any)?.type}`);
    }
  }
}

export async function applyPatches(root: string, steps: PlanStep[]) {
  for (const s of steps) {
    await runPatchStep(root, s);
  }
}
