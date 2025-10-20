// packages/engine/src/diagnose/rules/envGuide.ts
import fs from 'fs-extra';
import path from 'path';
import type { Evidence, Fix } from '../types.js';

export async function detectEnvGuide(projectRoot:string): Promise<Evidence|null> {
  const hasSample = await fs.pathExists(path.join(projectRoot,'.env.sample'));
  if (hasSample) return null;
  return {
    id: 'env-sample-missing',
    severity: 'low',
    summary: '.env.sample 이 없어 환경변수 이관이 어렵습니다.',
    files: [],
    autoFixable: true
  };
}

export function buildFixForEnvGuide(): Fix {
  return {
    id:'env-sample-missing',
    title: '.env.sample 생성',
    plan: [{
      type:'write',
      file: '.env.sample',
      content: `# Add your envs here\n# NEXT_PUBLIC_API_URL=\n`
    }],
    confidence: 0.8
  };
}
