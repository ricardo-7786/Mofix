import path from "path";
import fs from "fs-extra";
import type { MigrationStep, MigrationOptions } from "../core/types.js";

export const ViteAdapter = {
  name: "vite",

  async detect(projectPath: string): Promise<boolean> {
    const pkgPath = path.join(projectPath, "package.json");
    if (!(await fs.pathExists(pkgPath))) return false;
    const pkg = await fs.readJson(pkgPath);
    return Boolean(pkg.dependencies?.vite || pkg.devDependencies?.vite);
  },

  async generateConfig(projectPath: string, _opts: MigrationOptions): Promise<MigrationStep[]> {
    const steps: MigrationStep[] = [];

    // vite.config.(ts|js)
    const hasViteConfig =
      (await fs.pathExists(path.join(projectPath, "vite.config.ts"))) ||
      (await fs.pathExists(path.join(projectPath, "vite.config.js")));
    if (!hasViteConfig) {
      steps.push({
        type: "create",
        description: "Create Vite configuration",
        target: "vite.config.ts",
        content: getViteConfigTemplate(),
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
        content: getTailwindConfigForVite(),
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
# VITE_API_URL=
`,
        required: false,
      });
    }

    return steps;
  },

  fixPackageJsonScripts(pkg: any) {
    pkg.scripts ??= {};
    pkg.scripts.dev ??= "vite";
    pkg.scripts.build ??= "vite build";
    pkg.scripts.preview ??= "vite preview";
    return pkg;
  },
};

function getViteConfigTemplate(): string {
  return `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 3000 },
  build: { outDir: "dist" },
  resolve: { alias: { "@": "/src" } }
});
`;
}

function getPostcssConfig(): string {
  return `export default {
  plugins: { tailwindcss: {}, autoprefixer: {} }
};
`;
}

function getTailwindConfigForVite(): string {
  return `/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: { extend: {} },
  plugins: []
};
`;
}
