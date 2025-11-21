// packages/engine/src/core/zipper.ts
// --------------------------------------------------------------
// Firebase Functions에서 호출할 "ZIP 생성 헬퍼"
// - workDir 안에 .mofix/config.json 없으면 자동 생성
// - workDir 전체를 outZipPath 로 ZIP으로 압축
// --------------------------------------------------------------

import path from "path";
import fs from "fs-extra";
import archiver from "archiver";

export type CreateResultZipOptions = {
  sessionId?: string;
  uid?: string;
  meta?: Record<string, any>;
};

/**
 * workDir 안의 내용을 outZipPath 경로의 ZIP 파일로 만든다.
 * - .mofix/config.json 이 없으면 기본 템플릿을 생성해준다.
 */
export async function createResultZip(
  workDir: string,
  outZipPath: string,
  options: CreateResultZipOptions = {}
): Promise<void> {
  // 1) .mofix/config.json 보장
  const configPath = path.join(workDir, ".mofix", "config.json");
  const hasConfig = await fs.pathExists(configPath);

  if (!hasConfig) {
    await fs.ensureDir(path.dirname(configPath));
    await fs.writeJSON(
      configPath,
      {
        projectName: "MoFix Project",
        createdAt: new Date().toISOString(),
        sessionId: options.sessionId ?? null,
        uid: options.uid ?? null,
        meta: options.meta ?? {},
      },
      { spaces: 2 }
    );
  }

  // 2) ZIP 생성할 디렉토리 보장
  await fs.ensureDir(path.dirname(outZipPath));

  // 3) archiver 로 workDir 전체를 ZIP으로 만들기
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(outZipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => {
      resolve();
    });

    output.on("error", (err) => {
      reject(err);
    });

    archive.on("error", (err) => {
      reject(err);
    });

    archive.pipe(output);

    // workDir 안의 모든 파일/폴더를 ZIP 루트에 넣기
    archive.directory(workDir + "/", false);

    archive.finalize();
  });
}
