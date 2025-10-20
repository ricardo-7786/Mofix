// packages/engine/src/routes/apply.ts
import { Router } from "express";
import path from "path";
import fs from "fs-extra";
import { resolveRealProjectRoot } from "../utils/root.js";
import type { Detection, Plan } from "../index.js";

type MakeApplyRoutesDeps = {
  detect: (projectPath: string) => Promise<Detection>;
  plan: (detection: Detection, options?: any) => Promise<Plan>;
  applyFn: (projectPath: string, plan: Plan, options?: any) => Promise<any>;
  logger?: {
    info?: (s: string) => void;
    step?: (s: string) => void;
    success?: (s: string) => void;
    warn?: (s: string) => void;
    error?: (s: string) => void;
  };
  /** 선택: 샌드박스 루트 밖 접근 차단 */
  allowedRootDir?: string;
};

type ApplyRequestBody = {
  projectPath?: string;
  /** 서버에서 새로 생성하지 않고, 클라이언트가 만든 plan을 직접 적용하고 싶을 때 */
  plan?: Partial<Plan> & { steps?: unknown };
  /** 서버/클라 어느 쪽에서 와도 인정 */
  dryRun?: boolean;
  options?: Record<string, any>;
};

function isValidPlan(p: any): p is Plan {
  return Boolean(p && typeof p === "object" && Array.isArray(p.steps));
}

/**
 * POST /api/apply
 * - plan 미제공 시: detect → plan → applyFn
 * - dryRun:true 시: 적용하지 않고 plan만 반환
 * - 응답은 항상 { ok, projectPath, dryRun, detection, plan, result? } 형태
 */
export default function makeApplyRoutes(deps: MakeApplyRoutesDeps) {
  const { detect, plan, applyFn, logger, allowedRootDir } = deps;
  const log = logger ?? {};
  const router = Router();

  router.post("/", async (req, res) => {
    try {
      const { projectPath, plan: incomingPlan, dryRun, options = {} } =
        (req.body ?? {}) as ApplyRequestBody;

      // 1) 입력 검증
      if (!projectPath || typeof projectPath !== "string" || !projectPath.trim()) {
        return res.status(400).json({ ok: false, error: "projectPath (string) required" });
      }

      // 2) 루트 보정 + 접근 제한 + 존재 확인
      const abs = path.resolve(projectPath);
      const root = await resolveRealProjectRoot(abs);

      if (allowedRootDir) {
        const norm = (p: string) => p.replace(/\\/g, "/");
        const allowed = norm(path.resolve(allowedRootDir));
        const candidate = norm(root);
        if (!(candidate === allowed || candidate.startsWith(allowed + "/"))) {
          return res.status(403).json({
            ok: false,
            error: `Access outside allowed root is forbidden (${allowed}).`,
          });
        }
      }

      if (!(await fs.pathExists(root))) {
        return res.status(404).json({ ok: false, error: `Path not found: ${root}` });
      }

      // 3) 프로젝트 감지
      log.step?.("Detecting project...");
      let detection: Detection;
      try {
        detection = await detect(root);
      } catch (e: any) {
        log.error?.(`detect failed: ${e?.message || e}`);
        return res.status(500).json({ ok: false, error: `detect failed: ${e?.message || e}` });
      }

      // 4) 플랜 준비 (클라 제공 우선)
      let planToApply: Plan;
      if (isValidPlan(incomingPlan)) {
        planToApply = {
          steps: incomingPlan.steps,
          confidence: incomingPlan.confidence ?? 1,
          warnings: incomingPlan.warnings ?? [],
        } as Plan;
      } else {
        log.step?.("Generating plan...");
        try {
          planToApply = await plan(detection, { projectPath: root, ...(options || {}) });
        } catch (e: any) {
          log.error?.(`plan failed: ${e?.message || e}`);
          return res.status(500).json({ ok: false, error: `plan failed: ${e?.message || e}` });
        }
      }

      if (!isValidPlan(planToApply) || planToApply.steps.length === 0) {
        return res.status(400).json({ ok: false, error: "No steps to apply" });
      }

      const wantDryRun = Boolean(dryRun || (options as any)?.dryRun);

      // 5) 드라이런: plan만 반환
      if (wantDryRun) {
        return res.json({
          ok: true,
          projectPath: root,
          dryRun: true,
          detection,
          plan: planToApply,
          result: null,
        });
      }

      // 6) 실제 적용
      log.step?.("Applying plan...");
      try {
        const result = await applyFn(root, planToApply, options);
        return res.json({
          ok: true,
          projectPath: root,
          dryRun: false,
          detection,
          plan: planToApply,
          result,
        });
      } catch (e: any) {
        log.error?.(`apply failed: ${e?.message || e}`);
        return res.status(500).json({ ok: false, error: `apply failed: ${e?.message || e}` });
      }
    } catch (err: any) {
      log.error?.(err?.message || String(err));
      return res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  return router;
}
