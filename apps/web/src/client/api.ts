// apps/web/src/client/api.ts
// ------------------------------------------------------
// 통합 API 유틸
// - BASE + 헬스체크
// - Firebase 인증 헤더 자동 주입
// - 일반 api<T>() 래퍼 (413 안전 처리 포함)
// - 사용량(remaining/quota) 전용 API
// - 업로드(plan) 413 처리 (HTML/JSON 모두 안전)
// ------------------------------------------------------

import { auth } from "../firebase"; // Firebase Auth 인스턴스

// TODO: 필요하면 .env로 분리 (예: VITE_API_BASE / NEXT_PUBLIC_API_BASE)
const BASE = "https://api-yqpwamvbqq-du.a.run.app";

/* =========================
 * 공통: 인증 헤더
 * ========================= */
async function withAuthHeaders(init?: RequestInit): Promise<Readonly<RequestInit>> {
  const idToken = await auth.currentUser?.getIdToken();
  // 기본은 JSON API에 맞춘다. (필요 시 호출부에서 덮어쓰기)
  const defaultHeaders: HeadersInit = {
    "Content-Type": "application/json",
    ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
  };
  return {
    ...(init || {}),
    headers: {
      ...defaultHeaders,
      ...(init?.headers || {}),
    },
  } as const;
}

/* =========================
 * 413 안전 파서 (HTML/JSON 양쪽)
 * ========================= */
async function throwFrom413(r: Response, fallback = "파일이 너무 큽니다. (업로드 한도 초과)") {
  let msg = fallback;
  try {
    const ct = r.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const j = await r.json().catch(() => ({} as any));
      msg = (j?.error as string) || (j?.message as string) || msg;
    } else {
      // HTML일 수 있으므로 내용은 버리고 고정 문구 사용
      await r.text().catch(() => "");
    }
  } catch {}
  throw new Error(msg);
}

/* =========================
 * 1) 헬스체크
 * ========================= */
export async function pingHealth(): Promise<string> {
  const r = await fetch(`${BASE}/health`, { method: "GET" });
  if (!r.ok) throw new Error(`health ${r.status}`);
  return r.text(); // 예: "ok-YYYY-MM-DD"
}

/* =========================
 * 2) 서버 한도 확인 (/limits)
 * ========================= */
export type Limits = {
  upload_mb: number;
  uploads_per_day: number;
  bytes_per_month: number;
  raw_ttl_days: number;
  results_ttl_days: number;
  gcs_bucket: string;
};
export async function fetchLimits(): Promise<Limits> {
  const r = await fetch(`${BASE}/limits`, { method: "GET" });
  if (!r.ok) throw new Error(`/limits ${r.status}`);
  return r.json();
}

/* =========================
 * 3) 일반 JSON API 래퍼
 *    - 413도 안전 처리
 * ========================= */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${path}`, await withAuthHeaders(init));
  if (r.status === 413) await throwFrom413(r);
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`${path} ${r.status} ${text}`);
  }
  return (await r.json()) as T;
}

/* =========================
 * 4) 업로드(plan) 전용 호출
 *    - BodyInit 그대로 받음 (Blob/File/ArrayBuffer 등)
 *    - 413 대응(HTML/JSON)
 *    - 업로드 시에는 application/octet-stream 권장
 * ========================= */
export async function postPlan(body: BodyInit) {
  // 업로드에는 JSON 기본 헤더 대신 바이너리 타입을 씌운다.
  const idToken = await auth.currentUser?.getIdToken();
  const r = await fetch(`${BASE}/plan`, {
    method: "POST",
    headers: {
      // 실제 바디가 Blob/File/ArrayBuffer라면 이 타입이 가장 안전
      "Content-Type": "application/octet-stream",
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
    body,
  });

  if (r.status === 413) await throwFrom413(r);
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`POST /plan ${r.status} ${text}`);
  }
  return r.json() as Promise<{ sessionId: string }>;
}

/* =========================
 * 5) Apply / Preview (데모 라우트에 맞춤)
 * ========================= */
export async function postApply(sessionId: string) {
  return api<{ resultId: string; logs?: string[]; downloadUrl?: string }>(
    `/apply/${encodeURIComponent(sessionId)}`,
    { method: "POST" }
  );
}
export async function startPreview() {
  return api<{ resultId: string; previewUrl: string }>(`/preview/start`, { method: "POST" });
}

/* =========================
 * 6) 사용량/쿼터 API
 *    (서버 스펙: /usage/me, /usage/bump {op})
 * ========================= */
export type UsageMe = {
  ok: boolean;
  usage: {
    upload: number;
    apply: number;
    preview: number;
    total: number;
    updatedAt: string | null;
  };
};

export async function fetchUsageMe(): Promise<UsageMe> {
  const r = await fetch(`${BASE}/usage/me`, await withAuthHeaders());
  if (!r.ok) throw new Error(`GET /usage/me ${r.status}`);
  return r.json();
}

/** 서버 사양에 맞게 JSON 바디로 전송 (upload/apply/preview/download) */
export async function bumpUsage(op: "upload" | "apply" | "preview" | "download") {
  const r = await fetch(`${BASE}/usage/bump`, await withAuthHeaders({
    method: "POST",
    body: JSON.stringify({ op }),
  }));
  if (!r.ok) throw new Error(`POST /usage/bump ${r.status}`);
  return r.json();
}
