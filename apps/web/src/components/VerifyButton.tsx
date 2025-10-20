// apps/web/src/components/VerifyButton.tsx
"use client";
import React, { useMemo, useState } from "react";
import { runVerification } from "../lib/api";

type Props = {
  /** 로컬에서 검증할 마이그레이션된 프로젝트 경로 */
  projectPath?: string;
  /** 헬스체크 URL (예: http://localhost:5002/) */
  healthUrl?: string;
};

export default function VerifyButton({
  projectPath = "/absolute/path/to/migrated/project",
  healthUrl = "http://localhost:5002/",
}: Props) {
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] =
    useState<null | Awaited<ReturnType<typeof runVerification>>>(null);
  const [error, setError] = useState<string | null>(null);

  // 표시에 쓸 헬스 URL 정규화(끝에 / 보장)
  const normalizedHealthUrl = useMemo(() => {
    return healthUrl.endsWith("/") ? healthUrl : `${healthUrl}/`;
  }, [healthUrl]);

  async function handleVerify() {
    setVerifying(true);
    setError(null);
    setResult(null);
    try {
      const r = await runVerification(projectPath, normalizedHealthUrl);
      setResult(r);
    } catch (e: any) {
      setError(e?.message ?? "Verification failed");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div>
      <button
        disabled={verifying}
        onClick={handleVerify}
        className="btn btn-primary"
      >
        {verifying ? "Verifying..." : "Run Verification"}
      </button>

      {/* Health URL 항상 노출 */}
      <div className="mt-2 text-xs text-gray-500">
        Health URL: <code>{normalizedHealthUrl}</code>
      </div>

      {/* 오류 */}
      {error && (
        <div className="mt-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* 결과 */}
      {result && (
        <div className="mt-4 space-y-2 text-sm">
          <div>
            Install: {result.detail.install.ok ? "✅" : "❌"} (
            {result.detail.install.durationMs}ms)
          </div>
          <div>
            Build: {result.detail.build.ok ? "✅" : "❌"} (
            {result.detail.build.durationMs}ms)
          </div>
          {"run" in result.detail && result.detail.run && (
            <div>
              Run: {result.detail.run.ok ? "✅" : "❌"} (
              {result.detail.run.durationMs}ms)
            </div>
          )}

          {/* 로그 */}
          <pre className="mt-2 max-h-72 overflow-auto bg-black text-green-200 p-3 rounded">
{result.logs}
          </pre>
        </div>
      )}
    </div>
  );
}
