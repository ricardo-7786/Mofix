// packages/engine/src/core/plan-generator.ts

import { FrameworkRegistry } from "../frameworks/framework-registry.js";
import { ProviderRegistry } from "../providers/provider-registry.js";
import { TargetRegistry } from "../targets/target-registry.js";

// ★ 추가: 감지/로그/룰 유틸 import
import { ProjectDetector } from "./project-detector.js";
import { Logger } from "./logger.js";
import { buildAutoFixes, fixesFromDiagnoseMessages, type Fix } from "../fixes/rules.js";
import { diagnose } from "../diagnose/index.js";

/** ---------------- Types ---------------- **/
export type PlanStepType = "create" | "modify";

export type PlanStep = {
  type: PlanStepType;
  description: string;
  target: string;         // 파일 경로 혹은 리소스 식별자
  required: boolean;
  // 실행기에 추가 정보를 넘기기 위한 임의 페이로드
  payload?: Record<string, any>;
};

export interface DetectionResult {
  framework?: string;     // e.g. "nextjs" | "vite" | ...
  provider?: string;
  hasPackageJson?: boolean;
}

export interface GenerateOptions {
  projectPath: string;
  deploymentTarget?: string;
  [key: string]: any;     // 기타 옵션
}

export interface PlanResult {
  steps: PlanStep[];
  confidence: number;
  warnings: string[];
}
/** -------------------------------------- **/

/**
 * NOTE:
 * - Framework/Provider/Target 어댑터는 레지스트리에서 주입
 * - 여기서는 Plan(무엇을 할지)만 정의하고, 실제 적용은 plan-executor에서 수행
 */
export class PlanGenerator {
  private frameworkRegistry: FrameworkRegistry;
  private providerRegistry: ProviderRegistry;
  private targetRegistry: TargetRegistry;

  constructor(
    private readonly logger: { info?: (msg: string) => void; warn?: (msg: string) => void } = {}
  ) {
    this.frameworkRegistry = new FrameworkRegistry();
    this.providerRegistry = new ProviderRegistry();
    this.targetRegistry = new TargetRegistry();
  }

  async generate(detection: DetectionResult, options: GenerateOptions): Promise<PlanResult> {
    const steps: PlanStep[] = [];
    const warnings: string[] = [];
    let confidence = 1.0;

    /** 1) 공통 파일 생성 스텝 */
    steps.push(...(await this.generateCommonFiles()));

    /** 2) 프레임워크별 설정 스텝 (어댑터에 위임) */
    if (detection.framework) {
      const frameworkAdapter: {
        generateConfig?: (projectPath: string, opts?: GenerateOptions) => Promise<PlanStep[]> | PlanStep[];
      } = this.frameworkRegistry.get(detection.framework) as any;

      if (frameworkAdapter?.generateConfig) {
        const frameworkSteps = await frameworkAdapter.generateConfig(options.projectPath, options);
        steps.push(...frameworkSteps);
      } else {
        warnings.push(`No adapter found for framework: ${detection.framework}`);
        confidence -= 0.2;
      }
    } else {
      warnings.push("Framework not detected - some optimizations may be missed");
      confidence -= 0.3;
    }

    /** 3) 프로바이더 변환 스텝 (어댑터에 위임) */
    if (detection.provider) {
      const providerAdapter: {
        transform?: (projectPath: string, opts?: GenerateOptions) => Promise<PlanStep[]> | PlanStep[];
      } = this.providerRegistry.get(detection.provider) as any;

      if (providerAdapter?.transform) {
        const providerSteps = await providerAdapter.transform(options.projectPath, options);
        steps.push(...providerSteps);
      } else {
        warnings.push(`Provider "${detection.provider}" has no 'transform' adapter`);
        confidence -= 0.1;
      }
    }

    /** 4) 배포 타깃 설정 스텝 (어댑터에 위임) */
    if (options.deploymentTarget) {
      const targetAdapter: {
        generateConfig?: (
          framework: string,
          projectPath: string,
          opts?: GenerateOptions
        ) => Promise<PlanStep[]> | PlanStep[];
      } = this.targetRegistry.get(options.deploymentTarget) as any;

      if (targetAdapter?.generateConfig) {
        const targetSteps = await targetAdapter.generateConfig(
          detection.framework || "generic",
          options.projectPath,
          options
        );
        steps.push(...targetSteps);
      } else {
        warnings.push(`No adapter found for target: ${options.deploymentTarget}`);
        confidence -= 0.2;
      }
    }

    /** 5) package.json 스크립트 보정 스텝 (MVP 핵심) */
    if (detection.hasPackageJson) {
      // Next.js / Vite 에 대해서만 보정 (필요시 케이스 확장)
      const fw = (detection.framework || "").toLowerCase();
      if (fw === "nextjs" || fw === "vite") {
        steps.push({
          type: "modify",
          description: `Normalize package.json scripts for ${fw}`,
          target: "package.json",
          required: true,
          payload: {
            action: "normalizePackageScripts",
            framework: fw, // "nextjs" | "vite"
          },
        });
      } else {
        // 프레임워크 미확인/기타일 때는 권장 수준으로만 안내
        steps.push({
          type: "modify",
          description: "Normalize package.json scripts (generic)",
          target: "package.json",
          required: false,
          payload: {
            action: "normalizePackageScripts",
            framework: "generic",
          },
        });
      }
    } else {
      warnings.push("No package.json found — script normalization skipped");
      confidence -= 0.15;
    }

    return {
      steps,
      confidence: Math.max(0.1, confidence),
      warnings,
    };
  }

  /** 공통 파일 템플릿 생성 계획 */
  private async generateCommonFiles(): Promise<PlanStep[]> {
    return [
      {
        type: "create",
        description: "Create .gitignore file",
        target: ".gitignore",
        required: true,
      },
      {
        type: "create",
        description: "Create VS Code settings",
        target: ".vscode/settings.json",
        required: false,
      },
      {
        type: "create",
        description: "Create VS Code extensions recommendations",
        target: ".vscode/extensions.json",
        required: false,
      },
      {
        type: "create",
        description: "Create Prettier configuration",
        target: ".prettierrc",
        required: false,
      },
      {
        type: "create",
        description: "Create environment variables guide",
        target: ".env.example",
        required: false,
      },
    ];
  }
}

/* ============================================================================
 *  Convenience API: 감지 + 진단 + 자동 Fix 묶어서 반환
 *  - MoFix 상단 플로우에서 간단히 호출하여 UI/CLI에 그대로 전달 가능
 * ========================================================================== */
export async function generatePlan(projectRoot: string): Promise<{
  detection: DetectionResult & { projectPath?: string };
  fixes: Fix[];
  diagResult: any;
}> {
  const detector = new ProjectDetector(new Logger());
  const detection = await detector.detect(projectRoot);

  // 1) framework 감지 (unknown 처리)
  const framework = (detection.framework ?? "unknown") as "nextjs" | "vite" | "express" | "unknown";

  // 2) diagnose 실행 (에러/로그 수집)
  const diagResult = await diagnose(projectRoot);

  // 3) 자동 Fix 빌드
  const autoFixes = await buildAutoFixes(projectRoot, framework);

  // 4) 로그 기반 Fix 빌드
  const diagFixes = fixesFromDiagnoseMessages(diagResult);

  // 5) 최종 Fix 합치기
  const fixes = [...autoFixes, ...diagFixes];

  return {
    detection: { ...detection, projectPath: projectRoot },
    fixes,
    diagResult,
  };
}
