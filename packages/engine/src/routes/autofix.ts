import { Router, json } from "express";
import * as path from "node:path";
import type { PlanStep } from "../index.js";

type Deps = {
  diagnose: (projectPath: string) => Promise<any>;
  fixesFromDiagnoseMessages: (msgs: any[]) => any[];
  buildAutoFixes: (specs: any[]) => PlanStep[];
  applyPatches: (projectPath: string, patches: PlanStep[]) => Promise<{ success: boolean; logs?: string[]; error?: string }>;
  logger?: { info?: (s: string) => void; warn?: (s: string) => void; error?: (s: string) => void; };
  allowedRootDir?: string;
};

export default function makeAutofixRoutes(deps: Deps) {
  const router = Router();
  const log = deps.logger ?? {};
  router.use(json({ limit: "100mb" }));

  router.post("/", async (req, res) => {
    try {
      const { projectPath, dryRun = false } = (req.body ?? {}) as { projectPath?: string; dryRun?: boolean };
      if (!projectPath || typeof projectPath !== "string") {
        return res.status(400).json({ ok: false, error: "projectPath (string) required" });
      }

      if (deps.allowedRootDir) {
        const norm = (p: string) => p.replace(/\\/g, "/");
        const root = norm(path.resolve(projectPath));
        const allowed = norm(path.resolve(deps.allowedRootDir));
        if (!(root === allowed || root.startsWith(allowed + "/"))) {
          return res.status(403).json({ ok: false, error: `Access outside allowed root is forbidden (${allowed}).` });
        }
      }

      log.info?.("Diagnosing project...");
      const diag = await deps.diagnose(projectPath);
      const messages = (diag?.messages ?? diag ?? []) as any[];

      const specs = deps.fixesFromDiagnoseMessages(messages);
      const patches = deps.buildAutoFixes(specs);

      if (!patches.length) {
        return res.json({ ok: true, patches: [], applied: false, message: "No auto-fixes suggested." });
      }

      if (dryRun) {
        return res.json({ ok: true, patches, applied: false });
      }

      log.info?.(`Applying ${patches.length} patch(es)...`);
      const result = await deps.applyPatches(projectPath, patches);
      if (!result?.success) {
        return res.status(500).json({ ok: false, error: result?.error || "applyPatches failed", patches });
      }

      return res.json({ ok: true, applied: true, patches, logs: result.logs ?? [] });
    } catch (err: any) {
      deps.logger?.error?.(err?.message || String(err));
      return res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  return router;
}
