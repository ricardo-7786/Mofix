// CommonJS와 100% 호환되는 TS import assignment
import express = require("express");
import cors = require("cors");
import multer = require("multer");
import fs = require("node:fs");
import path = require("node:path");
import { execSync } from "node:child_process";
import { v4 as uuid } from "uuid";

// ──────────────────────────────────────────────────────────────────────────────
// App & dirs
// ──────────────────────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

const DATA_DIR = path.join(process.cwd(), "data");
const UP_DIR = path.join(DATA_DIR, "uploads");
const OUT_DIR = path.join(DATA_DIR, "out");
fs.mkdirSync(UP_DIR, { recursive: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

// Multer: save to UP_DIR
const upload = multer({ dest: UP_DIR });

// In-memory project state (demo)
type PState = {
  id: string;
  name: string;
  status: "uploaded" | "building" | "ready" | "failed";
  log: string[];
  outZip?: string;
};
const projects = new Map<string, PState>();

// ──────────────────────────────────────────────────────────────────────────────
// 공통 업로드 처리 로직 (두 라우트에서 재사용)
// ──────────────────────────────────────────────────────────────────────────────
function handleUpload(req: any, res: any) {
  const id = uuid();
  const name = req.file?.originalname || `project-${id}.zip`;
  try {
    if (!req.file) return res.status(400).json({ error: "file missing" });
    const dest = path.join(UP_DIR, `${id}.zip`);
    fs.renameSync(req.file.path, dest);
    projects.set(id, { id, name, status: "uploaded", log: [`uploaded: ${name}`] });
    return res.json({ projectId: id, id });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e?.message || "upload failed" });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// 1) Upload 라우트
//    - 오리지널: /api/projects/upload
//    - 오토테스터 호환 alias: /upload (필요시 유지, 필요없으면 아래 한 줄만 삭제)
// ──────────────────────────────────────────────────────────────────────────────
app.post("/api/projects/upload", upload.single("file"), handleUpload);
app.post("/upload", upload.single("file"), handleUpload); // ← 오토테스터가 /upload로 보내면 유지

// ──────────────────────────────────────────────────────────────────────────────
// 2) Verify (demo - 3초 후 더미 ZIP 생성)
// ──────────────────────────────────────────────────────────────────────────────
app.post("/api/projects/:id/verify", async (req: any, res: any) => {
  const p = projects.get(req.params.id);
  if (!p) return res.status(404).json({ error: "not found" });

  if (p.status === "uploaded" || p.status === "failed") {
    p.status = "building";
    p.log.push("verification started");
    setTimeout(() => {
      try {
        const txt = path.join(OUT_DIR, `${p.id}.txt`);
        fs.writeFileSync(txt, `MoFix result for ${p.name} (${p.id})`);

        const outZip = path.join(OUT_DIR, `${p.id}.zip`);
        try {
          execSync(`cd ${OUT_DIR} && zip -q ${p.id}.zip ${p.id}.txt`);
        } catch {
          // zip 유틸이 없을 때: 텍스트 파일을 그냥 복사 (형식만 zip 이름)
          fs.copyFileSync(txt, outZip);
        }
        fs.unlinkSync(txt);

        p.outZip = outZip;
        p.status = "ready";
        p.log.push("engine finished: ready");
      } catch (e: any) {
        p.status = "failed";
        p.log.push("engine failed: " + (e?.message || "unknown"));
      }
    }, 3000);
  }
  res.json({ ok: true, projectId: p.id });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3) Status
// ──────────────────────────────────────────────────────────────────────────────
app.get("/api/projects/:id/status", (req: any, res: any) => {
  const p = projects.get(req.params.id);
  if (!p) return res.status(404).json({ error: "not found" });
  res.json({ projectId: p.id, previewStatus: p.status, state: p.status });
});

// ──────────────────────────────────────────────────────────────────────────────
app.get("/api/projects/:id/logs", (req: any, res: any) => {
  const p = projects.get(req.params.id);
  if (!p) return res.status(404).type("text/plain").send("not found");
  res.type("text/plain").send(p.log.join("\n"));
});

// ──────────────────────────────────────────────────────────────────────────────
app.get("/api/projects/:id/download", (req: any, res: any) => {
  const p = projects.get(req.params.id);
  if (!p || !p.outZip || !fs.existsSync(p.outZip)) {
    return res.status(404).type("text/plain").send("not ready");
  }
  res.download(p.outZip);
});

// 건강 확인용
app.get("/health", (_req, res) => res.json({ ok: true }));

// ──────────────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(PORT, () => {
  console.log(`MoFix API running on http://localhost:${PORT}`);
});
