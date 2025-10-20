import { describe, test, expect, beforeAll } from "@jest/globals";
import request from "supertest";
import path from "path";
import { pathToFileURL } from "url";

let app: any;

beforeAll(async () => {
  // 절대경로를 file:// URL로 변환 후 동적 import
  const entryTs = path.join(process.cwd(), "packages/engine/src/index.ts");
  const mod = await import(pathToFileURL(entryTs).href);
  app = mod.app;
});

describe("engine e2e", () => {
  const FIX = `${process.cwd()}/.fixtures`;

  test("vite: plan + dryRun + apply", async () => {
    const projectPath = `${FIX}/vite`;

    const planRes = await request(app).post("/api/plan").send({ projectPath });
    expect(planRes.body.ok).toBe(true);
    expect(Array.isArray(planRes.body.plan.steps)).toBe(true);

    const dry = await request(app)
      .post("/api/apply")
      .send({ projectPath, dryRun: true });

    expect(dry.body.ok).toBe(true);
    expect(dry.body.dryRun).toBe(true);
  });
});
