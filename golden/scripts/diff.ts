import fs from "fs-extra";
import path from "path";
import pc from "picocolors";

const OUT_DIR = path.resolve("golden/results");
const files = (await fs.readdir(OUT_DIR)).filter(f=>/^result-\d+\.json$/.test(f)).sort();
if (files.length < 2) {
  console.log("Need at least 2 result files to diff.");
  process.exit(0);
}

const a = await fs.readJson(path.join(OUT_DIR, files[files.length-2]));
const b = await fs.readJson(path.join(OUT_DIR, files[files.length-1]));

const idxA: Record<string, any> = Object.fromEntries(a.results.map((r:any)=>[r.file, r]));
const idxB: Record<string, any> = Object.fromEntries(b.results.map((r:any)=>[r.file, r]));

console.log(pc.bold(`Comparing ${files[files.length-2]}  →  ${files[files.length-1]}\n`));
for (const k of Object.keys(idxB)) {
  const rA = idxA[k]; const rB = idxB[k];
  if (!rA) { console.log(pc.cyan(`+ new: ${k} (${rB.ok?'OK':'FAIL'})`)); continue; }
  const emoji = rB.ok === rA.ok ? "•" : (rB.ok ? "✅" : "❌");
  const dInstall = rB.installMs - rA.installMs;
  const dHealth = rB.healthMs - rA.healthMs;
  console.log(`${emoji} ${k}  ok:${rA.ok}→${rB.ok}  installΔ:${dInstall}ms  healthΔ:${dHealth}ms`);
}
