// golden/scripts/test-runner.ts
import fs from "fs-extra";
import path from "path";
import os from "os";
import * as http from "node:http";
import AdmZip from "adm-zip";
import fg from "fast-glob";
import { runOrThrow } from "./exec.js";
import { detectProject } from "./detectors.js";
import getPort from "get-port";
import killPort from "kill-port";
import pc from "picocolors";
import net from "node:net";
import { pathToFileURL } from "node:url";

/* ========================= Types =======================*/
type Result = {
  file: string;
  framework: string;
  installMs: number;
  buildMs: number;
  runMs: number;
  healthMs: number;
  ok: boolean;
  error?: string;
  port: number;
  healthUrl: string;
};

/* ========================= Utils =======================*/
function isIgnorableKillError(err: unknown) {
  const msg = String((err as any)?.message || err || "");
  return msg.includes("ESRCH") || msg.includes("not found") || msg.includes("No matching processes");
}

async function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(true));
    srv.once("listening", () => {
      srv.close(() => resolve(false));
    });
    srv.listen(port, "127.0.0.1");
  });
}

async function safeKillPort(port: number) {
  try {
    if (port && (await isPortInUse(port))) await killPort(port, "tcp");
  } catch (e) {
    if (!isIgnorableKillError(e)) throw e;
  }
}

function safeKillPid(pid?: number) {
  if (!pid || Number.isNaN(pid)) return;
  try {
    process.kill(pid, 0);
    process.kill(pid, "SIGTERM");
  } catch (e) {
    if (!isIgnorableKillError(e)) throw e;
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch (e) {
    if (!isIgnorableKillError(e)) throw e;
  }
}

async function httpGet(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode || 0);
    });
    req.on("error", reject);
  });
}

async function waitForHealth(url: string, timeoutMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const code = await httpGet(url);
      if (code && code < 500) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

/** 로그에서 실제 포트를 최대한 유연하게 추출 (강화판) */
async function detectPortFromLog(logFile: string): Promise<number | null> {
  try {
    const txt = await fs.readFile(logFile, "utf8");
    const patterns = [
      /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):(\d{2,5})/i,
      /listening\s+on\s+(?:address|port)?\s*[:=]?\s*(\d{2,5})/i,
      /listening\s+at[^\n:]*:(\d{2,5})/i,
      /server\s+(?:started|running|listening)[^\n:]*[:\s](\d{2,5})/i,
      /started\s+on[^\n:]*[:\s](\d{2,5})/i,
      /express server listening on[:\s]*(\d{2,5})/i,
      /port[:=]\s*(\d{2,5})/i,
      /Local:\s*http:\/\/localhost:(\d{2,5})/i,
    ];
    for (const re of patterns) {
      const m = txt.match(re);
      if (m?.[1]) return Number(m[1]);
    }
  } catch {}
  return null;
}

/** package.json scripts.dev에서 ts-node/ts-node-dev/nodemon 뒤 엔트리 경로 추출 */
function extractTsEntryFromDevScript(pkg: any): string | null {
  const dev = String(pkg?.scripts?.dev || "");
  const m =
    dev.match(/\b(ts-node-dev|ts-node|nodemon)\s+([^\s'"]+\.(?:ts|mts|tsx))\b/) ||
    dev.match(/\bnode\s+([^\s'"]+\.(?:mjs|cjs|js))\b/);
  if (!m) return null;
  return m[2] || m[1] || null;
}

/* ======= CRA 감지 및 Vite 플러그인 처리 ======= */
async function readJsonSafe(p: string) {
  try {
    return await fs.readJson(p);
  } catch {
    return undefined;
  }
}

function isCRAProject(pkg: any) {
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  return deps["react-scripts"] !== undefined;
}

async function detectViteReactPluginName(
  appRoot: string
): Promise<null | "@vitejs/plugin-react" | "@vitejs/plugin-react-swc"> {
  const files = await fg(["vite.config.{ts,js,mjs,cjs,mts}"], { cwd: appRoot, dot: true });
  for (const f of files) {
    const s = await fs.readFile(path.join(appRoot, f), "utf8");
    if (/\b@vitejs\/plugin-react-swc\b/.test(s)) return "@vitejs/plugin-react-swc";
    if (/\b@vitejs\/plugin-react\b/.test(s)) return "@vitejs/plugin-react";
  }
  return null;
}

async function hasViteConfig(appRoot: string) {
  const files = await fg(["vite.config.{ts,js,mjs,cjs,mts}"], { cwd: appRoot, dot: true });
  return files.length > 0;
}

function looksLikeVite(pkg: any, detDevCmd: string, appHasViteConfig: boolean) {
  const devScript = pkg?.scripts?.dev || "";
  return /\bvite(\s|$)/i.test(detDevCmd) || /\bvite(\s|$)/i.test(devScript) || appHasViteConfig;
}

async function ensureViteReactPluginInstalled(appRoot: string, runner: "pnpm" | "yarn" | "npm") {
  const pluginName = await detectViteReactPluginName(appRoot);
  if (!pluginName) return;
  const pj = await readJsonSafe(path.join(appRoot, "package.json"));
  const hasPlugin = pj?.devDependencies?.[pluginName] || pj?.dependencies?.[pluginName];
  if (!hasPlugin) {
    console.log(pc.yellow(`Auto-installing missing ${pluginName}...`));
    await ensureDeps(appRoot, [pluginName], true, runner);
  }
}

function pickRunner(appRoot: string, pkg?: any): "pnpm" | "yarn" | "npm" {
  const pm = pkg?.packageManager || "";
  if (pm.startsWith("pnpm") || fs.existsSync(path.join(appRoot, "pnpm-lock.yaml"))) return "pnpm";
  if (pm.startsWith("yarn") || fs.existsSync(path.join(appRoot, "yarn.lock"))) return "yarn";
  return "npm";
}

async function ensureDeps(appRoot: string, pkgs: string[], dev = true, runner: "pnpm" | "yarn" | "npm" = "npm") {
  if (!pkgs.length) return;
  const flag = dev ? "-D " : "";
  const cmd =
    runner === "pnpm"
      ? `pnpm add ${flag}${pkgs.join(" ")}`
      : runner === "yarn"
      ? `yarn add ${flag}${pkgs.join(" ")}`
      : `npm i ${flag}${pkgs.join(" ")}`;
  await runOrThrow("bash", ["-lc", cmd], { cwd: appRoot });
}

/* ======= Vite ESM config & base ======= */
async function ensureViteConfigESM(appRoot: string): Promise<string | null> {
  const list = await fg(["vite.config.{mts,mjs,ts,js}"], { cwd: appRoot, dot: true });
  const esm = list.find((f) => f.endsWith(".mts") || f.endsWith(".mjs"));
  if (esm) return path.join(appRoot, esm);

  const tsOrJs = list.find((f) => f.endsWith(".ts")) || list.find((f) => f.endsWith(".js"));
  if (!tsOrJs) return null;

  const src = path.join(appRoot, tsOrJs);
  const dst = src.replace(/\.ts$/, ".mts").replace(/\.js$/, ".mjs");
  await fs.copy(src, dst);
  console.log(pc.yellow(`Created ESM config: ${path.basename(dst)} (copied from ${path.basename(src)})`));
  return dst;
}

async function readViteBase(appRoot: string): Promise<string | null> {
  const files = await fg(["vite.config.{ts,js,mts,mjs,cjs}"], { cwd: appRoot, dot: true });
  for (const f of files) {
    const s = await fs.readFile(path.join(appRoot, f), "utf8");
    const m = s.match(/\bbase\s*:\s*['"]([^'"]+)['"]/);
    if (m?.[1]) return m[1];
  }
  return null;
}

async function viteConfigFlag(appRoot: string): Promise<string> {
  const esm = await fg(["vite.config.{mts,mjs}"], { cwd: appRoot, dot: true });
  if (esm.length) return `--config ${esm[0]}`;
  return "";
}

/* ========================= CLI =======================*/
const argv = process.argv.slice(2);
const onlyIdx = argv.findIndex((a) => a === "--only");
const onlyName = onlyIdx >= 0 ? argv[onlyIdx + 1] : undefined;
const HEALTH_TIMEOUT = 120_000;

/* ========================= Main =======================*/
const ZIP_DIR = process.env.ZIP_DIR ? path.resolve(process.env.ZIP_DIR) : path.resolve("golden/zips");
const OUT_DIR = path.resolve("golden/results");
await fs.ensureDir(OUT_DIR);

const allZipFiles = await fg(["**/*.zip"], { cwd: ZIP_DIR, absolute: true });
const zipFiles = onlyName ? allZipFiles.filter((p) => path.basename(p) === onlyName) : allZipFiles;

console.log(pc.cyan(`Found ${zipFiles.length} zips in ${ZIP_DIR}${onlyName ? ` (filtered by --only ${onlyName})` : ""}`));

/* 헬스체크 강화 */
async function startAndWait(
  devCmd: string,
  logFile: string,
  envPrefix: string,
  cwd: string,
  healthUrl: string,
  timeoutMs: number,
  extraHealthUrls: string[] = []
) {
  const r0 = Date.now();
  const startCmd = `nohup env ${envPrefix} ${devCmd} > "${logFile}" 2>&1 & echo $!`;
  const childOut = await runOrThrow("bash", ["-lc", startCmd], { cwd });
  const pid = Number((childOut.stdout || "").trim().split("\n").pop());
  const runMs = Date.now() - r0;

  const h0 = Date.now();
  let ok = await waitForHealth(healthUrl, timeoutMs);

  if (!ok && /\/$/.test(healthUrl)) {
    const alt = healthUrl.replace(/\/$/, "") + "/index.html";
    ok = await waitForHealth(alt, Math.min(10_000, timeoutMs));
  }
  for (const u of extraHealthUrls) {
    if (ok) break;
    ok = await waitForHealth(u, Math.min(10_000, timeoutMs));
  }

  const healthMs = Date.now() - h0;
  return { pid, runMs, ok, healthMs };
}

/* ========================= Core Loop =======================*/
const results: Result[] = [];

for (const zipPath of zipFiles) {
  const name = path.basename(zipPath);
  console.log(pc.bold(`\n▶ ${name}`));
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "golden-"));
  let pid: number | undefined;
  let port = 0;

  try {
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(tmp, true);

    const candidates = await fg(["**/package.json"], { cwd: tmp, absolute: true, dot: true });
    if (!candidates.length) throw new Error("package.json not found");
    const appRoot = path.dirname(candidates[0]);
    const det = await detectProject(appRoot);

    const toInt = (v: any): number => Math.trunc(Number(v)) || NaN;
    let base = toInt(det.port);
    if (!Number.isFinite(base)) base = 3000;
    port = await getPort({ port: base });

    const healthPath = det.healthPath || "/";
    let healthUrl = `http://127.0.0.1:${port}${healthPath}`;
    const logFile = path.join(os.tmpdir(), `golden-dev-${port}.log`);
    const envPrefix = `PORT=${port} HOST=127.0.0.1`;

    const pkg = await readJsonSafe(path.join(appRoot, "package.json"));
    const runner = pickRunner(appRoot, pkg);
    const appHasViteCfg = await hasViteConfig(appRoot);

    const isVite = looksLikeVite(pkg, det.devCmd, appHasViteCfg);
    const isNext = /\bnext\s+dev\b/i.test(det.devCmd) || /(^|\s)next(\s|$)/i.test(pkg?.scripts?.dev || "");
    const isCRA = isCRAProject(pkg);

    let baseCmd = "npm run dev";
    if (pkg?.scripts?.dev) baseCmd = `${runner} run dev`;
    else if (isCRA && pkg?.scripts?.start) baseCmd = `${runner} run start`;
    else if (isNext) baseCmd = "npx -y next dev";
    else if (isVite) baseCmd = "npx -y vite";

    const extraArgs = isVite
      ? ["--port", String(port), "--host", "127.0.0.1", "--strictPort"]
      : isNext
      ? ["-p", String(port), "-H", "127.0.0.1"]
      : [];

    const finalDev = baseCmd + (extraArgs.length ? " -- " + extraArgs.join(" ") : "");

    console.log(pc.dim(`dev: ${finalDev}`));
    console.log(pc.dim(`log: ${logFile}`));
    console.log(pc.dim(`health: ${healthUrl}`));

    // install
    const installCmd =
      runner === "pnpm"
        ? "pnpm i --frozen-lockfile || pnpm i"
        : runner === "yarn"
        ? "yarn install --frozen-lockfile || yarn install"
        : "npm ci || npm i";
    const t0 = Date.now();
    await runOrThrow("bash", ["-lc", installCmd], { cwd: appRoot });
    let installMs = Date.now() - t0;

    if (isVite) {
      const tFix = Date.now();
      await ensureViteReactPluginInstalled(appRoot, runner);
      installMs += Date.now() - tFix;
    }

    // run dev
    let buildMs = 0;
    let { pid: pid1, runMs, ok, healthMs } = await startAndWait(
      finalDev,
      logFile,
      envPrefix,
      appRoot,
      healthUrl,
      HEALTH_TIMEOUT
    );
    pid = pid1;

    // dev 로그에서 실제 포트 자동 감지
    try {
      const logTxt = await fs.readFile(logFile, "utf8");
      const m = logTxt.match(/Local:\s+http:\/\/localhost:(\d+)/i);
      if (m) {
        const actual = Number(m[1]);
        if (actual && actual !== port) {
          console.log(pc.yellow(`⚠️  Detected port mismatch: requested ${port}, actual ${actual}`));
          port = actual;
          healthUrl = `http://127.0.0.1:${port}/`;
          ok =
            ok ||
            (await waitForHealth(`http://localhost:${port}/`, 10_000)) ||
            (await waitForHealth(`http://localhost:${port}/index.html`, 10_000));
        }
      }
    } catch {}

    // ---- Vite fallback: build + preview ----
    if (!ok && isVite) {
      console.log(pc.yellow("dev failed → vite build + preview retry..."));
      await safeKillPort(port);
      safeKillPid(pid);

      const esmPath = await ensureViteConfigESM(appRoot);
      const cfgFlag = esmPath ? await viteConfigFlag(appRoot) : "";

      const tFix2 = Date.now();
      await ensureViteReactPluginInstalled(appRoot, runner);
      installMs += Date.now() - tFix2;

      const baseBuild = pkg?.scripts?.build ? `${runner} run build` : "npx -y vite build";
      const buildCmd = cfgFlag ? `${baseBuild} -- ${cfgFlag}` : baseBuild;
      const tb = Date.now();
      try {
        await runOrThrow("bash", ["-lc", buildCmd], { cwd: appRoot });
      } catch (err: any) {
        const msg = String(err?.stderr || err?.stdout || err?.message || err);
        const missingReactPlugin =
          /(Cannot\s+find\s+(module|package)[^'\n"]*@vitejs\/plugin-react(?:-swc)?|ERR_MODULE_NOT_FOUND[^\n]*@vitejs\/plugin-react(?:-swc)?)/i.test(
            msg
          );

        if (missingReactPlugin) {
          console.log(pc.yellow("Missing Vite react plugin → installing and retrying build..."));
          await ensureDeps(appRoot, ["@vitejs/plugin-react"], true, runner);
          await ensureDeps(appRoot, ["@vitejs/plugin-react-swc"], true, runner);
          await runOrThrow("bash", ["-lc", buildCmd], { cwd: appRoot });
        } else if (/ESM file cannot be loaded by `require`/i.test(msg)) {
          const cfg = await viteConfigFlag(appRoot);
          if (cfg) {
            await runOrThrow("bash", ["-lc", `${baseBuild} -- ${cfg}`], { cwd: appRoot });
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }
      buildMs += Date.now() - tb;

      const basePreview = pkg?.scripts?.preview ? `${runner} run preview` : "npx -y vite preview";
      const previewCmd = cfgFlag ? `${basePreview} -- ${cfgFlag}` : basePreview;
      const finalPreview = previewCmd + (extraArgs.length ? " -- " + extraArgs.join(" ") : "");
      const logFile2 = logFile.replace(/dev-(\d+)/, "preview-$1");

      const basePath = await readViteBase(appRoot);
      const extraHealth: string[] = [
        `http://localhost:${port}/`,
        `http://localhost:${port}/index.html`,
      ];
      if (basePath) {
        const norm = basePath.endsWith("/") ? basePath : basePath + "/";
        extraHealth.push(`http://127.0.0.1:${port}${norm}`);
        extraHealth.push(`http://127.0.0.1:${port}${norm}index.html`);
        extraHealth.push(`http://localhost:${port}${norm}`);
        extraHealth.push(`http://localhost:${port}${norm}index.html`);
      }

      const r2 = await startAndWait(
        finalPreview,
        logFile2,
        envPrefix,
        appRoot,
        healthUrl,
        HEALTH_TIMEOUT,
        extraHealth
      );
      pid = r2.pid;
      runMs += r2.runMs;
      ok = r2.ok;
      healthMs = r2.healthMs;

      try {
        const txt2 = await fs.readFile(logFile2, "utf8");
        const m2 = txt2.match(/Local:\s+http:\/\/localhost:(\d+)/i);
        if (m2) {
          const actual2 = Number(m2[1]);
          if (actual2 && actual2 !== port) {
            console.log(pc.yellow(`⚠️  Preview port mismatch: requested ${port}, actual ${actual2}`));
            port = actual2;
            healthUrl = `http://127.0.0.1:${port}/`;
            ok =
              ok ||
              (await waitForHealth(healthUrl, 10_000)) ||
              (await waitForHealth(`http://localhost:${port}/`, 10_000)) ||
              (await waitForHealth(`http://localhost:${port}/index.html`, 10_000));
          }
        }
      } catch {}
    }

    /* ---- Express fallback (only) ---- */
    if (!ok && det.framework === "express") {
      console.log(pc.yellow("Express fallback → probing multiple health paths & port re-detect"));

      const candidates = ["/api/ping", "/api/health", "/health", "/ping", "/status", "/"];
      const defaultPorts = [4000, 3000, 5000, 5173, 8080, 8000];

      // 1) 로그에서 실제 포트 1차 재탐지
      {
        const guessed = await detectPortFromLog(logFile);
        if (guessed && guessed !== port) {
          console.log(pc.yellow(`⚠️  Detected port mismatch: requested ${port}, actual ${guessed}`));
          port = guessed;
        }
      }

      // 2) 현재 port로 여러 헬스 경로 재체크
      for (const p of candidates) {
        if (ok) break;
        const u1 = `http://127.0.0.1:${port}${p}`;
        const u2 = `http://localhost:${port}${p}`;
        ok = (await waitForHealth(u1, 6000)) || (await waitForHealth(u2, 6000));
        if (ok) {
          healthUrl = u1;
        }
      }

      // 2.5) 흔한 포트 빠른 스캔
      if (!ok) {
        for (const prt of defaultPorts) {
          if (prt === port) continue;
          for (const p of candidates) {
            if (ok) break;
            const u1 = `http://127.0.0.1:${prt}${p}`;
            const u2 = `http://localhost:${prt}${p}`;
            if ((await waitForHealth(u1, 3000)) || (await waitForHealth(u2, 3000))) {
              console.log(pc.yellow(`⚠️  Port scan hit: using ${prt}`));
              port = prt;
              ok = true;
              healthUrl = u1;
            }
          }
          if (ok) break;
        }
      }

      // 3) NODE_OPTIONS 확장 재기동
      if (!ok) {
        console.log(pc.yellow('Restarting Express with NODE_OPTIONS="--experimental-modules --es-module-specifier-resolution=node"'));
        await safeKillPort(port);
        safeKillPid(pid);

        const envPrefix2 =
          `NODE_OPTIONS="--experimental-modules --es-module-specifier-resolution=node" ` +
          `PORT=${port} HOST=127.0.0.1`;

        const altHealth = `http://127.0.0.1:${port}/`;
        const extra = candidates.flatMap((p) => [
          `http://127.0.0.1:${port}${p}`,
          `http://localhost:${port}${p}`,
        ]);

        const r3 = await startAndWait(`${runner} run dev`, logFile, envPrefix2, appRoot, altHealth, 25_000, extra);
        pid = r3.pid;
        ok = r3.ok;
        healthMs += r3.healthMs;
        healthUrl = altHealth;

        if (!ok) {
          const guessed2 = await detectPortFromLog(logFile);
          if (guessed2 && guessed2 !== port) {
            console.log(pc.yellow(`⚠️  Detected port mismatch after restart: requested ${port}, actual ${guessed2}`));
            port = guessed2;
            for (const p of candidates) {
              const u = `http://127.0.0.1:${port}${p}`;
              if (await waitForHealth(u, 8000)) {
                ok = true;
                healthUrl = u;
                break;
              }
            }
          }
          if (!ok) {
            try {
              const tail = (await fs.readFile(logFile, "utf8")).split("\n").slice(-80).join("\n");
              console.log(pc.gray("\n--- log tail ---\n" + tail + "\n----------------\n"));
            } catch {}
          }
        }
      }

      // 4) npm 스크립트 우회 → 엔트리 직접 기동
      if (!ok) {
        await safeKillPort(port);
        safeKillPid(pid);

        const parsedEntry = extractTsEntryFromDevScript(pkg);
        const entries = await fg(
          [
            "server.{js,mjs,cjs,ts,tsx}",
            "app.{js,mjs,cjs,ts,tsx}",
            "index.{js,mjs,cjs,ts,tsx}",
            "src/server.{js,mjs,cjs,ts,tsx}",
            "src/app.{js,mjs,cjs,ts,tsx}",
            "src/index.{js,mjs,cjs,ts,tsx}",
            "srv/index.{js,mjs,cjs,ts,tsx}",
            "api/index.{js,mjs,cjs,ts,tsx}",
            "bin/www",
          ],
          { cwd: appRoot, dot: true }
        );
        const entry = parsedEntry || entries[0];

        if (entry) {
          const isTs = /\.(ts|tsx|mts)$/.test(entry);
          const isBin = entry === "bin/www";
          const cmdTsx = isBin ? `node bin/www` : (isTs ? `npx -y tsx ${entry}` : `node ${entry}`);

          const envPrefix3 =
            `NODE_OPTIONS="--experimental-modules --es-module-specifier-resolution=node" ` +
            `PORT=${port} HOST=127.0.0.1`;

          console.log(pc.yellow(`Retry with plain process: ${isBin ? "node bin/www" : cmdTsx}`));
          let r4 = await startAndWait(
            cmdTsx,
            logFile,
            envPrefix3,
            appRoot,
            `http://127.0.0.1:${port}/`,
            25_000,
            candidates.flatMap((p) => [
              `http://127.0.0.1:${port}${p}`,
              `http://localhost:${port}${p}`,
            ])
          );
          pid = r4.pid;
          ok = r4.ok;
          healthMs += r4.healthMs;

          // ❗ 실패 시: CJS(require shim) → ESM(ts-node/esm) → ESM+require shim(최후)
          if (!ok) {
            let tailTxt = "";
            try { tailTxt = await fs.readFile(logFile, "utf8"); } catch {}
            const needsRetry =
              /require is not defined in ES module scope/i.test(tailTxt) ||
              /Must use import to load ES Module/i.test(tailTxt) ||
              /ERR_UNKNOWN_FILE_EXTENSION/i.test(tailTxt);

            if (needsRetry) {
              await safeKillPort(port);
              safeKillPid(pid);

              try {
                await runOrThrow("bash", ["-lc", `${runner} ls ts-node || npx -y ts-node -v || true`], { cwd: appRoot });
              } catch {
                await ensureDeps(appRoot, ["ts-node"], true, runner);
              }

              const absEntry = path.posix.join(appRoot.replace(/\\/g, "/"), entry.replace(/\\/g, "/"));
              const fileHref = pathToFileURL(absEntry).href;

              // 4-1) CJS(require shim)
              const tsNodeEnv =
                `TS_NODE_TRANSPILE_ONLY=1 ` +
                `TS_NODE_COMPILER_OPTIONS='{\"module\":\"commonjs\",\"moduleResolution\":\"node\",\"esModuleInterop\":true,\"allowSyntheticDefaultImports\":true}' `;
              const cjsShimCmd = `${tsNodeEnv} node -r ts-node/register/transpile-only -e "require('${absEntry}')"`;

              console.log(pc.yellow(`Retry with CJS transpile (require shim): ${cjsShimCmd}`));
              let r5 = await startAndWait(
                cjsShimCmd,
                logFile,
                envPrefix3,
                appRoot,
                `http://127.0.0.1:${port}/`,
                25_000,
                candidates.flatMap((p) => [
                  `http://127.0.0.1:${port}${p}`,
                  `http://localhost:${port}${p}`,
                ])
              );
              pid = r5.pid;
              ok = r5.ok;
              healthMs += r5.healthMs;

              // 4-2) ESM(ts-node/esm)
              if (!ok) {
                await safeKillPort(port);
                safeKillPid(pid);

                const tsNodeEsmEnv =
                  `TS_NODE_TRANSPILE_ONLY=1 ` +
                  `TS_NODE_COMPILER_OPTIONS='{\"module\":\"nodenext\",\"moduleResolution\":\"nodenext\",\"esModuleInterop\":true,\"allowSyntheticDefaultImports\":true}' `;
                const esmCmd = `${tsNodeEsmEnv} node --loader ts-node/esm ${entry}`;

                console.log(pc.yellow(`Retry with ESM loader (ts-node/esm): ${esmCmd}`));
                r5 = await startAndWait(
                  esmCmd,
                  logFile,
                  envPrefix3,
                  appRoot,
                  `http://127.0.0.1:${port}/`,
                  25_000,
                  candidates.flatMap((p) => [
                    `http://127.0.0.1:${port}${p}`,
                    `http://localhost:${port}${p}`,
                  ])
                );
                pid = r5.pid;
                ok = r5.ok;
                healthMs += r5.healthMs;
              }

              // 4-3) 최후: ESM + require shim (createRequire로 글로벌 require 제공)
              if (!ok) {
                await safeKillPort(port);
                safeKillPid(pid);

                const tsNodeEsmEnv2 =
                  `TS_NODE_TRANSPILE_ONLY=1 ` +
                  `TS_NODE_COMPILER_OPTIONS='{\"module\":\"nodenext\",\"moduleResolution\":\"nodenext\",\"esModuleInterop\":true,\"allowSyntheticDefaultImports\":true}' `;

                // Node 22의 경고 회피는 필요시 --import 방식으로 바꿀 수 있으나, 여기선 -e 인라인이 간단.
                const esmShimCmd =
                  `${tsNodeEsmEnv2}` +
                  `node --loader ts-node/esm ` +
                  `-e "import { createRequire } from 'node:module'; import { pathToFileURL } from 'node:url'; import * as path from 'node:path'; ` +
                  `const entry='${absEntry}'; process.chdir(path.dirname(entry)); ` +
                  `globalThis.require = createRequire(pathToFileURL(entry).href); ` +
                  `await import(pathToFileURL(entry).href)"`;
                  
                console.log(pc.yellow(`Retry with ESM loader + require shim: ${esmShimCmd}`));
                const r6 = await startAndWait(
                  esmShimCmd,
                  logFile,
                  envPrefix3,
                  appRoot,
                  `http://127.0.0.1:${port}/`,
                  25_000,
                  candidates.flatMap((p) => [
                    `http://127.0.0.1:${port}${p}`,
                    `http://localhost:${port}${p}`,
                  ])
                );
                pid = r6.pid;
                ok = r6.ok;
                healthMs += r6.healthMs;
              }
            }
          }

          if (!ok) {
            const guessed3 = await detectPortFromLog(logFile);
            if (guessed3 && guessed3 !== port) {
              console.log(pc.yellow(`⚠️  Detected port mismatch (plain): requested ${port}, actual ${guessed3}`));
              port = guessed3;
              for (const p of candidates) {
                const u = `http://127.0.0.1:${port}${p}`;
                if (await waitForHealth(u, 8000)) {
                  ok = true;
                  healthUrl = u;
                  break;
                }
              }
            }
            if (!ok) {
              try {
                const tail = (await fs.readFile(logFile, "utf8")).split("\n").slice(-120).join("\n");
                console.log(pc.gray("\n--- log tail ---\n" + tail + "\n----------------\n"));
              } catch {}
            }
          }
        } else {
          console.log(pc.yellow("No direct entry file found (dev script parse & glob both failed)."));
        }
      }
    }
    /* ---- /Express fallback ---- */

    results.push({ file: name, framework: det.framework, installMs, buildMs, runMs, healthMs, ok, port, healthUrl });
    await safeKillPort(port);
    safeKillPid(pid);
  } catch (e: any) {
    results.push({
      file: path.basename(zipPath),
      framework: "unknown",
      installMs: 0,
      buildMs: 0,
      runMs: 0,
      healthMs: 0,
      ok: false,
      error: String(e),
      port: 0,
      healthUrl: ""
    });
    console.error(pc.red(String(e)));
    await safeKillPort(port);
    safeKillPid(pid);
  }
}

/* ========================= Summary =======================*/
const stamp = Date.now();
const outFile = path.join(OUT_DIR, `result-${stamp}.json`);
await fs.writeJson(outFile, { stamp, results }, { spaces: 2 });
console.log(pc.green(`\nSaved ${outFile}`));

let fail = 0;
console.log(pc.bold(pc.cyan("\nSummary")));
for (const r of results) {
  const status = r.ok ? pc.green("OK") : pc.red("FAIL");
  if (!r.ok) fail++;
  console.log(
    `${r.file}  ${pc.dim(r.framework)}  ${status}  install=${r.installMs}ms build=${r.buildMs}ms run=${r.runMs}ms health=${r.healthMs}ms port=${r.port} ${r.healthUrl}`
  );
}
console.log(pc.bold(`\nTotal: ${results.length}, OK: ${results.length - fail}, FAIL: ${fail}`));
if (fail > 0) process.exitCode = 1;
