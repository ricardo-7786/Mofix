// packages/engine/src/adapters/vite.ts
import * as path from "path";
import fs from "fs-extra";
import type { MigrationOptions, MigrationStep, FrameworkAdapter } from "../core/types.js";
import { planCreateIfMissing, planEnsureGitignoreLines } from "../utils/planHelpers.js";
import { planUpdatePackageJsonScripts } from "../utils/packageJson.js";
import {
  postcssConfigJsTemplate,
  tailwindConfigJsForVite,
  envLocalExample,
  gitignoreAdditions
} from "../templates/common.js";

export class ViteAdapter implements FrameworkAdapter {
  name = "vite";

  async detect(projectPath: string): Promise<boolean> {
    const pkg = path.join(projectPath, "package.json");
    if (!(await fs.pathExists(pkg))) return false;
    const json = await fs.readJson(pkg).catch(() => null);
    return !!(json?.dependencies?.vite || json?.devDependencies?.vite);
  }

  // (1) 필수 파일 생성/보정 Plan
  private async planRequiredFiles(projectPath: string): Promise<MigrationStep[]> {
    const steps: MigrationStep[] = [];

    // postcss.config.js
    steps.push(
      ...(await planCreateIfMissing(projectPath, "postcss.config.js", postcssConfigJsTemplate))
    );

    // tailwind.config.js (Vite 전용)
    steps.push(
      ...(await planCreateIfMissing(projectPath, "tailwind.config.js", tailwindConfigJsForVite))
    );

    // .env.local.example
    steps.push(
      ...(await planCreateIfMissing(projectPath, ".env.local.example", envLocalExample))
    );

    // .gitignore 보강
    steps.push(...(await planEnsureGitignoreLines(projectPath, gitignoreAdditions)));

    return steps;
  }

  // (2) Plan 생성: 필수 파일 + package.json 스크립트 수정
  async generateConfig(projectPath: string, _options: MigrationOptions): Promise<MigrationStep[]> {
    const steps: MigrationStep[] = [];
    steps.push(...(await this.planRequiredFiles(projectPath)));
    steps.push(...(await planUpdatePackageJsonScripts(projectPath, "vite"))); // ← Plan에 modify Step 추가
    return steps;
  }

  // (3) 인터페이스 요구 메서드 (호환용)
  fixPackageJsonScripts(pkg: any) {
    if (!pkg.scripts) pkg.scripts = {};
    pkg.scripts.dev ??= "vite";
    pkg.scripts.build ??= "vite build";
    pkg.scripts.preview ??= "vite preview";
    return pkg;
  }
}
