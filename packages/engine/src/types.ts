export type PatchStep =
  | { type: "create-file"; target: string; content: string; required?: boolean }
  | { type: "ensure-in-gitignore"; lines: string[] }
  | { type: "modify-package-json"; scripts: Record<string, string>; merge?: boolean }
  | { type: "install-deps"; deps: string[]; dev?: boolean };

export type Plan = {
  steps: PatchStep[];
  warnings?: string[];
  confidence?: number;
};
