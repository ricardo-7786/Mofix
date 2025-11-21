// packages/engine/src/utils/planHelpers.ts
import * as path from "path";
import fs from "fs-extra";
import type { MigrationStep } from "../core/types.js";

export async function planCreateIfMissing(
  projectPath: string,
  relativeFile: string,
  content: string
): Promise<MigrationStep[]> {
  const abs = path.join(projectPath, relativeFile);
  if (await fs.pathExists(abs)) return [];
  return [
    {
      type: "create",
      target: relativeFile,
      description: `Create ${relativeFile}`,
      content,
      required: true
    }
  ];
}

export async function planEnsureGitignoreLines(
  projectPath: string,
  lines: string[]
): Promise<MigrationStep[]> {
  const rel = ".gitignore";
  const abs = path.join(projectPath, rel);

  const exists = await fs.pathExists(abs);
  const current = exists ? await fs.readFile(abs, "utf8") : "";
  const have = new Set(current.split(/\r?\n/).map((l) => l.trim()));

  const missing = lines.filter((ln) => !have.has(ln.trim()));
  if (missing.length === 0) return [];

  const appended =
    current
      ? (current.endsWith("\n") ? current : current + "\n") + missing.join("\n") + "\n"
      : missing.join("\n") + "\n";

  return [
    {
      type: exists ? "modify" : "create",
      target: rel,
      description: `.gitignore ensure entries (${missing.length})`,
      content: appended,
      required: true
    }
  ];
}
