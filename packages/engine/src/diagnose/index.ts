import fs from 'fs-extra';
import path from 'path';
import type { DiagnoseResult, Patch } from './types.js';
import { detectMissingScripts, buildFixForMissingScripts } from './rules/missingScripts.js';
import { detectEnvGuide, buildFixForEnvGuide } from './rules/envGuide.js';
import { detectNextConfig, buildFixForNextConfig } from './rules/nextConfig.js';

export async function diagnose(projectRoot:string): Promise<DiagnoseResult> {
  const evidences = [];
  const fixes = [];

  // load pkg once
  const pkgPath = path.join(projectRoot,'package.json');
  const pkg = await fs.pathExists(pkgPath) ? await fs.readJson(pkgPath) : {};

  // run detectors
  const e1 = await detectMissingScripts(projectRoot); if (e1) evidences.push(e1);
  const e2 = await detectEnvGuide(projectRoot);       if (e2) evidences.push(e2);
  const e3 = await detectNextConfig(projectRoot, pkg);if (e3) evidences.push(e3);

  // build fixes
  for (const e of evidences) {
    if (!e.autoFixable) continue;
    if (e.id === 'missing-scripts') {
      const fw = (e.data?.frameworkHint ?? 'unknown') as any;
      fixes.push(buildFixForMissingScripts(projectRoot, fw));
    }
    if (e.id === 'env-sample-missing') fixes.push(buildFixForEnvGuide());
    if (e.id === 'next-config-missing') fixes.push(buildFixForNextConfig());
  }

  return {
    evidences,
    fixes,
    summary: { issues: evidences.length, autoFixable: fixes.length }
  };
}

/* 실제 패치 적용기 */
export async function applyPatches(projectRoot:string, patches:Patch[]): Promise<void> {
  for (const p of patches) {
    const file = path.join(projectRoot, p.file);
    if (p.type === 'write') {
      if (p.ifNotExists && await fs.pathExists(file)) continue;
      await fs.outputFile(file, p.content);
    }
    if (p.type === 'mergeJson') {
      const current = await fs.pathExists(file) ? await fs.readJson(file) : {};
      const merged = deepMerge(current, p.merge);
      await fs.outputJson(file, merged, { spaces: 2 });
    }
    if (p.type === 'replaceInFile') {
      const old = await fs.pathExists(file) ? await fs.readFile(file,'utf8') : '';
      const next = old.replace(p.match as any, p.replace);
      await fs.outputFile(file, next);
    }
    if (p.type === 'delete') {
      await fs.remove(file);
    }
  }
}

function deepMerge(a:any, b:any) {
  if (Array.isArray(a) || Array.isArray(b) || typeof a!=='object' || typeof b!=='object') return b;
  const out = { ...a };
  for (const k of Object.keys(b)) out[k] = deepMerge(a[k], b[k]);
  return out;
}
