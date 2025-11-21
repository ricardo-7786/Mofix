// packages/engine/src/utils/tsconfig.ts
import fs from "fs-extra";
import path from "path";

export type TsConfig = {
  compilerOptions?: {
    target?: string;
    module?: string;
    moduleResolution?: string;
    baseUrl?: string;
    paths?: Record<string, string[]>;
    esModuleInterop?: boolean;
    strict?: boolean;
    skipLibCheck?: boolean;
    [k: string]: any;
  };
  include?: string[];
  exclude?: string[];
  [k: string]: any;
};

/** tsconfig.json을 읽어서 객체 반환. 없거나 파싱 실패 시 null */
export async function readTsConfig(projectRoot: string): Promise<TsConfig | null> {
  const p = path.join(projectRoot, "tsconfig.json");
  if (!(await fs.pathExists(p))) return null;
  try {
    return (await fs.readJson(p)) as TsConfig;
  } catch {
    return null;
  }
}

/** 얕은 병합으로 tsconfig.json 저장(없으면 생성) */
export async function writeTsConfig(projectRoot: string, data: Partial<TsConfig>): Promise<void> {
  const p = path.join(projectRoot, "tsconfig.json");
  const prev: TsConfig = (await fs.pathExists(p)) ? ((await fs.readJson(p)) as TsConfig) : {};
  const next: TsConfig = {
    ...prev,
    ...data,
    compilerOptions: { ...prev.compilerOptions, ...data.compilerOptions },
  };
  await fs.ensureDir(path.dirname(p));
  await fs.writeJson(p, next, { spaces: 2 });
}

/** compilerOptions 특정 키를 보장하여 설정 */
export function ensureCompilerOption(obj: any, key: string, value: any) {
  obj.compilerOptions = obj.compilerOptions ?? {};
  obj.compilerOptions[key] = value;
}

/** package.json을 기준으로 TS 프로젝트 여부 판단 */
export function isTsProject(pkg: any): boolean {
  return Boolean(pkg?.devDependencies?.typescript || pkg?.dependencies?.typescript);
}
