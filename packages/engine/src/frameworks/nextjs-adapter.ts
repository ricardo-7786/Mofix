import path from "path";
import fs from "fs-extra";
import type { MigrationStep, MigrationOptions } from "../core/types.js";

export const NextJSAdapter = {
  name: "nextjs",

  async detect(projectPath: string): Promise<boolean> {
    const pkgPath = path.join(projectPath, "package.json");
    if (!(await fs.pathExists(pkgPath))) return false;
    const pkg = await fs.readJson(pkgPath);
    return Boolean(pkg.dependencies?.next || pkg.devDependencies?.next);
  },

  async generateConfig(projectPath: string, _opts: MigrationOptions): Promise<MigrationStep[]> {
    const steps: MigrationStep[] = [];

    // next.config.(js|ts)
    const hasNextConfig =
      (await fs.pathExists(path.join(projectPath, "next.config.js"))) ||
      (await fs.pathExists(path.join(projectPath, "next.config.ts")));
    if (!hasNextConfig) {
      steps.push({
        type: "create",
        description: "Create Next.js configuration",
        target: "next.config.js",
        content: getNextConfigTemplateESM(),
        required: true,
      });
    }

    // postcss.config.js
    if (!(await fs.pathExists(path.join(projectPath, "postcss.config.js")))) {
      steps.push({
        type: "create",
        description: "Create PostCSS config",
        target: "postcss.config.js",
        content: getPostcssConfig(),
        required: false,
      });
    }

    // tailwind.config.js
    if (!(await fs.pathExists(path.join(projectPath, "tailwind.config.js")))) {
      steps.push({
        type: "create",
        description: "Create Tailwind config",
        target: "tailwind.config.js",
        content: getTailwindConfigForNext(),
        required: false,
      });
    }

    // .env.example
    if (!(await fs.pathExists(path.join(projectPath, ".env.example")))) {
      steps.push({
        type: "create",
        description: "Create environment variables example",
        target: ".env.example",
        content: `# Example
# NEXT_PUBLIC_API_URL=
`,
        required: false,
      });
    }

    // tsconfig.json (TS를 쓰는데 없으면)
    const hasTsConfig = await fs.pathExists(path.join(projectPath, "tsconfig.json"));
    if (!hasTsConfig) {
      const pkg = await safeReadJson(path.join(projectPath, "package.json"));
      const usesTS = Boolean(pkg?.dependencies?.typescript || pkg?.devDependencies?.typescript);
      if (usesTS) {
        steps.push({
          type: "create",
          description: "Create TypeScript configuration for Next.js",
          target: "tsconfig.json",
          content: getNextTsConfigTemplate(),
          required: false,
        });
      }
    }

    return steps;
  },

  // (선택) 보수적 스크립트 보정 — Plan의 normalize가 있으니 없어도 됨
  fixPackageJsonScripts(pkg: any) {
    pkg.scripts ??= {};
    pkg.scripts.dev ??= "next dev";
    pkg.scripts.build ??= "next build";
    pkg.scripts.start ??= "next start";
    return pkg;
  },
};

function getNextConfigTemplateESM(): string {
  return `/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true
};

export default nextConfig;
`;
}

function getPostcssConfig(): string {
  return `export default {
  plugins: { tailwindcss: {}, autoprefixer: {} }
};
`;
}

function getTailwindConfigForNext(): string {
  return `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: { extend: {} },
  plugins: []
};
`;
}

function getNextTsConfigTemplate(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2020",
        lib: ["dom", "dom.iterable", "ES2020"],
        allowJs: true,
        skipLibCheck: true,
        strict: true,
        forceConsistentCasingInFileNames: true,
        noEmit: true,
        esModuleInterop: true,
        module: "ESNext",
        moduleResolution: "NodeNext",
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: "preserve",
        incremental: true,
        plugins: [{ name: "next" }],
        paths: { "@/*": ["./src/*"] }
      },
      include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
      exclude: ["node_modules"]
    },
    null,
    2
  );
}

async function safeReadJson(p: string) {
  try { return await fs.readJson(p); } catch { return null; }
}
