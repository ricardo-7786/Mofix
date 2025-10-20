// packages/engine/src/utils/root.ts
import fs from "fs-extra";
import path from "path";

/**
 * ZIP을 풀었더니 최상단에 폴더가 한 겹 더 있는 흔한 케이스를 자동 보정한다.
 * 규칙:
 * 1) 현재 디렉터리에 package.json 있으면 그대로 사용
 * 2) 없으면, 하위 항목 중:
 *    - 단 하나의 디렉터리만 있고 그 안에 package.json 있으면 그 디렉터리로 승격
 *    - __MACOSX / .DS_Store 같은 보조 폴더는 무시
 *    - 여러 디렉터리 중 package.json 가진 디렉터리가 정확히 하나면 그 디렉터리로
 * 3) 그래도 못 찾으면 원래 경로 반환
 */
export async function resolveRealProjectRoot(originalRoot: string): Promise<string> {
  const hasPkgHere = await fs.pathExists(path.join(originalRoot, "package.json"));
  if (hasPkgHere) return originalRoot;

  const entries = await fs.readdir(originalRoot).catch(() => []);
  if (entries.length === 0) return originalRoot;

  // 보조/노이즈 폴더 필터링
  const ignore = new Set(["__MACOSX", ".DS_Store"]);
  const dirs: string[] = [];
  for (const name of entries) {
    if (ignore.has(name)) continue;
    const p = path.join(originalRoot, name);
    const stat = await fs.stat(p).catch(() => null as any);
    if (stat?.isDirectory()) dirs.push(name);
  }

  // 케이스 A: 디렉터리 하나만 → 그곳에 package.json 있으면 승격
  if (dirs.length === 1) {
    const only = path.join(originalRoot, dirs[0]);
    if (await fs.pathExists(path.join(only, "package.json"))) {
      return only;
    }
  }

  // 케이스 B: 여러 개 중 package.json 가진 디렉터리가 "정확히 하나"
  const candidates: string[] = [];
  for (const d of dirs) {
    const p = path.join(originalRoot, d);
    if (await fs.pathExists(path.join(p, "package.json"))) {
      candidates.push(p);
    }
  }
  if (candidates.length === 1) {
    return candidates[0];
  }

  // 못 찾으면 그대로 반환
  return originalRoot;
}
