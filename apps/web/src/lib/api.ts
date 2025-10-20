// apps/web/src/lib/api.ts

/**
 * 실행 검증 API 호출
 * @param projectPath - 마이그레이션된 프로젝트 절대 경로
 * @param healthUrl   - (선택) 헬스체크 URL, 예: http://localhost:3000/
 */
export async function runVerification(projectPath: string, healthUrl?: string) {
    const res = await fetch("/api/verify/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectPath, healthUrl }),
    });
  
    if (!res.ok) {
      throw new Error(`verify failed: ${res.status} ${res.statusText}`);
    }
  
    return res.json() as Promise<{
      ok: boolean;
      detail: {
        install: { ok: boolean; durationMs: number };
        build: { ok: boolean; durationMs: number };
        run?: { ok: boolean; durationMs: number };
      };
      logs: string;
    }>;
  }
  