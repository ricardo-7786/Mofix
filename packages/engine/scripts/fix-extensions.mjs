// scripts/fix-extensions.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(ROOT, "src");

const TS_FILES = [];
(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(name)) TS_FILES.push(p);
  }
})(SRC_DIR);

const addJs = (code) => {
  code = code.replace(
    /from\s+(['"])(\.{1,2}\/[^'"]+)\1/g,
    (m, q, pth) => (/\.(js|json)$/.test(pth) ? m : `from ${q}${pth}.js${q}`)
  );
  code = code.replace(
    /export\s+\*\s+from\s+(['"])(\.{1,2}\/[^'"]+)\1/g,
    (m, q, pth) => (/\.(js|json)$/.test(pth) ? m : `export * from ${q}${pth}.js${q}`)
  );
  return code;
};

for (const f of TS_FILES) {
  const before = fs.readFileSync(f, "utf8");
  const after = addJs(before);
  if (before !== after) {
    fs.writeFileSync(f, after, "utf8");
    console.log("fixed:", path.relative(ROOT, f));
  }
}

console.log("✅ done. add .js to relative imports.");
