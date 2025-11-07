// golden/scripts/t4-gen.ts
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import AdmZip from "adm-zip";

const ROOT = process.cwd();
const OUT_DIR = path.resolve(ROOT, "golden/zips/T4");
fs.mkdirSync(OUT_DIR, { recursive: true });

/* ========= 공통 유틸 ========= */
function emptyDir(d: string) {
  if (!fs.existsSync(d)) return;
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    const s = fs.statSync(p);
    if (s.isDirectory()) emptyDir(p);
    fs.rmSync(p, { recursive: true, force: true });
  }
}
function mkTmpDir(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
function writeLargeFile(fp: string, bytes: number) {
  const fd = fs.openSync(fp, "w");
  const block = crypto.randomBytes(1024 * 1024); // 1MB
  const nBlocks = Math.floor(bytes / block.length);
  for (let i = 0; i < nBlocks; i++) fs.writeSync(fd, block);
  const remain = bytes - nBlocks * block.length;
  if (remain > 0) fs.writeSync(fd, block.subarray(0, remain));
  fs.closeSync(fd);
}
function zipDir(srcDir: string, outZip: string) {
  const zip = new AdmZip();
  const walk = (dir: string, rel = "") => {
    for (const name of fs.readdirSync(dir)) {
      const abs = path.join(dir, name);
      const relPath = path.join(rel, name).replace(/\\/g, "/");
      const st = fs.statSync(abs);
      if (st.isDirectory()) {
        walk(abs, relPath);
      } else {
        zip.addLocalFile(abs, path.posix.dirname(relPath), path.posix.basename(relPath));
      }
    }
  };
  walk(srcDir);
  zip.writeZip(outZip);
  console.log(`• wrote ${outZip} (${fs.statSync(outZip).size} bytes)`);
}

/* ========= 공통 서버 템플릿 ========= */
const SERVER_JS = `
const http = require('http');
const PORT = Number(process.env.PORT || 3000);
http.createServer((_, res) => { res.end('ok'); })
  .listen(PORT, '127.0.0.1', () => console.log('ok-' + PORT));
`;

/* ========= 샘플 생성기 ========= */

// 1) 300MB 대용량
function genBig300MB() {
  const tmp = mkTmpDir("t4-big-300-");
  const app = path.join(tmp, "app");
  fs.mkdirSync(app, { recursive: true });

  fs.writeFileSync(path.join(app, "package.json"), JSON.stringify({
    name: "t4-big-300mb",
    private: true,
    scripts: { dev: "node server.js" }
  }, null, 2));
  fs.writeFileSync(path.join(app, "server.js"), SERVER_JS);

  const assets = path.join(app, "public", "assets");
  fs.mkdirSync(assets, { recursive: true });
  writeLargeFile(path.join(assets, "big.bin"), 300 * 1024 * 1024);

  zipDir(app, path.join(OUT_DIR, "T4_big-300MB.zip"));
}

// 2) 1GB 대용량
function genBig1GB() {
  const tmp = mkTmpDir("t4-big-1g-");
  const app = path.join(tmp, "app");
  fs.mkdirSync(app, { recursive: true });

  fs.writeFileSync(path.join(app, "package.json"), JSON.stringify({
    name: "t4-big-1gb",
    private: true,
    scripts: { dev: "node server.js" }
  }, null, 2));
  fs.writeFileSync(path.join(app, "server.js"), SERVER_JS);

  const assets = path.join(app, "public", "assets");
  fs.mkdirSync(assets, { recursive: true });
  writeLargeFile(path.join(assets, "huge.bin"), 1024 * 1024 * 1024);

  zipDir(app, path.join(OUT_DIR, "T4_big-1GB.zip"));
}

/* C) 1GB 대용량 안전 함수 */
function genBig1GB_SAFE() {
  genBig1GB(); // 기존 1GB 생성기 호출
}

// 3) 5000개 파일 + 깊은 경로 + 유니코드
function genManyFilesDeep() {
  const tmp = mkTmpDir("t4-many-");
  const app = path.join(tmp, "app");
  fs.mkdirSync(app, { recursive: true });

  fs.writeFileSync(path.join(app, "package.json"), JSON.stringify({
    name: "t4-manyfiles",
    private: true,
    scripts: { dev: "node server.js" }
  }, null, 2));
  fs.writeFileSync(path.join(app, "server.js"), SERVER_JS);

  const base = path.join(
    app, "src",
    "aaaaaaaaaa".repeat(6),
    "한글폴더",
    "さらに深い階層",
    "مرحبا"
  );
  fs.mkdirSync(base, { recursive: true });

  const N = 5000;
  for (let i = 0; i < N; i++) {
    const sub = path.join(base, `dir_${Math.floor(i / 100)}`, `sub_${i % 100}`);
    fs.mkdirSync(sub, { recursive: true });
    const name = (i % 7 === 0)
      ? `파일_${i}_한글.txt`
      : `very-long-file-name-${i}-${"x".repeat(60)}.txt`;
    fs.writeFileSync(path.join(sub, name), `index=${i}\n`);
  }

  zipDir(app, path.join(OUT_DIR, "T4_manyfiles-5k-deep-unicode.zip"));
}

// 4) 긴 경로 집중
function genLongPaths() {
  const tmp = mkTmpDir("t4-long-");
  const app = path.join(tmp, "app");
  fs.mkdirSync(app, { recursive: true });

  fs.writeFileSync(path.join(app, "package.json"), JSON.stringify({
    name: "t4-longpaths",
    private: true,
    scripts: { dev: "node server.js" }
  }, null, 2));
  fs.writeFileSync(path.join(app, "server.js"), SERVER_JS);

  let deep = path.join(app, "src");
  const seg = "longsegment".repeat(5);
  for (let i = 0; i < 6; i++) deep = path.join(deep, seg + i);
  fs.mkdirSync(deep, { recursive: true });
  fs.writeFileSync(path.join(deep, "index.txt"), "long path check");

  zipDir(app, path.join(OUT_DIR, "T4_longpaths.zip"));
}

// 5) 비ASCII + 스페이스 이름
function genUnicodeOnly() {
  const tmp = mkTmpDir("t4-unicode-");
  const app = path.join(tmp, "app");
  fs.mkdirSync(app, { recursive: true });

  fs.writeFileSync(path.join(app, "package.json"), JSON.stringify({
    name: "t4-unicode",
    private: true,
    scripts: { dev: "node server.js" }
  }, null, 2));
  fs.writeFileSync(path.join(app, "server.js"), SERVER_JS);

  const udir = path.join(app, "데이터", "画像", "スペース 含む", "空白 폴더");
  fs.mkdirSync(udir, { recursive: true });
  fs.writeFileSync(path.join(udir, "한글 파일.txt"), "ok");
  fs.writeFileSync(path.join(udir, "空白 含む.txt"), "ok");

  zipDir(app, path.join(OUT_DIR, "T4_unicode-names.zip"));
}

/* A) 중첩 아카이브(Zip 안의 Zip들) */
function genNestedArchives() {
  const tmp = mkTmpDir("t4-nested-");
  const app = path.join(tmp, "app");
  fs.mkdirSync(app, { recursive: true });

  fs.writeFileSync(path.join(app, "package.json"), JSON.stringify({
    name: "t4-nested-archives",
    private: true,
    scripts: { dev: "node server.js" }
  }, null, 2));
  fs.writeFileSync(path.join(app, "server.js"), SERVER_JS);

  const archDir = path.join(app, "archives");
  fs.mkdirSync(archDir, { recursive: true });

  const makeInner = (name: string, txt: string) => {
    const z = new AdmZip();
    z.addFile("readme.txt", Buffer.from(txt));
    z.addFile("folder/inner.txt", Buffer.from("inner"));
    z.writeZip(path.join(archDir, name));
  };
  makeInner("inner-a.zip", "A");
  makeInner("inner-b.zip", "B");

  const innerDeep = new AdmZip();
  innerDeep.addFile("note.txt", Buffer.from("deep"));
  fs.writeFileSync(path.join(archDir, "inner-deep.zip"), innerDeep.toBuffer());

  zipDir(app, path.join(OUT_DIR, "T4_nested-archives.zip"));
}

/* B) 권한/윈도우 예약어/케이스/CRLF 에지 */
function genPermsAndWindowsEdges() {
  const tmp = mkTmpDir("t4-perms-win-");
  const app = path.join(tmp, "app");
  fs.mkdirSync(app, { recursive: true });

  fs.writeFileSync(path.join(app, "package.json"), JSON.stringify({
    name: "t4-perms-windows-edges",
    private: true,
    scripts: { dev: "node server.js" }
  }, null, 2));
  fs.writeFileSync(path.join(app, "server.js"), SERVER_JS);

  const dir = path.join(app, "weird dir with spaces");
  fs.mkdirSync(dir, { recursive: true });

  // 읽기 전용 파일
  const ro = path.join(dir, "read-only.txt");
  fs.writeFileSync(ro, "ro");
  try { fs.chmodSync(ro, 0o444); } catch {}

  // 실행 비트 파일
  const sh = path.join(dir, "run.sh");
  fs.writeFileSync(sh, "#!/bin/sh\necho ok\n");
  try { fs.chmodSync(sh, 0o755); } catch {}

  // CRLF 파일
  fs.writeFileSync(path.join(dir, "crlf.txt"), "a\r\nb\r\nc\r\n");

  // 윈도우 예약어 파일명들
  const RESERVED = ["con", "prn", "aux", "nul", "com1", "lpt1"];
  for (const r of RESERVED) {
    fs.writeFileSync(path.join(dir, `${r}.txt`), `reserved ${r}`);
  }

  // 대소문자 충돌 케이스
  const caseA = path.join(dir, "Case");
  const caseB = path.join(dir, "case");
  fs.mkdirSync(caseA, { recursive: true });
  fs.mkdirSync(caseB, { recursive: true });
  fs.writeFileSync(path.join(caseA, "a.txt"), "A");
  fs.writeFileSync(path.join(caseB, "a.txt"), "B");

  zipDir(app, path.join(OUT_DIR, "T4_perms-windows-edges.zip"));
}

// 8) ZipSlip
function genZipSlip() {
  const out = path.join(OUT_DIR, "T4_zipslip.zip");
  const zip = new AdmZip();
  zip.addFile("../evil.txt", Buffer.from("never extract outside"));
  zip.addFile("safe/ok.txt", Buffer.from("ok"));
  zip.writeZip(out);
  console.log(`• wrote ${out}`);
}

// 9) 손상 ZIP
function genCorrupt() {
  const out = path.join(OUT_DIR, "T4_corrupt.zip");
  fs.writeFileSync(out, Buffer.from([0x50, 0x4B, 0x03])); // "PK\x03"
  console.log(`• wrote ${out}`);
}

/* ========= 메인 ========= */
function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  emptyDir(OUT_DIR);

  genBig300MB();

  // ✅ 여유 되면 1GB 스트레스 테스트 실행
  genBig1GB_SAFE();

  genManyFilesDeep();
  genLongPaths();
  genUnicodeOnly();
  genNestedArchives();        // ✅ 필수 1
  genPermsAndWindowsEdges();  // ✅ 필수 2
  genZipSlip();
  genCorrupt();

  console.log(`\n✅ T4 샘플 생성 완료: ${OUT_DIR}`);
}
main();
