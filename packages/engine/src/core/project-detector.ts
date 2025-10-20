// packages/engine/src/core/project-detector.ts
import path from "path";
import fs from "fs-extra";
import type { DetectionResult } from "./types.js";
import { Logger } from "./logger.js";
import { resolveRealProjectRoot } from "../utils/root.js"; // ★ 루트 보정 유틸

export class ProjectDetector {
  constructor(private logger: Logger) {}

  async detect(projectPath: string): Promise<DetectionResult> {
    // ★ 입력 경로 보정 (ZIP 한 겹 등)
    const projectRoot = await resolveRealProjectRoot(projectPath);
    if (projectRoot !== projectPath) {
      this.logger.info(`➡ Using detected project root: ${projectRoot}`);
    }

    const packageJsonPath = path.join(projectRoot, "package.json");
    const hasPackageJson = await fs.pathExists(packageJsonPath);

    let dependencies: Record<string, string> = {};
    if (hasPackageJson) {
      const packageJson = await fs.readJson(packageJsonPath).catch(() => ({} as any));
      dependencies = {
        ...(packageJson?.dependencies || {}),
        ...(packageJson?.devDependencies || {}),
      };
    }

    // ★ 타입 불일치 방지: 기본값을 'npm'으로 두고 lock 파일로 덮어쓴다.
    //   (types.ts에서 bun을 지원하지 않으면 bun 분기는 생략/삭제해도 됨)
    let packageManager: "npm" | "yarn" | "pnpm" | "bun" = "npm";
    if (await fs.pathExists(path.join(projectRoot, "pnpm-lock.yaml"))) packageManager = "pnpm";
    else if (await fs.pathExists(path.join(projectRoot, "yarn.lock"))) packageManager = "yarn";
    else if (await fs.pathExists(path.join(projectRoot, "bun.lockb"))) packageManager = "bun";

    const framework = await this.detectFramework(projectRoot, dependencies); // string | undefined
    const provider  = await this.detectProvider(projectRoot);                // string | undefined
    const hasEnvFiles = await this.detectEnvFiles(projectRoot);

    return {
      framework,        // optional
      provider,         // optional
      packageManager,   // 이제 절대 undefined 아님
      dependencies,
      hasPackageJson,
      hasEnvFiles,
      // ↓ 일부 프로젝트에선 DetectionResult에 projectPath가 필요함
      //   (필요 없으면 제거해도 무방)
      projectPath: projectRoot as any,
    } as DetectionResult;
  }

  private async detectFramework(
    projectRoot: string,
    dependencies: Record<string, string>
  ): Promise<string | undefined> {
    // Next.js
    if (
      dependencies.next ||
      (await fs.pathExists(path.join(projectRoot, "next.config.js"))) ||
      (await fs.pathExists(path.join(projectRoot, "next.config.ts")))
    ) {
      return "nextjs";
    }

    // Vite
    if (
      dependencies.vite ||
      (await fs.pathExists(path.join(projectRoot, "vite.config.js"))) ||
      (await fs.pathExists(path.join(projectRoot, "vite.config.ts")))
    ) {
      return "vite";
    }

    // Express
    if (dependencies.express) return "express";
    // CRA
    if (dependencies["react-scripts"]) return "cra";
    // Nest
    if (dependencies["@nestjs/core"]) return "nestjs";
    // Astro
    if (dependencies.astro) return "astro";

    return undefined;
  }

  private async detectProvider(projectRoot: string): Promise<string | undefined> {
    if (
      (await fs.pathExists(path.join(projectRoot, ".replit"))) ||
      (await fs.pathExists(path.join(projectRoot, "replit.nix")))
    ) {
      return "replit";
    }
    if (await fs.pathExists(path.join(projectRoot, ".stackblitzrc"))) return "stackblitz";
    if (await fs.pathExists(path.join(projectRoot, ".codesandbox"))) return "codesandbox";
    return undefined;
  }

  private async detectEnvFiles(projectRoot: string): Promise<boolean> {
    const envFiles = [".env", ".env.local", ".env.development", ".env.production", ".env.example"];
    for (const envFile of envFiles) {
      if (await fs.pathExists(path.join(projectRoot, envFile))) return true;
    }
    return false;
  }
}
