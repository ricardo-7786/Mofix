// packages/engine/src/core/types.ts
import { Logger } from "./logger.js";

/**
 * 마이그레이션 실행 옵션
 */
export interface MigrationOptions {
  projectPath: string;
  dryRun?: boolean;
  createBackup?: boolean;
  force?: boolean;
  deploymentTarget?: string;
  logger: Logger;
}

/**
 * 프로젝트에서 감지한 결과
 * - null 대신 optional(= undefined 가능)로 통일
 */
export interface DetectionResult {
  framework?: string;
  provider?: string;
  packageManager?: "npm" | "yarn" | "pnpm";
  dependencies?: Record<string, string>;
  hasPackageJson?: boolean;
  hasEnvFiles?: boolean;
}

/**
 * 하나의 스텝(플랜 단위 동작)
 */
export interface MigrationStep {
  type: "create" | "modify" | "delete" | "copy";
  description: string;
  source?: string;
  target: string;
  content?: string;
  required: boolean; // ← PlanGenerator와 MigrationManager가 둘 다 boolean을 기대
}

/**
 * 전체 플랜
 */
export interface MigrationPlan {
  steps: MigrationStep[];
  confidence: number; // 0.0 ~ 1.0
  warnings: string[];
}

/**
 * 프레임워크 어댑터
 */
export interface FrameworkAdapter {
  name: string;
  detect(projectPath: string): Promise<boolean>;
  generateConfig(
    projectPath: string,
    options: MigrationOptions
  ): Promise<MigrationStep[]>;
  fixPackageJsonScripts(packageJson: any): any;
}

/**
 * 프로바이더(클라우드 등) 어댑터
 */
export interface ProviderAdapter {
  name: string;
  detect(projectPath: string): Promise<boolean>;
  transform(
    projectPath: string,
    options: MigrationOptions
  ): Promise<MigrationStep[]>;
}

/**
 * 배포 타깃 어댑터
 * - PlanGenerator가 (framework, projectPath, options)로 호출하므로 options 추가
 */
export interface TargetAdapter {
  name: string;
  generateConfig(
    framework: string,
    projectPath: string,
    options?: MigrationOptions
  ): Promise<MigrationStep[]>;
}

/* ─────────────────────────────────────────────────────────
   PlanGenerator 쪽에서 쓰던 타입 이름과 호환을 위한 별칭
   (기존 코드에 PlanResult/PlanStep이 남아 있어도 동작하도록)
   ───────────────────────────────────────────────────────── */
export type PlanStep = MigrationStep;
export type PlanResult = MigrationPlan;
