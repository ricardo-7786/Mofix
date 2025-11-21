import path from 'path';
import fs from 'fs-extra';
import type { FrameworkAdapter, MigrationOptions, MigrationStep } from '../core/types.js';

export class ExpressAdapter implements FrameworkAdapter {
  name = 'express';

  async detect(projectPath: string): Promise<boolean> {
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (await fs.pathExists(packageJsonPath)) {
      const packageJson = await fs.readJson(packageJsonPath);
      return !!(packageJson.dependencies?.express || packageJson.devDependencies?.express);
    }
    return false;
  }

  async generateConfig(projectPath: string, options: MigrationOptions): Promise<MigrationStep[]> {
    const steps: MigrationStep[] = [];

    // Check if nodemon config exists for development
    const nodemonConfigExists = await fs.pathExists(path.join(projectPath, 'nodemon.json'));
    if (!nodemonConfigExists) {
      steps.push({
        type: 'create',
        description: 'Create Nodemon configuration for development',
        target: 'nodemon.json',
        content: this.getNodemonConfigTemplate(),
        required: false
      });
    }

    return steps;
  }

  fixPackageJsonScripts(packageJson: any): any {
    packageJson.scripts = packageJson.scripts || {};
    
    if (!packageJson.scripts.dev) {
      packageJson.scripts.dev = 'nodemon server.js';
    }
    if (!packageJson.scripts.start) {
      packageJson.scripts.start = 'node server.js';
    }

    return packageJson;
  }

  private getNodemonConfigTemplate(): string {
    return JSON.stringify({
      "watch": ["src", "server.js", "index.js"],
      "ext": "js,json,ts",
      "ignore": ["node_modules/**", "dist/**"],
      "exec": "node server.js"
    }, null, 2);
  }
}