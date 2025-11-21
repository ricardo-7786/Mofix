// src/engine/detectors/tailwind.ts
import { ProjectFS } from "../types"; // readFile, exists, glob 등 추상 FS
const TAILWIND_CLASS_RE =
  /\b(text-(xs|sm|base|lg|xl|\d+)|bg-[a-z0-9-]+|font-(bold|semibold|light)|p[xytrbl]?-\d+|m[xytrbl]?-\d+|rounded(-[a-z0-9]+)?)\b/;

export type TailwindIssue = {
  router: "app" | "pages" | "unknown";
  hasConfig: boolean;
  hasPostcss: boolean;
  hasGlobalCss: boolean;
  hasGlobalImport: boolean;
  globalImportFile?: string;
  twClassesFound: boolean;
};

export async function detectTailwindIssue(fs: ProjectFS): Promise<TailwindIssue | null> {
  // 1) 파일 구조 파악
  const hasApp = await fs.exists("app");
  const hasPages = await fs.exists("pages");
  const router: TailwindIssue["router"] = hasApp ? "app" : hasPages ? "pages" : "unknown";

  // 2) 구성 파일 존재 여부
  const hasConfig = await fs.exists("tailwind.config.js") || await fs.exists("tailwind.config.ts");
  const hasPostcss = await fs.exists("postcss.config.js");
  const hasGlobalCss =
    (await fs.exists("app/globals.css")) || (await fs.exists("styles/globals.css"));

  // 3) 전역 CSS import 확인
  let hasGlobalImport = false;
  let globalImportFile: string | undefined;
  const layoutCandidates =
    router === "app"
      ? ["app/layout.tsx", "app/layout.jsx"]
      : ["pages/_app.tsx", "pages/_app.jsx"];
  for (const p of layoutCandidates) {
    if (await fs.exists(p)) {
      const code = (await fs.readFile(p)) || "";
      if (code.includes("globals.css")) {
        hasGlobalImport = true;
        globalImportFile = p;
        break;
      }
    }
  }

  // 4) 코드 내 Tailwind 클래스 존재 여부(빠른 휴리스틱)
  const sampleFiles = await fs.glob(["**/*.tsx", "**/*.jsx", "**/*.ts", "**/*.js"], { limit: 200 });
  let twClassesFound = false;
  for (const f of sampleFiles) {
    const src = await fs.readFile(f);
    if (src && TAILWIND_CLASS_RE.test(src)) { twClassesFound = true; break; }
  }

  // 5) 문제 판단
  const missingAny = !hasConfig || !hasPostcss || !hasGlobalCss || !hasGlobalImport;
  if (twClassesFound && missingAny) {
    return { router, hasConfig, hasPostcss, hasGlobalCss, hasGlobalImport, globalImportFile, twClassesFound };
  }
  return null;
}
