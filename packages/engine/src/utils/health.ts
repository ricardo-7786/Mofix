// packages/engine/src/utils/health.ts
import http from "http";
import https from "https";

function ping(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(url, (res) => { resolve(res.statusCode ? res.statusCode >= 200 && res.statusCode < 400 : false); });
    req.on("error", () => resolve(false));
    req.setTimeout(5000, () => { req.destroy(); resolve(false); });
  });
}

export async function waitForHealth(url: string, timeoutMs = 20000, intervalMs = 1000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await ping(url)) return { ok: true };
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return { ok: false };
}
