// packages/engine/src/core/migration-manager.ts
import path from 'path';
import fs from 'fs-extra';
import type { MigrationOptions, DetectionResult, MigrationPlan, MigrationStep } from './types.js';
import { ProjectDetector } from './project-detector.js';
import { FileManager } from './file-manager.js';
import { BackupManager } from './backup-manager.js';
import { PlanGenerator } from './plan-generator.js';
import { PlanExecutor } from './plan-executor.js';
import { resolveRealProjectRoot } from '../utils/root.js'; // ★ 루트 보정 유틸 추가

export class MigrationManager {
  private options: MigrationOptions;
  private detector: ProjectDetector;
  private fileManager: FileManager;
  private backupManager: BackupManager;
  private planGenerator: PlanGenerator;
  private planExecutor: PlanExecutor;

  constructor(options: MigrationOptions) {
    this.options = options;
    this.detector = new ProjectDetector(options.logger);
    this.fileManager = new FileManager(options.logger);
    this.backupManager = new BackupManager(options.logger);
    this.planGenerator = new PlanGenerator(options.logger);
    this.planExecutor = new PlanExecutor(options.logger);
  }

  async execute(): Promise<void> {
    const { logger, deploymentTarget } = this.options;

    // ★ 입력 경로 보정: ZIP 한겹/보조폴더(__MACOSX 등) 상황 자동 처리
    const projectRoot = await resolveRealProjectRoot(this.options.projectPath);

    // Validate project path
    if (!(await fs.pathExists(projectRoot))) {
      throw new Error(`Project path does not exist: ${projectRoot}`);
    }

    // Validate deployment target
    if (deploymentTarget) {
      const supportedTargets = ['vercel', 'netlify', 'vscode'];
      if (!supportedTargets.includes(deploymentTarget)) {
        throw new Error(
          `Unsupported deployment target: ${deploymentTarget}. Supported targets: ${supportedTargets.join(', ')}`
        );
      }
    }

    logger.step('Detecting project configuration...');
    const detection = await this.detector.detect(projectRoot);

    if (!detection.framework) {
      logger.warning('Could not detect framework automatically');
    } else {
      logger.success(`Detected framework: ${detection.framework}`);
    }

    if (detection.provider) {
      logger.success(`Detected provider: ${detection.provider}`);
    }

    logger.step('Generating migration plan...');
    const plan = await this.planGenerator.generate(detection, {
      ...this.options,
      projectPath: projectRoot, // ★ 보정 경로로 전달
    });

    if (plan.confidence < 0.7) {
      logger.warning(`Low confidence score (${plan.confidence}). Manual review recommended.`);
    }

    if (plan.warnings.length > 0) {
      logger.warning('Warnings:');
      plan.warnings.forEach((warning) => logger.warning(`  - ${warning}`));
    }

    // Display plan
    this.displayPlan(plan);

    if (this.options.dryRun) {
      logger.info('Dry run mode - no changes will be applied');
      return;
    }

    // Create backup if requested
    if (this.options.createBackup) {
      logger.step('Creating backup...');
      await this.backupManager.createBackup(projectRoot); // ★ 보정 경로
      logger.success('Backup created successfully');
    }

    // Execute migration
    logger.step('Applying migration...');
    try {
      await this.planExecutor.execute(plan, {
        ...this.options,
        projectPath: projectRoot, // ★ 보정 경로
      });
      logger.success('Migration applied successfully');
    } catch (error) {
      logger.error('Migration failed. Rolling back...');
      if (this.options.createBackup) {
        await this.backupManager.rollback(projectRoot); // ★ 보정 경로
        logger.info('Rollback completed');
      }
      throw error;
    }

    // Display checklist
    this.displayChecklist(detection, plan);
  }

  private displayPlan(plan: MigrationPlan): void {
    const { logger } = this.options;

    logger.newLine();
    logger.info('📋 Migration Plan:');
    logger.newLine();

    plan.steps.forEach((step, _index) => {
      const prefix = step.required ? '✓' : '○';
      logger.log(`  ${prefix} ${step.description}`);
      if (step.target) {
        logger.log(`    → ${step.target}`);
      }
    });

    logger.newLine();
    logger.info(`Confidence: ${Math.round(plan.confidence * 100)}%`);
    logger.newLine();
  }

  private displayChecklist(detection: DetectionResult, _plan: MigrationPlan): void {
    const { logger } = this.options;

    logger.newLine();
    logger.info('📝 Post-Migration Checklist:');
    logger.newLine();

    const checklist = [
      'Open project in VS Code',
      'Install dependencies (npm install / yarn / pnpm install)',
      'Review and update environment variables in .env.local',
      'Test development server (npm run dev)',
      'Review generated configuration files',
      'Set up version control (git init, if not present)',
      'Deploy to target platform (if specified)',
    ];

    checklist.forEach((item) => {
      logger.log(`  ☐ ${item}`);
    });

    if (this.options.deploymentTarget) {
      logger.newLine();
      logger.info(`🚀 Deployment target: ${this.options.deploymentTarget}`);
      logger.info('Review the generated deployment configuration files');
    }

    logger.newLine();
  }
}
