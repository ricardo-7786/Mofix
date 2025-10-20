// packages/engine/test-smoke.mjs
import { ProjectDetector } from "./dist/core/project-detector.js";
import { PlanGenerator } from "./dist/core/plan-generator.js";
import { Logger } from "./dist/core/logger.js";

const logger = new Logger();

async function main() {
  // 테스트할 프로젝트 경로 (인자 없으면 현재 폴더)
  const projectPath = process.argv[2] || process.cwd();

  console.log("▶ Project path:", projectPath);

  const detector = new ProjectDetector(logger);
  const planGen = new PlanGenerator(logger);

  const detection = await detector.detect(projectPath);
  console.log("▶ Detection:", detection);

  const plan = await planGen.generate(detection, {
    projectPath,
    logger,
    deploymentTarget: undefined,
    dryRun: true,
  });

  console.log("▶ Plan steps:", plan.steps.length);
  console.log("▶ First few steps:", plan.steps.slice(0, 5));
}

main().catch((err) => {
  console.error("❌ Smoke test failed:", err);
  process.exit(1);
});
