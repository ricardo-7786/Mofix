import { Router } from "express";

// 필요하다면 타입을 가져옵니다. (경로는 프로젝트 구조에 맞춰 조정)
import type { Detection, Plan } from "../index.js";

type MakePlanRoutesDeps = {
  detect: (projectPath: string) => Promise<Detection>;
  plan: (detection: Detection, options?: any) => Promise<Plan>;
  logger?: {
    info?: (s: string) => void;
    warn?: (s: string) => void;
    error?: (s: string) => void;
  };
  // 선택: 샌드박스 제한을 하고 싶을 때만 사용
  allowedRootDir?: string;
};

/**
 * POST /api/plan
 * body: { projectPath: string, options?: {...} }
 * - project를 detect 한 뒤 plan을 반환 (적용은 하지 않음)
 */
export default function makePlanRoutes(deps: MakePlanRoutesDeps) {
  const router = Router();
  const log = deps.logger ?? {};

  router.post("/", async (req, res) => {
    try {
      const { projectPath, options = {} } = (req.body ?? {}) as {
        projectPath?: string;
        options?: Record<string, any>;
      };

      if (!projectPath || typeof projectPath !== "string") {
        return res.status(400).json({ ok: false, error: "projectPath (string) required" });
      }

      // allowedRootDir 검증 (선택)
      if (deps.allowedRootDir) {
        const norm = (p: string) => p.replace(/\\/g, "/");
        const root = norm(require("path").resolve(projectPath));
        const allowed = norm(require("path").resolve(deps.allowedRootDir));
        if (!(root === allowed || root.startsWith(allowed + "/"))) {
          return res.status(403).json({ ok: false, error: `Access outside allowed root is forbidden (${allowed}).` });
        }
      }

      log.info?.("Detecting project...");
      const detection = await deps.detect(projectPath);

      log.info?.("Generating plan...");
      const plan = await deps.plan(detection, { projectPath, ...(options || {}) });

      if (!plan || !Array.isArray(plan.steps)) {
        return res.status(500).json({ ok: false, error: "plan generation returned invalid result" });
      }

      return res.json({ ok: true, projectPath, detection, plan });
    } catch (err: any) {
      log.error?.(err?.message || String(err));
      return res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  return router;
}