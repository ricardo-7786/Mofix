// apps/web/src/engine/types.ts
export interface ProjectFS {
    exists(path: string): Promise<boolean>;
    readFile(path: string): Promise<string | null>;
    writeFile(path: string, content: string): Promise<void>;
    glob(patterns: string[] | string, opts?: { limit?: number }): Promise<string[]>;
  }
  