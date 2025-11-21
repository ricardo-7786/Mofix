// apps/web/src/lib/api.ts
import { auth } from "./firebase";
import { onAuthStateChanged, type User } from "firebase/auth";

/** ✅ Cloud Functions 베이스 URL (.env.local 필요) */
const BASE = (process.env.NEXT_PUBLIC_FUNCTIONS_URL ?? "").replace(/\/+$/, "");
if (!BASE) {
  console.warn(
    "[api] Functions BASE URL이 비어 있습니다. apps/web/.env.local 에 NEXT_PUBLIC_FUNCTIONS_URL을 설정하세요."
  );
}

/** ✅ 현재 사용자 ID 토큰 (익명 로그인 상태 포함) */
async function getIdToken(): Promise<string | undefined> {
  const user: User | null =
    auth.currentUser ??
    (await new Promise<User | null>((resolve) => {
      const unsub = onAuthStateChanged(auth, (u) => {
        unsub();
        resolve(u);
      });
    }));

  return await user?.getIdToken();
}

/** ✅ Authorization 헤더 자동 부착 fetch */
async function authFetch(path: string, init?: RequestInit) {
  const token = await getIdToken();
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${BASE}${path}`, { ...init, headers });
}

/** ✅ GET /usage/me */
export async function getUsageMe(): Promise<Record<string, any>> {
  const r = await authFetch(`/usage/me`);
  if (!r.ok) throw new Error(`GET /usage/me ${r.status}`);
  return r.json();
}

/** ✅ POST /usage/bump — op: upload | apply | preview */
export async function bumpUsage(
  op: "upload" | "apply" | "preview"
): Promise<Record<string, any>> {
  const r = await authFetch(`/usage/bump`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op }),
  });

  if (r.status === 429) {
    const body = await r.json().catch(() => ({}));
    const err = new Error("quota_exceeded") as any;
    err.code = "quota_exceeded";
    err.body = body;
    throw err;
  }
  if (!r.ok) throw new Error(`POST /usage/bump ${r.status}`);
  return r.json();
}
// 기존 서버 라우트(/api/verify/run)를 호출하는 호환 함수
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