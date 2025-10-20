// node scripts/autofix.mjs [projectPath] [--dry]
import path from "node:path";
import {
  detect,
  diagnose,
  fixesFromDiagnoseMessages,
  buildAutoFixes,
  applyPatches,
} from "../packages/engine/dist/index.js";

const project = path.resolve(process.argv[2] || process.cwd());
const dry = process.argv.includes("--dry");

const det  = await detect(project);
const diag = await diagnose(project);

// 엔진 구현에 맞게 framework 전달 (당신 서버 코드와 동일 방식)
const autoFixes = await buildAutoFixes(project, det.framework);
const hintFixes = fixesFromDiagnoseMessages(diag?.messages ?? diag ?? []);

const toPatches = (fixes = []) => fixes.flatMap(f => f.plan ?? []);
const patches = [...toPatches(autoFixes), ...toPatches(hintFixes)];

console.log(`[autofix] framework=${det.framework}, patches=${patches.length}`);

if (dry) {
  console.log(JSON.stringify(patches, null, 2));
  process.exit(0);
}

if (patches.length) {
  const res = await applyPatches(project, patches);
  if (res?.success === false) {
    console.error("applyPatches failed:", res?.error || res);
    process.exit(1);
  }
  console.log("✅ applied");
} else {
  console.log("ℹ️  No patches to apply");
}
