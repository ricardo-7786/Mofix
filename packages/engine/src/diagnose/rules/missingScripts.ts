// packages/engine/src/diagnose/rules/missingScripts.ts
import fs from 'fs-extra';
import path from 'path';
import type { Evidence, Fix } from '../types.js';

export async function detectMissingScripts(projectRoot:string): Promise<Evidence|null> {
  const pkgPath = path.join(projectRoot, 'package.json');
  if (!await fs.pathExists(pkgPath)) return null;
  const pkg = await fs.readJson(pkgPath);
  const scripts = pkg.scripts || {};
  const missing = ['dev','build','start'].filter(k => !scripts[k]);
  if (missing.length === 0) return null;

  return {
    id: 'missing-scripts',
    severity: 'med',
    summary: `package.json에 스크립트(${missing.join(', ')})가 없습니다.`,
    files: ['package.json'],
    autoFixable: true,
    data: { frameworkHint: guessFramework(pkg) }
  };
}

function guessFramework(pkg:any): 'next'|'vite'|'express'|'unknown' {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (deps?.next) return 'next';
  if (deps?.vite) return 'vite';
  if (deps?.express) return 'express';
  return 'unknown';
}

export function buildFixForMissingScripts(projectRoot:string, framework:'next'|'vite'|'express'|'unknown'): Fix {
  const merge =
    framework === 'next' ? { scripts:{ dev:'next dev', build:'next build', start:'next start' } } :
    framework === 'vite' ? { scripts:{ dev:'vite', build:'vite build', start:'vite preview' } } :
    framework === 'express' ? { scripts:{ dev:'nodemon src/index.ts', build:'tsc', start:'node dist/index.js' } } :
    { scripts:{ dev:'node .', build:'echo "add build"', start:'node .' } };

  return {
    id: 'missing-scripts',
    title: 'package.json 스크립트 보정',
    plan: [{ type:'mergeJson', file:'package.json', merge }],
    confidence: 0.9
  };
}
