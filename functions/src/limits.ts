// functions/src/limits.ts
// 서버의 업로드/보관 한도를 일관되게 제공하는 헬퍼 (Cloud Functions v2 대응)

// ❌ v2에서는 functions.config() 사용 금지
// import { config } from "firebase-functions";

const num = (envKey: string, def: number) =>
  Number(process.env[envKey] ?? def);

const str = (envKey: string, def: string) =>
  String(process.env[envKey] ?? def);

export type Limits = {
  upload_mb: number;          // 1회 업로드 허용 용량(MB)
  uploads_per_day: number;    // (예비) 1일 업로드 횟수 제한
  bytes_per_month: number;    // (예비) 월 총 바이트 제한
  raw_ttl_days: number;       // 원본 ZIP 보관 기간(일)
  results_ttl_days: number;   // 결과 ZIP 보관 기간(일)
  gcs_bucket: string;         // 사용 중인 GCS 버킷 (예: "mofix-uploads")
};

export function getLimits(): Limits {
  return {
    upload_mb:        num("FREE_UPLOAD_MB",        500),
    uploads_per_day:  num("FREE_UPLOADS_PER_DAY",  1),
    bytes_per_month:  num("FREE_BYTES_PER_MONTH",  3 * 1024 * 1024 * 1024), // 3GB
    raw_ttl_days:     num("RAW_TTL_DAYS",          2),
    results_ttl_days: num("RESULTS_TTL_DAYS",      7),
    gcs_bucket:       str("GCS_BUCKET",            "mofix-uploads"),
  };
}
