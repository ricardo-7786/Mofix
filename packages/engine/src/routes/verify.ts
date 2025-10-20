import { Router } from "express";
import { verifyProject } from "../services/verify-runner.js"; // ← .js

const router = Router();

/** POST /api/verify/run */
router.post("/run", async (req, res) => {
  try {
    const { projectPath, healthUrl } = req.body || {};
    if (!projectPath) return res.status(400).json({ error: "projectPath required" });

    const out = await verifyProject({ projectDir: projectPath, healthUrl });
    const ok = out.install.ok && out.build.ok && (out.run ? out.run.ok : true);
    res.json({ ok, detail: out, logs: out.logs });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "verify failed" });
  }
});

export default router;
