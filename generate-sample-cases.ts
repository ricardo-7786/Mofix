import fs from "fs-extra";
import path from "path";

const FRAMEWORKS = ["nextjs", "vite", "cra", "express"];
const CASES_DIR = path.join(process.cwd(), "cases");

async function main() {
  await fs.ensureDir(CASES_DIR);

  for (let i = 0; i < 3; i++) {  // 한 번에 3개씩 생성
    const fw = FRAMEWORKS[Math.floor(Math.random() * FRAMEWORKS.length)];
    const caseName = `${fw}-${Date.now()}-${i}`;
    const caseDir = path.join(CASES_DIR, caseName);

    await fs.ensureDir(caseDir);

    // 예시: package.json 생성
    const pkg = {
      name: caseName,
      version: "1.0.0",
      scripts: fw === "nextjs" ? { dev: "next dev" } : { start: "node index.js" },
    };
    await fs.writeJSON(path.join(caseDir, "package.json"), pkg, { spaces: 2 });

    // 예시: index 파일
    const indexContent =
      fw === "express"
        ? `const express = require("express"); const app = express(); app.listen(3000);`
        : `console.log("Hello from ${fw}");`;

    await fs.writeFile(path.join(caseDir, "index.js"), indexContent);

    console.log(`Generated case: ${caseName}`);
  }
}

main();
