// packages/engine/src/utils/packageJson.ts
import * as path from "path";
import fs from "fs-extra";
import type { MigrationStep } from "../core/types.js";

type Framework = "nextjs" | "vite";

type MergeOptions = {
  /** true면 기존 값을 덮어씁니다. 기본값 false(추가만). */
  override?: boolean;
};

type PlanOptions = MergeOptions & {
  /** 향후 필요 시: 설명에 옵션 노출 여부 등 확장용 */
};

type ImmediateOptions = MergeOptions & {
  /** 즉시 수정 시 백업 파일 생성 여부 (기본 true) */
  backup?: boolean;
};

const DESIRED_SCRIPTS: Record<Framework, Record<string, string>> = {
  nextjs: {
    dev: "next dev",
    build: "next build",
    start: "next start",
  },
  vite: {
    dev: "vite",
    build: "vite build",
    preview: "vite preview",
  },
};

/** pkg.scripts에 desired를 병합. override=false면 '없는 키만' 추가 */
function mergeScripts(
  pkgScripts: Record<string, string> | undefined,
  desired: Record<string, string>,
  { override = false }: MergeOptions = {}
) {
  const out: Record<string, string> = { ...(pkgScripts ?? {}) };
  let changed = false;

  for (const [k, v] of Object.entries(desired)) {
    const shouldWrite = override || out[k] == null;
    if (shouldWrite && out[k] !== v) {
      out[k] = v;
      changed = true;
    }
  }
  return { scripts: out, changed };
}

/** framework 표준 스크립트를 pkg에 적용한 다음 결과/변경여부 반환 */
function produceNextPkgWithScripts(pkg: any, framework: Framework, opts?: MergeOptions) {
  const desired = DESIRED_SCRIPTS[framework];
  const nextPkg = { ...pkg, scripts: { ...(pkg.scripts ?? {}) } };

  const { scripts, changed } = mergeScripts(nextPkg.scripts, desired, opts);
  nextPkg.scripts = scripts;

  return { nextPkg, changed };
}

/**
 * ✅ Plan 단계: package.json 스크립트 수정이 필요하면 "modify" Step 생성
 *  - 디스크에 바로 쓰지 않음 (엔진 Apply에서 content로 대체)
 *  - 기본은 사용자 커스텀 보존(override=false). 강제 교체하려면 opts.override=true 사용.
 */
export async function planUpdatePackageJsonScripts(
  projectPath: string,
  framework: Framework,
  opts: PlanOptions = {}
): Promise<MigrationStep[]> {
  const pkgPath = path.join(projectPath, "package.json");
  if (!(await fs.pathExists(pkgPath))) return [];

  const pkg = await fs.readJson(pkgPath).catch(() => null);
  if (!pkg || typeof pkg !== "object") return [];

  const { nextPkg, changed } = produceNextPkgWithScripts(pkg, framework, opts);
  if (!changed) return [];

  const pretty = JSON.stringify(nextPkg, null, 2) + "\n";

  return [
    {
      type: "modify",
      target: "package.json",
      description: `Update package.json scripts for ${framework}${opts.override ? " (override)" : ""}`,
      content: pretty, // Apply 단계에서 파일 전체를 이 내용으로 대체
      required: true,
    },
  ];
}

/**
 * ⚙️ 즉시 수정(디스크 기록) — 엔진 내부에서 필요할 때만 호출
 *  - 기본: 커스텀 보존(override=false)
 *  - 백업: package.json.mofix.bak 생성(backup=true)
 */
export async function fixPackageJsonImmediate(
  projectPath: string,
  framework: Framework,
  opts: ImmediateOptions = {}
) {
  const { override = false, backup = true } = opts;

  const pkgPath = path.join(projectPath, "package.json");
  if (!(await fs.pathExists(pkgPath))) {
    throw new Error("package.json not found in project");
  }

  const pkg = await fs.readJson(pkgPath);
  const { nextPkg, changed } = produceNextPkgWithScripts(pkg, framework, { override });

  if (!changed) return { changed: false };

  if (backup) {
    const bakPath = path.join(projectPath, "package.json.mofix.bak");
    // 기존 백업이 있으면 덮어쓰기(최근 상태만 유지)
    await fs.writeFile(bakPath, JSON.stringify(pkg, null, 2) + "\n");
  }

  await fs.writeJson(pkgPath, nextPkg, { spaces: 2 });
  return { changed: true };
}
