// packages/engine/src/diagnose/rules/nextConfig.ts
import fs from 'fs-extra';
import path from 'path';
import type { Evidence, Fix } from '../types.js';

export async function detectNextConfig(projectRoot:string, pkg:any): Promise<Evidence|null> {
  const isNext = !!(pkg.dependencies?.next || pkg.devDependencies?.next);
  if (!isNext) return null;
  const hasConfig = await fs.pathExists(path.join(projectRoot,'next.config.js')) ||
                    await fs.pathExists(path.join(projectRoot,'next.config.ts'));
  if (hasConfig) return null;

  return {
    id:'next-config-missing',
    severity:'low',
    summary:'next.config.* 가 없습니다 (기본 템플릿 추가 권장).',
    files: [],
    autoFixable: true
  };
}

export function buildFixForNextConfig(): Fix {
  return {
    id:'next-config-missing',
    title:'next.config.js 기본 파일 생성',
    plan:[{
      type:'write',
      file:'next.config.js',
      content:`/** @type {import('next').NextConfig} */\nconst nextConfig = { reactStrictMode: true };\nmodule.exports = nextConfig;\n`
    }],
    confidence:0.85
  };
}
