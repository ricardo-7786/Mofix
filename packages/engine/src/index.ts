import fs from "fs-extra";
import * as path from "path";
import express from "express";
import cors from "cors";

import verifyRoutes from "./routes/verify.js";
import makePlanRoutes from "./routes/plan.js";
import makeApplyRoutes from "./routes/apply.js";

import { planUpdatePackageJsonScripts } from "./utils/packageJson.js";
import { buildAutoFixes, fixesFromDiagnoseMessages } from "./fixes/rules.js";
import { resolveRealProjectRoot } from "./utils/root.js";

/* ========================= Types =======================*/
export type Detection = {
  framework: "nextjs" | "vite" | "express" | "unknown";
  provider?: "replit" | "stackblitz" | "codesandbox" | "unknown";
  packageManager: "npm" | "yarn" | "pnpm" | "bun";
  hasPackageJson: boolean;
  hasEnvFiles: boolean;
  projectPath: string;
  dependencies: Record<string, string>;
};

export type PlanStep = {
  type: "create" | "modify" | "delete" | "copy";
  target: string;
  description?: string;
  required?: boolean;
  content?: string;
};

export type Plan = {
  steps: PlanStep[];
  confidence: number;
  warnings: string[];
};

export type PlanOptions = {
  to?: "vscode" | "vercel" | "netlify" | "docker";
  force?: boolean;
  backup?: boolean;
};

export type ApplyOptions = PlanOptions;

/* ========================= Detect =======================*/
export async function detect(projectPath: string): Promise<Detection> {
  const realRoot = await resolveRealProjectRoot(projectPath);
  const pkgPath = path.join(realRoot, "package.json");
  const hasPkg = await fs.pathExists(pkgPath);
  const pkg = hasPkg ? await fs.readJson(pkgPath).catch(() => ({})) : ({} as any);

  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) } as Record<string, string>;

  let framework: Detection["framework"] = "unknown";
  if (deps["next"]) framework = "nextjs";
  else if (deps["vite"]) framework = "vite";
  else if (deps["express"]) framework = "express";

  let packageManager: Detection["packageManager"] = "npm";
  if (await fs.pathExists(path.join(realRoot, "pnpm-lock.yaml"))) packageManager = "pnpm";
  else if (await fs.pathExists(path.join(realRoot, "yarn.lock"))) packageManager = "yarn";
  else if (await fs.pathExists(path.join(realRoot, "bun.lockb"))) packageManager = "bun";

  const hasEnvFiles =
    (await fs.pathExists(path.join(realRoot, ".env"))) ||
    (await fs.pathExists(path.join(realRoot, ".env.local")));

  let provider: Detection["provider"] = "unknown";
  if (await fs.pathExists(path.join(realRoot, ".replit"))) provider = "replit";

  return { framework, provider, packageManager, hasPackageJson: hasPkg, hasEnvFiles, projectPath: realRoot, dependencies: deps };
}

/* ========================= Plan =======================*/
export async function plan(d: Detection, opts: PlanOptions = {}): Promise<Plan> {
  const steps: PlanStep[] = [
    { type: "create", target: ".gitignore", description: "Create .gitignore file", required: true },
    { type: "create", target: ".vscode/settings.json", description: "Create VS Code settings" }
  ];

  if (d.hasPackageJson && (d.framework === "nextjs" || d.framework === "vite")) {
    const pkgSteps = await planUpdatePackageJsonScripts(d.projectPath, d.framework);
    steps.push(...pkgSteps);
  }

  if (opts.to === "vercel")      steps.push({ type: "create", target: "vercel.json",  description: "Add vercel config" });
  else if (opts.to === "netlify")steps.push({ type: "create", target: "netlify.toml", description: "Add netlify config" });
  else if (opts.to === "docker") steps.push({ type: "create", target: "Dockerfile",   description: "Add Dockerfile" });

  return { steps, confidence: 0.9, warnings: [] };
}

/* ========================= Apply =======================*/
export async function applyPlan(projectPath: string, p: Plan, _opts: ApplyOptions = {}) {
  const root = await resolveRealProjectRoot(projectPath);
  const logs: string[] = ["Starting migration..."];

  for (const step of p.steps) {
    const target = path.join(root, step.target);

    if (step.type === "create") {
      await fs.ensureDir(path.dirname(target));
      if (step.target === ".gitignore") {
        await fs.writeFile(target, "node_modules/\n.env.local\n");
      } else if (step.target === ".vscode/settings.json") {
        await fs.writeFile(target, JSON.stringify({ "editor.formatOnSave": true }, null, 2) + "\n");
      } else if (step.target === "vercel.json") {
        await fs.writeFile(target, JSON.stringify({ version: 2 }, null, 2) + "\n");
      } else if (step.target === "netlify.toml") {
        await fs.writeFile(target, '[build]\n  command = "npm run build"\n  publish = "dist"\n');
      } else if (step.target === "Dockerfile") {
        await fs.writeFile(
          target,
          `FROM node:18-alpine
WORKDIR /app
COPY . .
RUN npm i
CMD ["npm","run","dev"]\n`
        );
      } else {
        await fs.ensureFile(target);
      }
      logs.push(`Created ${step.target}`);
    }

    if (step.type === "modify") {
      if (typeof step.content === "string") {
        await fs.ensureDir(path.dirname(target));
        await fs.writeFile(target, step.content);
        logs.push(`Modified ${step.target}`);
      } else if (step.target === "package.json") {
        const pkgPath = path.join(root, "package.json");
        if (await fs.pathExists(pkgPath)) {
          const pkg = await fs.readJson(pkgPath).catch(() => ({}));
          (pkg as any).scripts = (pkg as any).scripts || {};
          (pkg as any).scripts.dev   ||= "next dev || vite || node server.js";
          (pkg as any).scripts.build ||= "next build || vite build || tsc -p .";
          (pkg as any).scripts.start ||= "next start || node dist/server.js";
          await fs.writeJson(pkgPath, pkg, { spaces: 2 });
          logs.push("Updated package.json scripts (fallback)");
        }
      }
    }
  }

  logs.push("Migration completed successfully!");
  return { success: true, logs };
}

/* ========================= Public API =======================*/
import { diagnose } from "./diagnose/index.js";
export { diagnose };
export { buildAutoFixes, fixesFromDiagnoseMessages } from "./fixes/rules.js";

export async function applyPatches(projectRoot: string, patches: PlanStep[]) {
  const planObj: Plan = { steps: patches, confidence: 1, warnings: [] };
  return applyPlan(projectRoot, planObj, {});
}

export { plan as generatePlan };
export const apply = applyPlan;

/* ========================= Express App (서버 진입점) =======================*/
const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use("/api/verify", verifyRoutes);
app.use("/api/plan",  makePlanRoutes({ detect, plan, logger: console as any }));
app.use("/api/apply", makeApplyRoutes({ detect, plan, applyFn: applyPlan, logger: console as any }));

// listen은 테스트에서 하지 않음
export { app };

export default {
  detect,
  plan,
  apply: applyPlan,
  diagnose,
  applyPatches,
  generatePlan: plan,
  buildAutoFixes,
  fixesFromDiagnoseMessages
};
