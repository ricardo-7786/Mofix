import fs from "fs-extra";
import path from "path";

export type Detected = {
  framework: "next" | "vite" | "express" | "unknown";
  devCmd: string;
  port: number;
  healthPath: string;
  installCmd: string;
};

export async function detectProject(root: string): Promise<Detected> {
  const pkgJson = JSON.parse(
    await fs.readFile(path.join(root, "package.json"), "utf8")
  );

  const deps = { ...(pkgJson.dependencies || {}), ...(pkgJson.devDependencies || {}) };
  const scripts = pkgJson.scripts || {};
  const hasNext = "next" in deps;
  const hasVite = "vite" in deps;
  const hasExpress = "express" in deps;

  let out: Detected = {
    framework: "unknown",
    devCmd: scripts.dev || "node index.js",
    port: 3000,
    healthPath: "/",
    installCmd: "npm install",
  };

  if (hasNext) {
    const port = 3000;
    out = {
      framework: "next",
      devCmd: `next dev -p ${port}`,
      port,
      healthPath: "/",
      installCmd: "npm install",
    };
  } else if (hasVite) {
    const port = 5173;
    out = {
      framework: "vite",
      devCmd: `vite --port ${port}`,
      port,
      healthPath: "/",
      installCmd: "npm install",
    };
  } else if (hasExpress) {
    const port = 4000;
    const dev = scripts.dev || "node server.js";
    out = {
      framework: "express",
      devCmd: dev.includes("tsx") ? dev : `node server.js`,
      port,
      healthPath: "/api/ping",
      installCmd: "npm install",
    };
  }

  // ✅ 포트 정수화 & 기본값 폴백 (문자열/undefined 방지)
  out.port = Number.isFinite(Number(out.port)) ? Number(out.port) : 3000;

  return out;
}
