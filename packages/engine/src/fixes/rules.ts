// packages/engine/src/fixes/rules.ts
import fs from "fs-extra";
import path from "path";
import suggestVersion from "../utils/depsRegistry.js";
import { readTsConfig } from "../utils/tsconfig.js";

// ─────────────────────────────────────────────────────────────────────────────
// Patch 타입
// ─────────────────────────────────────────────────────────────────────────────
export type PatchStep =
  | { type: "json.merge"; file: string; merge: Record<string, any> }
  | {
      type: "create";
      file?: string;
      target?: string;
      description?: string;
      required?: boolean;
      content?: string;
      overwrite?: boolean;
    }
  | { type: "write"; file: string; content: string | Buffer }
  | { type: "append"; file: string; content: string | Buffer }
  | {
      type: "text.patch";
      file: string;
      before?: string;
      after?: string;
      patches?:
        | { search: string; replace: string }[]
        | { search: string; replace: string };
      createIfMissing?: boolean;
    }
  | { type: "install"; pm?: "npm" | "pnpm" | "yarn" | "bun"; deps?: string[]; dev?: boolean }
  | {
      type: "run";
      cmd: string;
      args?: string[];
      cwd?: string;
      env?: Record<string, string>;
      stdio?: "inherit" | "pipe";
      timeoutMs?: number;
    }
  // 구버전 호환
  | { type: "modify"; target: string; description?: string; required?: boolean; content: string }
  | { type: "delete"; target: string; description?: string }
  | { type: "copy"; target: string; description?: string; content?: string }
  | { type: "install-old"; pkg: string; dev?: boolean; description?: string }
  | { type: "exec"; cmd: string; args?: string[]; cwd?: string; description?: string };

export type Fix = {
  id: string;
  title: string;
  plan: PatchStep[];
};

// ─────────────────────────────────────────────────────────────────────────────
// 템플릿 (Vite config / index.html)
// ─────────────────────────────────────────────────────────────────────────────
const VITE_CONFIG_TS_TEMPLATE = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist" },
  resolve: { alias: { "@": "/src" } },
  server: { host: true, port: 3000 }
});
`;

const INDEX_HTML_TEMPLATE = `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

// ─────────────────────────────────────────────────────────────────────────────
// 기본 자동 Fix (postcss / tailwind / next.config)
// ─────────────────────────────────────────────────────────────────────────────
export async function buildAutoFixes(
  projectRoot: string,
  framework: "nextjs" | "vite" | "express" | "unknown"
): Promise<Fix[]> {
  const fixes: Fix[] = [];

  // 1) postcss.config.js
  if (!(await fs.pathExists(path.join(projectRoot, "postcss.config.js")))) {
    fixes.push({
      id: "fix-postcss-config-missing",
      title: "Create postcss.config.js",
      plan: [
        {
          type: "create",
          target: "postcss.config.js",
          description: "Create default PostCSS config with tailwindcss & autoprefixer",
          required: true,
          content:
            `module.exports = {\n` +
            `  plugins: {\n` +
            `    tailwindcss: {},\n` +
            `    autoprefixer: {},\n` +
            `  },\n` +
            `};\n`,
        },
      ],
    });
  }

  // 2) tailwind.config.js
  if (!(await fs.pathExists(path.join(projectRoot, "tailwind.config.js")))) {
    const isNext = framework === "nextjs";
    const contentGlobs = isNext
      ? `["./pages/**/*.{js,ts,jsx,tsx,mdx}","./components/**/*.{js,ts,jsx,tsx,mdx}","./app/**/*.{js,ts,jsx,tsx,mdx}"]`
      : `["./index.html","./src/**/*.{js,ts,jsx,tsx}"]`;

    fixes.push({
      id: "fix-tailwind-config-missing",
      title: "Create tailwind.config.js",
      plan: [
        {
          type: "create",
          target: "tailwind.config.js",
          description: "Create default Tailwind config",
          content:
            `/** @type {import('tailwindcss').Config} */\n` +
            `module.exports = {\n` +
            `  content: ${contentGlobs},\n` +
            `  theme: { extend: {} },\n` +
            `  plugins: [],\n` +
            `};\n`,
        },
      ],
    });
  }

  // 3) next.config.js
  if (framework === "nextjs" && !(await fs.pathExists(path.join(projectRoot, "next.config.js")))) {
    fixes.push({
      id: "fix-next-config-missing",
      title: "Create next.config.js",
      plan: [
        {
          type: "create",
          target: "next.config.js",
          description: "Create minimal Next config",
          required: true,
          content: `module.exports = { reactStrictMode: true };\n`,
        },
      ],
    });
  }

  // 4) ESM/CJS 정합화
  const esmFix = await buildEsmCjsFix(projectRoot, framework);
  if (esmFix) fixes.push(esmFix);

  // 5) Vite outDir / index.html 보정 (Vite일 때)
  if (framework === "vite") {
    const viteFix = await buildViteOutputFix(projectRoot);
    if (viteFix) fixes.push(viteFix);
  }

  // 6) TS paths/alias 동기화 (프레임워크 무관)
  const tsAliasFix = await buildTsAliasFix(projectRoot);
  if (tsAliasFix) fixes.push(tsAliasFix);

  // 7) postinstall 가드
  const postinstallFix = await buildPostinstallGuardFix(projectRoot);
  if (postinstallFix) fixes.push(postinstallFix);

  // 8) ★ Replit 파일 무해화 (.replit, replit.nix 제거 또는 격리)
  const replitFix = await buildReplitNeutralizeFix(projectRoot);
  if (replitFix) fixes.push(replitFix);

  return fixes;
}

// ─────────────────────────────────────────────────────────────────────────────
// ESM/CJS 정합화: package.json "type" ↔ tsconfig module 설정 일치
// ─────────────────────────────────────────────────────────────────────────────
async function buildEsmCjsFix(
  projectRoot: string,
  framework: "nextjs" | "vite" | "express" | "unknown"
): Promise<Fix | null> {
  const pkgPath = path.join(projectRoot, "package.json");
  if (!(await fs.pathExists(pkgPath))) return null;

  const pkg = await fs.readJSON(pkgPath).catch(() => ({}));
  const ts = await readTsConfig(projectRoot);
  const usesTS =
    Boolean(pkg?.devDependencies?.typescript || pkg?.dependencies?.typescript) || Boolean(ts);

  // Next/Vite면 보정, Express는 TS 프로젝트일 때만
  if (framework !== "nextjs" && framework !== "vite" && !usesTS) return null;

  const isESM = pkg.type === "module";
  const steps: PatchStep[] = [];

  if (!isESM) {
    steps.push({ type: "json.merge", file: "package.json", merge: { type: "module" } });
  }

  if (!ts) {
    steps.push({
      type: "json.merge",
      file: "tsconfig.json",
      merge: {
        compilerOptions: {
          target: "ES2020",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          esModuleInterop: true,
          strict: true,
          skipLibCheck: true,
        },
        include: ["src", "app", "pages", "components"],
      },
    });
  } else {
    const need: any = { compilerOptions: {} };
    const co = ts.compilerOptions ?? {};
    if (co.module !== "NodeNext") need.compilerOptions.module = "NodeNext";
    if (co.moduleResolution !== "NodeNext") need.compilerOptions.moduleResolution = "NodeNext";
    if (co.esModuleInterop !== true) need.compilerOptions.esModuleInterop = true;
    if (Object.keys(need.compilerOptions).length > 0) {
      steps.push({ type: "json.merge", file: "tsconfig.json", merge: need });
    }
  }

  if (steps.length === 0) return null;
  return {
    id: "esm-cjs-consistency",
    title: "ESM/CJS 설정 정합화 (package.json & tsconfig.json)",
    plan: steps,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Vite outDir / index.html 보정
// ─────────────────────────────────────────────────────────────────────────────
async function buildViteOutputFix(projectRoot: string): Promise<Fix | null> {
  const viteConfigTs = path.join(projectRoot, "vite.config.ts");
  const viteConfigJs = path.join(projectRoot, "vite.config.js");
  const hasTs = await fs.pathExists(viteConfigTs);
  const hasJs = await fs.pathExists(viteConfigJs);

  const steps: PatchStep[] = [];

  // 1) vite.config 생성
  if (!hasTs && !hasJs) {
    steps.push({
      type: "create",
      target: "vite.config.ts",
      description: "Create Vite config with outDir and alias",
      content: VITE_CONFIG_TS_TEMPLATE,
      required: true,
    });
  } else {
    // 존재하면 간단 치환으로 outDir/alias 보정 (MVP 수준)
    const target = hasTs ? "vite.config.ts" : "vite.config.js";
    steps.push({
      type: "text.patch",
      file: target,
      createIfMissing: false,
      patches: [{ search: "build: {", replace: 'build: { outDir: "dist", ' }],
    });
    steps.push({
      type: "text.patch",
      file: target,
      createIfMissing: false,
      patches: [{ search: "resolve: {", replace: 'resolve: { alias: { "@": "/src" }, ' }],
    });
  }

  // 2) index.html 생성
  if (!(await fs.pathExists(path.join(projectRoot, "index.html")))) {
    steps.push({
      type: "create",
      target: "index.html",
      description: "Create base index.html for Vite",
      content: INDEX_HTML_TEMPLATE,
    });
  }

  if (steps.length === 0) return null;
  return {
    id: "vite-output-fix",
    title: "Vite build outDir/index.html 보정",
    plan: steps,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TS paths/alias 동기화
// ─────────────────────────────────────────────────────────────────────────────
async function buildTsAliasFix(projectRoot: string): Promise<Fix | null> {
  const tsPath = path.join(projectRoot, "tsconfig.json");
  const hasTs = await fs.pathExists(tsPath);
  const steps: PatchStep[] = [];

  if (!hasTs) {
    steps.push({
      type: "json.merge",
      file: "tsconfig.json",
      merge: {
        compilerOptions: {
          baseUrl: ".",
          paths: { "@/*": ["./src/*"] },
        },
        include: ["src", "app", "pages", "components"],
      },
    });
  } else {
    steps.push({
      type: "json.merge",
      file: "tsconfig.json",
      merge: { compilerOptions: { baseUrl: ".", paths: { "@/*": ["./src/*"] } } },
    });
  }

  if (steps.length === 0) return null;
  return {
    id: "ts-alias-fix",
    title: "tsconfig paths/alias 동기화",
    plan: steps,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// postinstall 가드
// ─────────────────────────────────────────────────────────────────────────────
const POSTINSTALL_RISKY_PATTERNS = [
  "prisma",
  "husky",
  "node-gyp",
  "playwright",
  "puppeteer",
  "esbuild",
  "electron",
  "sharp",
  "native",
];

async function buildPostinstallGuardFix(projectRoot: string): Promise<Fix | null> {
  const pkgPath = path.join(projectRoot, "package.json");
  if (!(await fs.pathExists(pkgPath))) return null;

  const pkg = await fs.readJson(pkgPath).catch(() => ({} as any));
  const scripts = pkg?.scripts || {};
  const original = scripts.postinstall as string | undefined;

  if (!original) return null;

  // 이미 가드 적용된 케이스 회피
  if (scripts["postinstall:original"] && /mofix/i.test(String(original))) return null;

  const isRisky = POSTINSTALL_RISKY_PATTERNS.some((p) =>
    String(original).toLowerCase().includes(p)
  );
  if (!isRisky) return null;

  const guardScript =
    'node -e "if(process.env.MOFIX_ALLOW_POSTINSTALL!==\'1\'){console.log(\'[MoFix] postinstall skipped\');process.exit(0)}else{console.log(\'[MoFix] postinstall allowed\')}"';

  const merge = {
    scripts: {
      "postinstall:original": original,
      postinstall: guardScript,
    },
  };

  const steps: PatchStep[] = [{ type: "json.merge", file: "package.json", merge }];

  return {
    id: "postinstall-guard",
    title: "postinstall 가드(위험 스크립트 임시 비활성)",
    plan: steps,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Replit 파일 무해화 (.replit / replit.nix 제거)
// ─────────────────────────────────────────────────────────────────────────────
async function buildReplitNeutralizeFix(projectRoot: string): Promise<Fix | null> {
  const replitFile = path.join(projectRoot, ".replit");
  const nixFile    = path.join(projectRoot, "replit.nix");

  const hasReplit = await fs.pathExists(replitFile);
  const hasNix    = await fs.pathExists(nixFile);

  if (!hasReplit && !hasNix) return null;

  const steps: PatchStep[] = [];

  // 간단·안전하게는 제거가 가장 충돌이 적음 (Replit 밖 환경에서만 적용됨)
  if (hasReplit) {
    steps.push({
      type: "delete",
      target: ".replit",
      description: "Remove Replit config to avoid local/CI toolchain conflicts",
    });
  }
  if (hasNix) {
    steps.push({
      type: "delete",
      target: "replit.nix",
      description: "Remove Replit nix config to avoid local/CI conflicts",
    });
  }

  // 선택적으로 안내 파일을 남겨두면 UX가 좋아짐
  steps.push({
    type: "create",
    target: ".mofix/README-REPLIT.txt",
    content:
      "Replit-specific files (.replit / replit.nix) were removed by MoFix to prevent conflicts in local/CI builds.\n" +
      "If you really need them, restore from VCS history or add them back only in Replit environment.",
  });

  return {
    id: "replit-neutralize",
    title: "Replit 전용 파일 무해화 (.replit / replit.nix 정리)",
    plan: steps,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Diagnose 로그 기반 Fix: MODULE_NOT_FOUND → deps 추가 & 설치
// ─────────────────────────────────────────────────────────────────────────────
export function fixesFromDiagnoseMessages(diag: any): Fix[] {
  const out: Fix[] = [];
  let text = "";

  if (diag?.logs && Array.isArray(diag.logs)) text = diag.logs.join("\n");
  else text = JSON.stringify(diag ?? {});

  const mods = new Set<string>();
  const rx = /MODULE_NOT_FOUND[^'"]*['"]([^'"]+)['"]/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text)) !== null) {
    const name = m[1];
    if (!/^node:/.test(name) && !name.startsWith("./") && !name.startsWith("../")) {
      mods.add(name);
    }
  }

  if (mods.size === 0) return out;

  for (const mod of mods) {
    const dev = isDefinitelyTypesPackage(mod);
    const version = suggestVersion(mod);

    const merge = dev
      ? { devDependencies: { [mod]: version } }
      : { dependencies: { [mod]: version } };

    const plan: PatchStep[] = [
      { type: "json.merge", file: "package.json", merge },
      { type: "install", deps: [mod], dev },
    ];

    out.push({
      id: `deps-missing-${mod}`,
      title: `Add missing ${dev ? "devDependency" : "dependency"}: ${mod}@${version}`,
      plan,
    });
  }

  return out;
}

// devDependencies로 분류할 가능성이 높은 패키지 힌트
function isDefinitelyTypesPackage(name: string): boolean {
  if (name.startsWith("@types/")) return true;
  if (/^eslint(-|$)/.test(name)) return true;
  if (/(-|^)plugin(-|$)/.test(name) && /vite|eslint|rollup|webpack/.test(name)) return true;
  return false;
}
