// packages/engine/fix-extensions.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "src");

const TS_EXTS = [".ts", ".tsx", ".mts", ".cts"];
const JS_EXTS = [".js", ".mjs", ".cjs", ".json"];
const isRelative = (s) => s.startsWith("./") || s.startsWith("../");

function hasKnownExt(spec) {
  return [...TS_EXTS, ...JS_EXTS].some(
    (ext) => spec.endsWith(ext) || spec.includes(`${ext}?`) || spec.includes(`${ext}#`)
  );
}
function splitQueryHash(spec) {
  const m = spec.match(/^([^?#]+)(.*)$/);
  return m ? { base: m[1], tail: m[2] } : { base: spec, tail: "" };
}
function resolveToJs(spec, fileDir) {
  const { base, tail } = splitQueryHash(spec);
  if (JS_EXTS.some((e) => base.endsWith(e))) return spec;
  if (TS_EXTS.some((e) => base.endsWith(e))) return base.replace(/\.(?:[mc]?ts|tsx)$/, ".js") + tail;

  const abs = path.resolve(fileDir, base);
  for (const e of TS_EXTS) if (fs.existsSync(abs + e)) return `${base}.js${tail}`;
  if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
    for (const e of TS_EXTS) if (fs.existsSync(path.join(abs, `index${e}`))) return `${base}/index.js${tail}`;
  }
  return `${base}.js${tail}`;
}

function rewriteOneFile(filePath) {
  const dir = path.dirname(filePath);
  let src = fs.readFileSync(filePath, "utf8");
  let changed = false;

  const rewriters = [
    /(from\s+["'])(\.[^"']+?)(["'])/g,                              // import ... from '...'
    /(export\s+[^;]*\s+from\s+["'])(\.[^"']+?)(["'])/g,             // export ... from '...'
    /(import\(\s*["'])(\.[^"']+?)(["']\s*\))/g,                     // dynamic import('...')
    /^(\s*import\s+["'])(\.[^"']+?)(["'];?)/gm,                     // side-effect import '...'
  ];

  for (const re of rewriters) {
    src = src.replace(re, (m, a, spec, z) => {
      if (!isRelative(spec)) return m;
      const next = hasKnownExt(spec)
        ? spec.replace(/\.(?:[mc]?ts|tsx)(?=($|[?#]))/, ".js")
        : resolveToJs(spec, dir);
      if (next !== spec) changed = true;
      return `${a}${next}${z}`;
    });
  }

  if (changed) fs.writeFileSync(filePath, src, "utf8");
}

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const s = fs.statSync(p);
    if (s.isDirectory()) walk(p);
    else if (/\.(?:ts|tsx|mts|cts)$/.test(p) && !p.endsWith(".d.ts")) {
      rewriteOneFile(p);
    }
  }
}

walk(ROOT);
console.log("✔ rewrote relative imports to valid ESM (.js or /index.js)");
