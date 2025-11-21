// packages/engine/src/adapters/nextjs.ts
import * as path from "path";
import fs from "fs-extra";
import type { MigrationOptions, MigrationStep, FrameworkAdapter } from "../core/types.js";
import { planCreateIfMissing, planEnsureGitignoreLines } from "../utils/planHelpers.js";
import { planUpdatePackageJsonScripts } from "../utils/packageJson.js";
import {
  nextConfigJsTemplate,
  postcssConfigJsTemplate,
  tailwindConfigJsForNext,
  envLocalExample,
  gitignoreAdditions
} from "../templates/common.js";

export class NextJSAdapter implements FrameworkAdapter {
  name = "nextjs";

  async detect(projectPath: string): Promise<boolean> {
    const pkg = path.join(projectPath, "package.json");
    if (!(await fs.pathExists(pkg))) return false;
    const json = await fs.readJson(pkg).catch(() => null);
    return !!(json?.dependencies?.next || json?.devDependencies?.next);
  }

  // (1) 필수 파일 생성/보정 Plan
  private async planRequiredFiles(projectPath: string): Promise<MigrationStep[]> {
    const steps: MigrationStep[] = [];

    // next.config.js
    steps.push(
      ...(await planCreateIfMissing(projectPath, "next.config.js", nextConfigJsTemplate))
    );

    // postcss.config.js
    steps.push(
      ...(await planCreateIfMissing(projectPath, "postcss.config.js", postcssConfigJsTemplate))
    );

    // tailwind.config.js
    steps.push(
      ...(await planCreateIfMissing(projectPath, "tailwind.config.js", tailwindConfigJsForNext))
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
    steps.push(...(await planUpdatePackageJsonScripts(projectPath, "nextjs"))); // ← Plan에 modify Step 추가
    return steps;
  }

  // (3) 인터페이스 요구 메서드: package.json 스크립트 보정 (런타임 즉시 수정이 필요할 때만)
  fixPackageJsonScripts(pkg: any) {
    if (!pkg.scripts) pkg.scripts = {};
    pkg.scripts.dev ??= "next dev";
    pkg.scripts.build ??= "next build";
    pkg.scripts.start ??= "next start";
    return pkg;
  }
}
