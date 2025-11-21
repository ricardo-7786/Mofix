// packages/engine/src/core/plan-executor.ts
import path from "path";
import fs from "fs-extra";
import { spawn } from "child_process";
import type { MigrationPlan, MigrationOptions } from "./types.js";

type Logger = Required<
  Pick<MigrationOptions["logger"], "info" | "step" | "success" | "warning" | "error">
>;

type JsonObject = Record<string, any>;

// 엔진이 실행 가능한 스텝들 (신규 + 레거시 호환)
type PatchStep =
  | { type: "json.merge"; file: string; merge: Record<string, any> }
  | {
      type: "create";
      file?: string;
      target?: string;
      description?: string;
      required?: boolean;
      content?: string | Buffer;
      overwrite?: boolean;
    }
  | { type: "write"; file: string; content: string | Buffer }
  | { type: "append"; file: string; content: string | Buffer }
  | {
      type: "text.patch";
      file: string;
      before?: string;
      after?: string;
      patches?:
        | { search: string; replace: string }[]
        | { search: string; replace: string };
      createIfMissing?: boolean;
    }
  | { type: "install"; pm?: "npm" | "pnpm" | "yarn" | "bun"; deps?: string[]; dev?: boolean }
  | {
      type: "run";
      cmd: string;
      args?: string[];
      cwd?: string;
      env?: Record<string, string>;
      stdio?: "inherit" | "pipe";
      timeoutMs?: number;
    }
  // ── 레거시 호환 ──────────────────────────────
  | { type: "modify"; target: string; description?: string; required?: boolean; content: string }
  | { type: "delete"; target: string; description?: string }
  | { type: "copy"; target: string; description?: string; content?: string }
  | { type: "install-old"; pkg: string; dev?: boolean; description?: string }
  | { type: "exec"; cmd: string; args?: string[]; cwd?: string; description?: string };

// ───────────────────────── 유틸 ─────────────────────────
function isDry(options: MigrationOptions | undefined): boolean {
  return !!options?.dryRun;
}
async function safeReadJson(file: string): Promise<JsonObject> {
  if (!(await fs.pathExists(file))) return {};
  try {
    return await fs.readJson(file);
  } catch {
    return {};
  }
}
function deepMerge(target: JsonObject, source: JsonObject): JsonObject {
  for (const [k, v] of Object.entries(source)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      target[k] = deepMerge(target[k] ?? {}, v as JsonObject);
    } else {
      target[k] = v;
    }
  }
  return target;
}
async function jsonMerge(baseDir: string, relFile: string, merge: JsonObject, dry: boolean) {
  const file = path.join(baseDir, relFile);
  const current = await safeReadJson(file);
  const next = deepMerge({ ...current }, merge);
  if (dry) return { file, changed: JSON.stringify(current) !== JSON.stringify(next) };
  await fs.ensureDir(path.dirname(file));
  await fs.writeJson(file, next, { spaces: 2 });
  return { file, changed: true };
}
async function createFile(
  baseDir: string,
  targetOrFile: string | undefined,
  content: string | Buffer | undefined,
  overwrite: boolean,
  dry: boolean
) {
  const rel = targetOrFile ?? "";
  const file = path.join(baseDir, rel);
  const exists = await fs.pathExists(file);
  if (exists && !overwrite) return { file, skipped: true, reason: "exists" };
  if (dry) return { file, changed: !exists || overwrite };
  await fs.ensureDir(path.dirname(file));
  await fs.writeFile(file, content ?? "");
  return { file, changed: true };
}
async function writeFile(baseDir: string, relFile: string, content: string | Buffer, dry: boolean) {
  const file = path.join(baseDir, relFile);
  if (dry) return { file, changed: true };
  await fs.ensureDir(path.dirname(file));
  await fs.writeFile(file, content);
  return { file, changed: true };
}
async function appendFile(baseDir: string, relFile: string, content: string | Buffer, dry: boolean) {
  const file = path.join(baseDir, relFile);
  if (dry) return { file, changed: true };
  await fs.ensureDir(path.dirname(file));
  await fs.appendFile(file, content);
  return { file, changed: true };
}
async function textPatch(
  baseDir: string,
  step: Extract<PatchStep, { type: "text.patch" }>,
  dry: boolean
) {
  const file = path.join(baseDir, step.file);
  const exists = await fs.pathExists(file);
  if (!exists && !step.createIfMissing) return { file, skipped: true, reason: "missing" };

  if (!exists && step.createIfMissing) {
    if (dry) return { file, changed: true };
    await fs.ensureDir(path.dirname(file));
    await fs.writeFile(file, (step.after ?? "") + "\n");
    return { file, changed: true };
  }

  const original = await fs.readFile(file, "utf8");
  let modified = original;

  if (step.before !== undefined && step.after !== undefined) {
    modified = modified.replace(step.before, step.after);
  }

  if (step.patches) {
    const arr = Array.isArray(step.patches) ? step.patches : [step.patches];
    for (const p of arr) {
      const regex = new RegExp(p.search, "g");
      modified = modified.replace(regex, p.replace);
    }
  }

  if (modified === original) return { file, skipped: true, reason: "no-change" };
  if (dry) return { file, changed: true };
  await fs.writeFile(file, modified);
  return { file, changed: true };
}
function detectPackageManager(
  projectPath: string,
  hinted?: "npm" | "pnpm" | "yarn" | "bun"
): "npm" | "pnpm" | "yarn" | "bun" {
  if (hinted) return hinted;
  if (fs.existsSync(path.join(projectPath, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(projectPath, "yarn.lock"))) return "yarn";
  if (fs.existsSync(path.join(projectPath, "bun.lockb"))) return "bun";
  return "npm";
}
function spawnPromise(
  cmd: string,
  args: string[],
  cwd: string,
  env: Record<string, string>,
  stdio: "inherit" | "pipe"
): Promise<{ code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio,
      shell: process.platform === "win32", // 윈도우 호환
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code }));
  });
}
async function installDeps(
  projectPath: string,
  deps: string[] | undefined,
  dev: boolean | undefined,
  hintedPm: "npm" | "pnpm" | "yarn" | "bun" | undefined,
  dry: boolean,
  logger: Logger
) {
  if (!deps || deps.length === 0) return { skipped: true, reason: "no-deps" };
  const pm = detectPackageManager(projectPath, hintedPm);
  const devFlag = dev ? "dev" : undefined;

  let cmd = pm;
  let args: string[] = [];
  if (pm === "npm") {
    args = ["install", ...deps, dev ? "--save-dev" : "--save"];
  } else if (pm === "pnpm") {
    args = ["add", ...deps];
    if (devFlag) args.push("-D");
  } else if (pm === "yarn") {
    args = ["add", ...deps];
    if (devFlag) args.push("-D");
  } else if (pm === "bun") {
    args = ["add", ...deps];
    if (devFlag) args.push("-d");
  }

  logger.info?.(`📦 (${pm}) installing ${dev ? "devDependencies" : "dependencies"}: ${deps.join(", ")}`);
  if (dry) return { pm, args, changed: true };

  const { code } = await spawnPromise(cmd, args, projectPath, {}, "inherit");
  if (code !== 0) throw new Error(`Install failed: ${pm} ${args.join(" ")}`);
  return { pm, args, changed: true };
}
async function deleteTarget(baseDir: string, relTarget: string, dry: boolean) {
  const file = path.join(baseDir, relTarget);
  const exists = await fs.pathExists(file);
  if (!exists) return { file, skipped: true, reason: "missing" };
  if (dry) return { file, changed: true };
  await fs.remove(file);
  return { file, changed: true };
}
async function runCmd(
  baseDir: string,
  cmd: string,
  args: string[] = [],
  env: Record<string, string> = {},
  stdio: "inherit" | "pipe" = "inherit",
  timeoutMs?: number,
  dry?: boolean
) {
  if (dry) return { cmd, args, changed: true };
  let timeoutId: NodeJS.Timeout | undefined;
  const child = spawn(cmd, args, { cwd: baseDir, env: { ...process.env, ...env }, stdio, shell: process.platform === "win32" });
  const done = new Promise<{ code: number | null }>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve({ code }));
  });
  if (timeoutMs && timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {}
    }, timeoutMs);
  }
  const res = await done;
  if (timeoutId) clearTimeout(timeoutId);
  if (res.code !== 0) throw new Error(`Command failed: ${cmd} ${args.join(" ")}`);
  return { changed: true };
}

// ───────────────────────── 실행기 본체 ─────────────────────────
export class PlanExecutor {
  constructor(private readonly logger: Logger) {}

  async execute(plan: MigrationPlan, options: MigrationOptions): Promise<void> {
    const projectPath = options.projectPath;
    const dry = isDry(options);

    for (const step of plan.steps as unknown as PatchStep[]) {
      try {
        switch (step.type) {
          case "json.merge": {
            this.logger.info?.(`🧩 json.merge → ${step.file}`);
            const r = await jsonMerge(projectPath, step.file, step.merge, dry);
            if (r.changed) this.logger.success(`  updated ${step.file}${dry ? " (dry)" : ""}`);
            else this.logger.info(`  no change`);
            break;
          }
          case "create": {
            const target = step.target ?? step.file ?? "";
            this.logger.info?.(`📄 create → ${target}`);
            const r = await createFile(projectPath, target, step.content, !!step.overwrite, dry);
            if ((r as any).skipped) this.logger.warning(`  skipped (exists): ${target}`);
            else this.logger.success(`  created ${target}${dry ? " (dry)" : ""}`);
            break;
          }
          case "write": {
            this.logger.info?.(`✍️ write → ${step.file}`);
            await writeFile(projectPath, step.file, step.content, dry);
            this.logger.success(`  wrote ${step.file}${dry ? " (dry)" : ""}`);
            break;
          }
          case "append": {
            this.logger.info?.(`➕ append → ${step.file}`);
            await appendFile(projectPath, step.file, step.content, dry);
            this.logger.success(`  appended ${step.file}${dry ? " (dry)" : ""}`);
            break;
          }
          case "text.patch": {
            this.logger.info?.(`📝 text.patch → ${step.file}`);
            const r = await textPatch(projectPath, step, dry);
            if ((r as any).skipped) this.logger.info(`  skipped (${(r as any).reason})`);
            else this.logger.success(`  patched ${step.file}${dry ? " (dry)" : ""}`);
            break;
          }
          case "install": {
            const deps = step.deps ?? [];
            if (deps.length === 0) {
              this.logger.info("  nothing to install");
              break;
            }
            await installDeps(projectPath, deps, step.dev, step.pm, dry, this.logger);
            this.logger.success(`  installed ${deps.join(", ")}${dry ? " (dry)" : ""}`);
            break;
          }
          case "delete": {
            this.logger.info?.(`🗑️ delete → ${step.target}`);
            await deleteTarget(projectPath, step.target, dry);
            this.logger.success(`  deleted ${step.target}${dry ? " (dry)" : ""}`);
            break;
          }
          case "run": {
            this.logger.info?.(`🏃 run → ${step.cmd} ${(step.args || []).join(" ")}`);
            await runCmd(
              step.cwd ?? projectPath,
              step.cmd,
              step.args,
              step.env ?? {},
              step.stdio ?? "inherit",
              step.timeoutMs,
              dry
            );
            this.logger.success(`  run done${dry ? " (dry)" : ""}`);
            break;
          }

          // ── 레거시 호환 ──────────────────────────────
          case "modify": {
            const file = path.join(projectPath, step.target);
            this.logger.info?.(`🛠️ modify(legacy) → ${step.target}`);
            if (!dry) {
              await fs.ensureDir(path.dirname(file));
              await fs.writeFile(file, step.content);
            }
            this.logger.success(`  modified ${step.target}${dry ? " (dry)" : ""}`);
            break;
          }
          case "copy": {
            const target = path.join(projectPath, step.target);
            this.logger.info?.(`📦 copy(legacy) → ${step.target}`);
            if (!dry) {
              await fs.ensureDir(path.dirname(target));
              await fs.writeFile(target, step.content ?? "");
            }
            this.logger.success(`  copied ${step.target}${dry ? " (dry)" : ""}`);
            break;
          }
          case "install-old": {
            await installDeps(projectPath, [step.pkg], step.dev, undefined, dry, this.logger);
            this.logger.success(`  installed ${step.pkg}${dry ? " (dry)" : ""}`);
            break;
          }
          case "exec": {
            this.logger.info?.(`⚙️ exec(legacy) → ${step.cmd}`);
            await runCmd(step.cwd ?? projectPath, step.cmd, step.args ?? [], {}, "inherit", undefined, dry);
            this.logger.success(`  exec done${dry ? " (dry)" : ""}`);
            break;
          }

          default:
            this.logger.warning(`⚠️ unknown step type: ${(step as any).type}`);
        }
      } catch (e: any) {
        this.logger.error?.(`❌ step failed (${(step as any).type}): ${e?.message || e}`);
        if ((step as any).required) throw e;
      }
    }
  }
}
