// golden/scripts/pack-logs.ts
import fs from "fs";
import path from "path";
import zlib from "zlib";

const ROOT = process.cwd();
const LOG_DIR = path.join(ROOT, "golden", "results", "logs");
const RETAIN_DAYS = 14;

fs.mkdirSync(LOG_DIR, { recursive: true });

function gzipFile(src: string) {
  if (!fs.existsSync(src)) return;
  const dst = src.endsWith(".gz") ? src : `${src}.gz`;
  if (fs.existsSync(dst)) return; // already compressed
  const gz = zlib.createGzip();
  fs.createReadStream(src).pipe(gz).pipe(fs.createWriteStream(dst)).on("finish", () => {
    try { fs.unlinkSync(src); } catch {}
  });
}

function purgeOld(days: number) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  for (const f of fs.readdirSync(LOG_DIR)) {
    const p = path.join(LOG_DIR, f);
    const st = fs.statSync(p);
    if (st.mtimeMs < cutoff) {
      try { fs.rmSync(p, { force: true }); } catch {}
    }
  }
}

for (const f of fs.readdirSync(LOG_DIR)) {
  const p = path.join(LOG_DIR, f);
  if (fs.statSync(p).isFile() && !p.endsWith(".gz")) gzipFile(p);
}
purgeOld(RETAIN_DAYS);
console.log("✅ log compress/rotate done");
