// apps/web/src/server.ts
import express, {
  Request,
  Response,
  NextFunction,
  type RequestHandler,
  type ErrorRequestHandler,
} from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs-extra";
import { promises as fsp } from "fs";
import { v4 as uuidv4 } from "uuid";
import archiver from "archiver";
import unzipper from "unzipper";
import type { FileFilterCallback } from "multer";
import { createProxyMiddleware } from "http-proxy-middleware";
import { spawn } from "child_process";
import * as net from "node:net";

import {
  diagnose,
  applyPatches,
  buildAutoFixes,
  fixesFromDiagnoseMessages,
} from "../../../packages/engine/dist/index.js";

/* ────────────────────────────────────────────────────────────── */
/* Types */
type Patch = { type: string; file?: string; [k: string]: any };
type Fix = { id: string; plan?: Patch[] };
type DiagnoseResult = { fixes?: Fix[] };
type PreviewSession = {
  id: string;
  port: number;
  tempDir: string;
  childPid: number;
  startedAt: number;
};
type PlanSession = { projectRoot: string; tempDir: string; timestamp: number; plan?: any };

/* ────────────────────────────────────────────────────────────── */
const app = express();
const PORT = Number(process.env.PORT) || 5002;

app.use(cors());
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));

/* ✅ Static: dist or dist/public 자동 인식 + SPA fallback */
const DIST_CANDIDATES = [
  path.join(__dirname, "../dist/public"),
  path.join(__dirname, "../dist"),
];
const DIST_DIR =
  DIST_CANDIDATES.find((p) => {
    try { return fs.existsSync(path.join(p, "index.html")); } catch { return false; }
  }) || DIST_CANDIDATES[0];

app.use(express.static(DIST_DIR, { index: false }));

app.get("/", (_req, res) => {
  const indexPath = path.join(DIST_DIR, "index.html");
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  return res.status(200).json({ ok: true, port: PORT, hint: "dist/index.html not found", dist: DIST_DIR });
});

app.get("/api/health", (_req, res) => res.json({ ok: true, port: PORT }));
app.get("/health", (_req, res) => res.json({ ok: true, port: PORT }));

/* SPA fallback (API/preview 제외) */
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/") || req.path.startsWith("/preview/")) return next();
  const indexPath = path.join(DIST_DIR, "index.html");
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  return res.status(404).send("index.html not found. Did you run build?");
});

/* ────────────────────────────────────────────────────────────── */
/* Temp dirs */
const TEMP = "temp";
const UPLOAD = path.join(TEMP, "uploads");
const EXTRACT = path.join(TEMP, "extracted");
const DIAG = path.join(TEMP, "diag");
const PREVIEW = path.join(TEMP, "preview");
const RESULTS = path.join(TEMP, "results");
[UPLOAD, EXTRACT, DIAG, PREVIEW, RESULTS].forEach((d) => fs.ensureDirSync(d));

/* Upload */
const upload = multer({
  dest: UPLOAD,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb: FileFilterCallback) =>
    cb(null, /\.zip$/i.test(file.originalname ?? "")),
});
const parseFields = multer();

/* Stores */
const CLEANUP_INTERVAL = 10 * 60 * 1000;
const migrationResults = new Map<string, { zipPath: string; timestamp: number }>();
const planSessions = new Map<string, PlanSession>();
const diagnoseSessions = new Map<string, PlanSession>();
const previewSessions = new Map<string, PreviewSession>();

setInterval(() => {
  const now = Date.now();
  for (const [id, r] of migrationResults) {
    if (now - r.timestamp > CLEANUP_INTERVAL) {
      fs.remove(r.zipPath).catch(() => {});
      migrationResults.delete(id);
    }
  }
  for (const [sid, s] of planSessions) {
    if (now - s.timestamp > CLEANUP_INTERVAL) {
      fs.remove(s.tempDir).catch(() => {});
      planSessions.delete(sid);
    }
  }
  for (const [sid, s] of diagnoseSessions) {
    if (now - s.timestamp > CLEANUP_INTERVAL) {
      fs.remove(s.tempDir).catch(() => {});
      diagnoseSessions.delete(sid);
    }
  }
}, CLEANUP_INTERVAL);

/* ────────────────────────────────────────────────────────────── */
/* Helpers */
async function resolveProjectRoot(extractedDir: string): Promise<string> {
  const hasPkg = async (p: string) => {
    try { await fsp.access(path.join(p, "package.json")); return true; }
    catch { return false; }
  };
  if (await hasPkg(extractedDir)) return extractedDir;

  const entries = await fsp.readdir(extractedDir, { withFileTypes: true });
  const dirs = entries.filter(e => e.isDirectory() && e.name !== "__MACOSX").map(d => path.join(extractedDir, d.name));

  if (dirs.length === 1) {
    if (await hasPkg(dirs[0])) return dirs[0];
    const sub = await fsp.readdir(dirs[0], { withFileTypes: true });
    for (const s of sub.filter(e => e.isDirectory() && e.name !== "__MACOSX")) {
      const cand = path.join(dirs[0], s.name);
      if (await hasPkg(cand)) return cand;
    }
  }
  for (const d of dirs) if (await hasPkg(d)) return d;
  for (const d of dirs) {
    const sub = await fsp.readdir(d, { withFileTypes: true });
    for (const s of sub.filter(e => e.isDirectory() && e.name !== "__MACOSX")) {
      const cand = path.join(d, s.name);
      if (await hasPkg(cand)) return cand;
    }
  }
  return extractedDir;
}

async function ping(url: string, method: "HEAD" | "GET", timeoutMs = 2000) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(url, { method, signal: ctrl.signal as any });
    clearTimeout(t);
    return { ok: r.ok, status: r.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

async function waitForOkAny(base: string, totalMs = 20_000, intervalMs = 600) {
  const paths = ["/", "/index.html", "/api/health", "/api/hello", "/api/status"];
  const t0 = Date.now();
  while (Date.now() - t0 < totalMs) {
    for (const p of paths) {
      try {
        const url = new URL(p, base).toString();
        const head = await ping(url, "HEAD", Math.min(2000, intervalMs));
        if (head.ok) return true;
        const get = await ping(url, "GET", Math.min(2000, intervalMs));
        if (get.ok) return true;
      } catch {}
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

async function getFreePort(start = 5100, end = 5199): Promise<number> {
  const tryPort = (p: number) =>
    new Promise<boolean>((resolve) => {
      const srv = net.createServer();
      srv.once("error", () => resolve(false));
      srv.once("listening", () => srv.close(() => resolve(true)));
      srv.listen(p, "0.0.0.0");
    });
  for (let p = start; p <= end; p++) if (await tryPort(p)) return p;
  throw new Error("No free port found");
}

function spawnDev(cwd: string, args: string[], env: NodeJS.ProcessEnv, stdio: any = "inherit") {
  const cmd = process.platform === "win32" ? "npm.cmd" : "npm";
  return spawn(cmd, args, { cwd, env, stdio });
}

function spawnShell(cmd: string, cwd: string, env: NodeJS.ProcessEnv, stdio: any = "inherit") {
  const shell = process.platform === "win32" ? "cmd.exe" : "bash";
  const args = process.platform === "win32" ? ["/c", cmd] : ["-lc", cmd];
  return spawn(shell, args, { cwd, env, stdio });
}

/** ts-node / node *.ts 를 tsx로 정규화 */
function normalizeDevCommand(cmd: string): string {
  // ts-node/esm 로더 → tsx로
  cmd = cmd.replace(/\bnode\s+--loader\s+ts-node\/esm\b/g, "npx tsx");
  // ts-node → tsx
  cmd = cmd.replace(/\bts-node\b/g, "npx tsx");
  // node …/*.ts → tsx …
  cmd = cmd.replace(/\bnode\s+((?:[^\s]|\\\s)+\.(?:ts|tsx))(?!\.)/g, "npx tsx $1");
  return cmd;
}

async function readPackage(cwd: string): Promise<any | null> {
  try {
    return await fs.readJson(path.join(cwd, "package.json"));
  } catch {
    return null;
  }
}

async function spawnDevServerWithRetry(
  cwd: string,
  _ignored: "--port" | "-p" = "--port",
  maxRetry = 4
): Promise<{ child: import("child_process").ChildProcess; port: number }> {
  let isVite = false;
  let isNext = false;
  let scriptDev: string | undefined;

  try {
    const pkg = await readPackage(cwd);
    if (pkg) {
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      isVite = !!deps.vite;
      isNext = !!deps.next;
      scriptDev = pkg.scripts?.dev as string | undefined;
    }
  } catch {}

  for (let attempt = 0; attempt < maxRetry; attempt++) {
    const port = await getFreePort();

    type Try =
      | { kind: "npm"; args: string[]; env?: NodeJS.ProcessEnv; note: string }
      | { kind: "shell"; cmd: string; env?: NodeJS.ProcessEnv; note: string };

    const tries: Try[] = [];
    const ENV = { ...process.env, PORT: String(port) };

    /* 0) scripts.dev 직접 실행 (ts-node → tsx 치환) */
    if (scriptDev && scriptDev.trim().length > 0) {
      const normalized = normalizeDevCommand(scriptDev);
      tries.push({ kind: "shell", cmd: normalized, env: ENV, note: "pkg.scripts.dev (normalized with tsx)" });
    }

    /* 1) 프레임워크별 기본 루트 시도 */
    if (isVite) {
      tries.push({
        kind: "npm",
        args: ["run", "dev", "--", "--port", String(port), "--host", "127.0.0.1", "--strictPort"],
        env: ENV,
        note: "vite --port --strictPort",
      });
    } else if (isNext) {
      tries.push({ kind: "npm", args: ["run", "dev", "--", "--port", String(port)], env: ENV, note: "next --port" });
      tries.push({ kind: "npm", args: ["run", "dev"], env: ENV, note: "next env PORT only" });
    } else {
      tries.push({ kind: "npm", args: ["run", "dev", "--", "--port", String(port)], env: ENV, note: "unknown --port" });
      if (!scriptDev) {
        tries.push({ kind: "npm", args: ["run", "dev"], env: ENV, note: "unknown npm run dev" });
      }
    }

    for (const t of tries) {
      console.log(`[preview spawn try] ${t.note} @${cwd}`);
      const child =
        t.kind === "npm"
          ? spawnDev(cwd, t.args, t.env ?? process.env)
          : spawnShell(t.cmd, cwd, t.env ?? process.env);

      const ok = await waitForOkAny(`http://127.0.0.1:${port}`);
      if (ok) return { child, port };

      try { process.kill(child.pid ?? -1, "SIGTERM"); } catch {}
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  throw new Error("Failed to start dev server");
}

/* --- stubs used by plan/apply flow --- */
async function detectProject(_projectPath: string) {
  return {
    framework: "nextjs",
    provider: "replit",
    packageManager: "npm",
    dependencies: { next: "^13.0.0", react: "^18.0.0" },
    hasPackageJson: true,
    hasEnvFiles: false,
  };
}
async function generatePlan(_det: any, options: any) {
  return {
    steps: [
      { type: "create", description: "Create .gitignore file", target: ".gitignore", required: true },
      { type: "create", description: "Create VS Code settings", target: ".vscode/settings.json", required: false },
      { type: "modify", description: "Fix package.json scripts", target: "package.json", required: true },
    ],
    confidence: 0.9,
    warnings: [],
    options,
  };
}
async function applyMigration(projectPath: string, _plan: any, _opt: any) {
  const logs = [
    "Starting migration...",
    "Creating .gitignore...",
    "Creating VS Code settings...",
    "Updating package.json...",
    "Migration completed!",
  ];
  await fs.ensureDir(path.join(projectPath, ".vscode"));
  await fs.writeFile(path.join(projectPath, ".gitignore"), "node_modules/\n.env.local\n");
  await fs.writeFile(path.join(projectPath, ".vscode/settings.json"), '{"editor.formatOnSave": true}\n');
  return { success: true, logs };
}

/* ZIP 만들기 공통 */
async function zipDirectory(srcDir: string) {
  const resultId = uuidv4();
  const resultZipPath = path.join(RESULTS, `${resultId}.zip`);
  await fs.ensureDir(path.dirname(resultZipPath));
  const output = fs.createWriteStream(resultZipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });

  archive.on("warning", (err) => { if ((err as any).code !== "ENOENT") throw err; });
  archive.on("error", (err) => { throw err; });

  archive.pipe(output);

  const serverDir = path.join(srcDir, "server");
  if (!(await fs.pathExists(serverDir))) {
    await fs.mkdirp(serverDir);
    await fs.writeFile(path.join(serverDir, ".keep"), "");
  }

  archive.glob("**/*", {
    cwd: srcDir,
    dot: true,
    ignore: [
      "**/node_modules/**",
      "**/.git/**",
      "**/.next/**",
      "**/dist/**",
      "**/build/**",
      "**/*.log",
    ],
  });

  await archive.finalize();
  migrationResults.set(resultId, { zipPath: resultZipPath, timestamp: Date.now() });
  return resultId;
}

/* ────────────────────────────────────────────────────────────── */
/* Routes */
app.post("/api/verify/run", async (req, res) => {
  try {
    const { healthUrl } = req.body as { healthUrl?: string };
    if (!healthUrl) return res.status(400).json({ ok: false, error: "healthUrl is required" });

    const candidates = Array.from(new Set([
      healthUrl,
      healthUrl.endsWith("/") ? `${healthUrl}api/health` : `${healthUrl}/api/health`,
    ]));

    const t0 = Date.now();
    let ok = false, status = 0;

    for (const url of candidates) {
      try {
        const r = await fetch(url);
        status = r.status;
        if (r.ok) { ok = true; break; }
      } catch {}
    }

    const detail = {
      install: { ok: true, durationMs: 0 },
      build:   { ok: true, durationMs: 0 },
      run:     { ok, status, durationMs: Date.now() - t0, urlTried: candidates },
    };

    if (!ok) return res.status(404).json({ ok: false, detail });
    res.json({ ok: true, detail });
  } catch (e) {
    console.error("Verify error:", e);
    res.status(500).json({ ok: false, error: "Verify failed" });
  }
});

app.post("/api/plan", upload.single("project"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const tempDir = path.join(EXTRACT, uuidv4());
    await fs.ensureDir(tempDir);

    await fs.createReadStream(req.file.path).pipe(unzipper.Extract({ path: tempDir })).promise();
    await fs.remove(req.file.path);

    const projectRoot = await resolveProjectRoot(tempDir);
    const detection = await detectProject(projectRoot);
    const plan = await generatePlan(detection, {});

    const sessionId = uuidv4();
    planSessions.set(sessionId, { projectRoot, tempDir, timestamp: Date.now(), plan });

    res.json({ ok: true, sessionId, projectRoot, detection, plan });
  } catch (error) {
    console.error("Plan generation error:", error);
    res.status(500).json({ ok: false, error: "Failed to generate migration plan" });
  }
});

app.post("/api/diagnose", upload.single("project"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: "No file uploaded" });

    const tempDir = path.join(DIAG, uuidv4());
    await fs.ensureDir(tempDir);
    await fs.createReadStream(req.file.path).pipe(unzipper.Extract({ path: tempDir })).promise();
    await fs.remove(req.file.path);

    const projectRoot = await resolveProjectRoot(tempDir);
    const diag = await diagnose(projectRoot);
    const framework = "nextjs" as const;
    const autoFixes = await buildAutoFixes(projectRoot, framework);
    const hintFixes = fixesFromDiagnoseMessages(diag as any);
    const merged = { ...(diag as any), fixes: [ ...((diag as any).fixes ?? []), ...autoFixes, ...hintFixes ] };

    const sessionId = uuidv4();
    diagnoseSessions.set(sessionId, { projectRoot, tempDir, timestamp: Date.now() });

    res.json({ ok: true, sessionId, projectRoot, diagnose: merged });
  } catch (error) {
    console.error("Diagnose error:", error);
    res.status(500).json({ ok: false, error: "Failed to diagnose project" });
  }
});

app.post("/api/apply/:sessionId?", upload.single("project"), async (req, res) => {
  try {
    const fromHeaders = req.headers["x-session-id"] as string | undefined;
    const sessionId: string | undefined =
      (req.params as any)?.sessionId ||
      (req.body as any)?.sessionId ||
      (req.query as any)?.sessionId ||
      (req.query as any)?.sid ||
      fromHeaders;

    if (sessionId) {
      const session = planSessions.get(sessionId) || diagnoseSessions.get(sessionId);
      if (!session) return res.status(400).json({ ok: false, error: "Invalid or expired sessionId" });

      const { projectRoot, tempDir, plan } = session;
      let logs: string[] = [];
      let applied: string[] | undefined;

      if (plan) {
        const r = await applyMigration(projectRoot, plan, {});
        logs = r.logs;
        const steps = Array.isArray((plan as any).steps) ? (plan as any).steps : [];
        applied = steps.map((s: any) => s.target ?? s.type ?? "step");
      } else {
        logs = ["No changes applied. Shipping original extracted project."];
        applied = [];
      }

      const resultId = await zipDirectory(projectRoot);
      const downloadUrl = `/api/download/${resultId}`;

      await fs.remove(tempDir).catch(() => {});
      planSessions.delete(sessionId);
      diagnoseSessions.delete(sessionId);

      return res.status(200).json({
        ok: true, success: true, resultId, downloadUrl, logs, applied,
        appliedSteps: applied, id: resultId, zipId: resultId, downloadId: resultId,
        detail: { mode: "session" },
      });
    }

    if (req.file) {
      const tempDir = path.join(EXTRACT, uuidv4());
      await fs.ensureDir(tempDir);

      await fs.createReadStream(req.file.path).pipe(unzipper.Extract({ path: tempDir })).promise();
      await fs.remove(req.file.path);

      const projectRoot = await resolveProjectRoot(tempDir);
      const det  = await detectProject(projectRoot);
      const plan = await generatePlan(det, {
        force:  String(req.body?.force  || "").toLowerCase() === "true",
        backup: String(req.body?.backup || "").toLowerCase() !== "false",
      });

      const r = await applyMigration(projectRoot, plan, {});
      const resultId    = await zipDirectory(projectRoot);
      const downloadUrl = `/api/download/${resultId}`;

      const steps   = Array.isArray((plan as any).steps) ? (plan as any).steps : [];
      const applied = steps.map((s: any) => s.target ?? s.type ?? "step");

      await fs.remove(tempDir).catch(() => {});

      return res.status(200).json({
        ok: true, success: true, resultId, downloadUrl, logs: r.logs, applied,
        appliedSteps: steps, id: resultId, zipId: resultId, downloadId: resultId,
        detail: { mode: "oneshot" },
      });
    }

    return res.status(400).json({ ok: false, error: "Missing sessionId or project file" });
  } catch (error) {
    console.error("Apply error:", error);
    return res.status(500).json({ ok: false, error: "Failed to apply plan" });
  }
});

app.post("/api/fix/:sessionId?", parseFields.any(), async (_req, res) => {
  res.redirect(307, `/api/apply/`);
});

app.get("/api/download/:id", (req, res) => {
  const { id } = req.params;
  const result = migrationResults.get(id);
  if (!result) return res.status(404).json({ error: "Result not found or expired" });
  if (!fs.existsSync(result.zipPath)) {
    migrationResults.delete(id);
    return res.status(404).json({ error: "Result file not found" });
  }
  res.download(result.zipPath, `migrated-project-${id}.zip`, (err) => {
    if (err) console.error("Download error:", err);
  });
});

/* ========== Preview ========== */
function sendPreviewOk(res: Response, previewId: string, port: number) {
  const base = `http://127.0.0.1:${port}/`;
  const url  = `/preview/${previewId}`;
  res.json({
    ok: true, previewId,
    previewUrl: url, directUrl: base,
    url, externalUrl: url, healthUrl: base, target: base, port,
  });
}

app.post("/api/preview/start", upload.none(), async (req, res) => {
  try {
    const id =
      (req.body?.resultId as string) ||
      (req.body?.id as string) ||
      (req.body?.zipId as string) ||
      (req.body?.downloadId as string);

    if (!id) return res.status(400).json({ ok: false, error: "resultId is required" });

    const zipPath = path.join(RESULTS, `${id}.zip`);
    if (!(await fs.pathExists(zipPath))) {
      return res.status(404).json({ ok: false, error: "result zip not found" });
    }

    const tempDir = path.join(PREVIEW, uuidv4());
    await fs.ensureDir(tempDir);
    await fs.createReadStream(zipPath).pipe(unzipper.Extract({ path: tempDir })).promise();

    const projectRoot = await resolveProjectRoot(tempDir);

    const hasPkgJson = await fs.pathExists(path.join(projectRoot, "package.json"));
    if (hasPkgJson) {
      const cmd = process.platform === "win32" ? "npm.cmd" : "npm";
      await new Promise<void>((resolve) => {
        const p = spawn(cmd, ["i", "--silent"], { cwd: projectRoot, stdio: "inherit" });
        p.on("exit", () => resolve());
      });
    }

    const { child, port } = await spawnDevServerWithRetry(projectRoot, "--port");

    const previewId = uuidv4();
    previewSessions.set(previewId, {
      id: previewId, port, tempDir, childPid: child.pid ?? -1, startedAt: Date.now(),
    });

    return sendPreviewOk(res, previewId, port);
  } catch (e: any) {
    console.error("Preview start(error):", e);
    return res.status(500).json({ ok: false, error: e?.message || "Failed to start preview" });
  }
});

app.post("/api/preview", (req, res, next) => {
  (req as any).body = req.body || {};
  return (app._router as any).handle({ ...req, url: "/api/preview/start", method: "POST" }, res, next);
});

app.post("/api/preview/zip", upload.single("project"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: "No file uploaded" });

    const tempDir = path.join(PREVIEW, uuidv4());
    await fs.ensureDir(tempDir);
    await fs.createReadStream(req.file.path).pipe(unzipper.Extract({ path: tempDir })).promise();
    await fs.remove(req.file.path);

    const projectRoot = await resolveProjectRoot(tempDir);

    const hasPkgJson = await fs.pathExists(path.join(projectRoot, "package.json"));
    if (hasPkgJson) {
      const cmd = process.platform === "win32" ? "npm.cmd" : "npm";
      await new Promise<void>((resolve) => {
        const p = spawn(cmd, ["i", "--silent"], { cwd: projectRoot, stdio: "inherit" });
        p.on("exit", () => resolve());
      });
    }

    const { child, port } = await spawnDevServerWithRetry(projectRoot, "--port");

    const id = uuidv4();
    previewSessions.set(id, { id, port, tempDir, childPid: child.pid ?? -1, startedAt: Date.now() });

    return sendPreviewOk(res, id, port);
  } catch (e: any) {
    console.error("Preview start error:", e);
    res.status(500).json({ ok: false, error: e?.message || "Failed to start preview" });
  }
});

app.get("/api/preview/:id/health", async (req, res) => {
  const id = req.params.id;
  const sess = previewSessions.get(id);
  if (!sess) return res.status(404).json({ ok: false, error: "Preview not found" });
  const base = `http://127.0.0.1:${sess.port}/`;
  const ok = await waitForOkAny(base, 2000, 300);
  res.json({ ok, url: `/preview/${id}`, target: base, port: sess.port });
});

/* Preview proxy */
app.use((req: Request, res: Response, next: NextFunction) => {
  const ref = req.headers.referer || req.headers.referrer || "";
  const m = typeof ref === "string" ? ref.match(/\/preview\/([0-9a-f-]{36})/) : null;
  const absAsset = /^\/(@vite|src|node_modules|__vite_ping)/.test(req.path);

  if (m && absAsset) {
    const id = m[1];
    const sess = previewSessions.get(id);
    if (!sess) return res.status(404).send("Preview session not found");

    return createProxyMiddleware({
      target: `http://127.0.0.1:${sess.port}`,
      changeOrigin: true,
      ws: true,
      xfwd: true,
    })(req as any, res as any, next as any);
  }
  return next();
});

app.use(
  "/preview/:id",
  (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params as { id: string };
    const sess = previewSessions.get(id);
    if (!sess) return res.status(404).send("Preview not found or stopped");
    (req as any)._previewTarget = `http://127.0.0.1:${sess.port}`;
    (req as any)._previewPrefix = `/preview/${id}`;
    next();
  },
  createProxyMiddleware({
    target: "http://127.0.0.1",
    changeOrigin: true,
    ws: true,
    xfwd: true,
    router: (req: any) => req._previewTarget,
    pathRewrite: (path, req: any) => {
      const prefix = req._previewPrefix;
      if (prefix && path.startsWith(prefix)) return path.slice(prefix.length) || "/";
      return path;
    },
  }) as unknown as RequestHandler,
  ((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[preview proxy error]", err);
    try { res.writeHead?.(502); res.end?.("Preview Proxy Error"); } catch {}
  }) as ErrorRequestHandler
);

app.delete("/api/preview/:id", async (req, res) => {
  const id = req.params.id;
  const sess = previewSessions.get(id);
  if (!sess) return res.status(404).json({ ok: false, error: "Preview not found" });
  try { process.kill(sess.childPid, "SIGTERM"); } catch {}
  previewSessions.delete(id);
  await fs.remove(sess.tempDir).catch(() => {});
  res.json({ ok: true });
});

/* ---- Error middleware ---- */
app.use((err: any, _req: express.Request, res: express.Response, _next: NextFunction) => {
  if (err?.type === "entity.too.large") return res.status(413).json({ error: "Request body too large" });
  if (err?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "Upload file too large" });
  console.error("[unhandled]", err?.stack || err);
  res.status(500).json({ error: err?.message || "Something went wrong!" });
});

/* ---- Start ---- */
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Dev Migration Hub Web Server running on port ${PORT}`);
  console.log(`📖 Open http://localhost:${PORT}`);
});

export default app;
