// apps/web/src/client/App.tsx
import React, { useState, useCallback } from "react";
import VerifyButton from "../components/VerifyButton";
import "./styles.css";

/** ===== Types ===== */
interface DetectionResult {
  framework: string | null;
  provider: string | null;
  packageManager: string;
  dependencies: Record<string, string>;
  hasPackageJson: boolean;
  hasEnvFiles: boolean;
}
interface MigrationStep {
  type: "create" | "modify" | "delete" | "copy";
  description: string;
  target: string;
  required: boolean;
}
interface Plan { steps: MigrationStep[]; confidence: number; warnings: string[]; }
interface PlanResponse { detection: DetectionResult; plan: Plan; }
interface ApplyResponse { resultId: string; success: boolean; logs: string[]; }
type Step = "upload" | "plan" | "apply" | "download";

/** ===== Component ===== */
const App = () => {
  const [currentStep, setCurrentStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [planData, setPlanData] = useState<PlanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [applyResult, setApplyResult] = useState<ApplyResponse | null>(null);
  const [forceOverwrite, setForceOverwrite] = useState(false);
  const [createBackup, setCreateBackup] = useState(true);
  const [logs, setLogs] = useState<string[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [startingPreview, setStartingPreview] = useState(false);

  const showError = (message: string) => {
    setError(message);
    setTimeout(() => setError(""), 5000);
  };

  const handleFileUpload = useCallback((uploadedFile: File) => {
    if (!uploadedFile.name.endsWith(".zip")) {
      showError("Please upload a ZIP file");
      return;
    }
    setFile(uploadedFile);
    setCurrentStep("plan");
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const uploadedFile = e.dataTransfer.files?.[0];
    if (uploadedFile) handleFileUpload(uploadedFile);
  }, [handleFileUpload]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (uploadedFile) handleFileUpload(uploadedFile);
  };

  const generatePlan = async () => {
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("project", file);
      const res = await fetch("/api/plan", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Failed to generate plan");
      const data: PlanResponse = await res.json();
      setPlanData(data);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to generate plan");
    } finally {
      setLoading(false);
    }
  };

  const applyMigration = async () => {
    if (!file) return;
    setLoading(true);
    setError("");
    setLogs([]);
    try {
      const formData = new FormData();
      formData.append("project", file);
      formData.append("force", String(forceOverwrite));
      formData.append("backup", String(createBackup));
      const res = await fetch("/api/apply", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Failed to apply migration");
      const data: ApplyResponse = await res.json();
      setApplyResult(data);
      setLogs(data.logs);
      setCurrentStep("download");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to apply migration");
    } finally {
      setLoading(false);
    }
  };

  const startLivePreview = async () => {
    if (!file) return;
    setStartingPreview(true);
    setPreviewUrl(null);
    try {
      const form = new FormData();
      form.append("project", file);
      const res = await fetch("/api/preview/zip", { method: "POST", body: form });
      if (!res.ok) throw new Error("Failed to start preview");
      const data = await res.json();
      setPreviewUrl(data.previewUrl);
    } catch (e: any) {
      showError(e?.message ?? "Preview failed");
    } finally {
      setStartingPreview(false);
    }
  };

  const startOver = () => {
    setCurrentStep("upload");
    setFile(null);
    setPlanData(null);
    setApplyResult(null);
    setLogs([]);
    setError("");
    setPreviewUrl(null);
    setStartingPreview(false);
  };

  /** Stepper Dot (숫자 1·2·3·4 유지) */
  const StepDot = ({ idx, step }: { idx: number; step: Step }) => {
    const order: Step[] = ["upload", "plan", "apply", "download"];
    const curr = order.indexOf(currentStep);
    const me = order.indexOf(step);
    const on = me <= curr;
    return (
      <div
        className={[
          "grid place-items-center rounded-full border text-sm font-semibold",
          "w-9 h-9 md:w-10 md:h-10",
          on
            ? "bg-[#5361ff] text-white border-[#3d46c8] shadow-[0_6px_18px_rgba(83,97,255,0.20)]"
            : "bg-[#1b2440] text-[#8fa0c9] border-[#1f2a44]"
        ].join(" ")}
      >
        {idx}
      </div>
    );
  };

  return (
    <div className="app-shell">
      {/* Header — 여백 최소화 */}
      <header className="app-header mt-0 pt-3 pb-2">
        <h1 className="app-title m-0">🚀 MoFix</h1>
        <p className="app-subtitle mt-1">
          Migrate your projects from cloud IDEs to local development environments
        </p>
      </header>

      <main className="app-main pt-0">
        <div className="container-center">
          {/* Stepper */}
          <div className="stepper my-2">
            <StepDot idx={1} step="upload" />
            <div className="step-line" />
            <StepDot idx={2} step="plan" />
            <div className="step-line" />
            <StepDot idx={3} step="apply" />
            <div className="step-line" />
            <StepDot idx={4} step="download" />
          </div>

          {/* Error */}
          {!!error && (
            <div className="card mt-0">
              <div className="alert-error">{error}</div>
            </div>
          )}

          {/* Upload */}
          {currentStep === "upload" && (
            <section className="card mt-0">
              <h2 className="card-title">Upload Your Project</h2>
              <div
                className="rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--surface-2)] p-10 text-center hover:border-[var(--brand-600)] transition-colors"
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
              >
                <div className="text-[var(--accent)] mb-4" aria-hidden>
                  <svg className="mx-auto h-12 w-12" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
                  </svg>
                </div>
                <p className="text-lg">Drag and drop your project ZIP file here</p>
                <p className="helper mt-1 mb-5">or</p>
                <label className="btn btn-primary cursor-pointer">
                  Choose File
                  <input type="file" accept=".zip" onChange={handleFileInputChange} className="hidden" />
                </label>
              </div>
            </section>
          )}

          {/* Plan */}
          {currentStep === "plan" && (
            <section className="card mt-0">
              <h2 className="card-title">Review Migration Plan</h2>

              {file && (
                <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
                  <strong>File:</strong>&nbsp;{file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                </div>
              )}

              {!planData && !loading && (
                <button onClick={generatePlan} className="btn btn-primary">Generate Migration Plan</button>
              )}

              {loading && (
                <div className="text-center py-8">
                  <div className="inline-block h-8 w-8 rounded-full border-2 border-white/20 border-t-[var(--brand-600)] animate-spin" />
                  <p className="helper mt-2">Analyzing your project...</p>
                </div>
              )}

              {planData && (
                <div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 text-sm">
                    <div><strong>Framework:</strong> {planData.detection.framework || "Unknown"}</div>
                    <div><strong>Provider:</strong> {planData.detection.provider || "Unknown"}</div>
                    <div><strong>Package Manager:</strong> {planData.detection.packageManager}</div>
                    <div><strong>Has package.json:</strong> {planData.detection.hasPackageJson ? "Yes" : "No"}</div>
                  </div>

                  <div className="mb-6 overflow-x-auto">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th>File</th>
                          <th>Description</th>
                          <th>Required</th>
                        </tr>
                      </thead>
                      <tbody>
                        {planData.plan.steps.map((s, i) => (
                          <tr key={i}>
                            <td>
                              <span className={`badge ${
                                s.type === "create" ? "badge--create"
                                : s.type === "modify" ? "badge--modify"
                                : s.type === "delete" ? "badge--delete"
                                : "badge--copy"
                              }`}>
                                {s.type}
                              </span>
                            </td>
                            <td className="font-mono text-sm">{s.target}</td>
                            <td className="text-sm">{s.description}</td>
                            <td className="text-sm">{s.required ? "✓" : "○"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mb-6">
                    <div className="relative h-2 rounded-full border border-[var(--border)] bg-[#1a2540]">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-[var(--brand-600)]"
                        style={{ width: `${planData.plan.confidence * 100}%` }}
                      />
                    </div>
                    <div className="mt-2 text-right text-sm helper">
                      {Math.round(planData.plan.confidence * 100)}%
                    </div>

                    {planData.plan.warnings.length > 0 && (
                      <ul className="alert-warning list-disc list-inside mt-3">
                        {planData.plan.warnings.map((w, i) => <li key={i}>{w}</li>)}
                      </ul>
                    )}
                  </div>

                  <div className="grid md:grid-cols-2 gap-6 items-start">
                    <div className="space-y-2">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={forceOverwrite}
                               onChange={(e) => setForceOverwrite(e.target.checked)} />
                        <span>Force overwrite existing files</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={createBackup}
                               onChange={(e) => setCreateBackup(e.target.checked)} />
                        <span>Create backup before migration</span>
                      </label>
                    </div>
                    <div className="flex gap-3 justify-end">
                      <button onClick={() => setCurrentStep("apply")} className="btn btn-primary">Apply Migration</button>
                      <button onClick={startOver} className="btn btn-gray">Start Over</button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Apply */}
          {currentStep === "apply" && (
            <section className="card mt-0">
              <h2 className="card-title">Applying Migration</h2>

              {!loading && !applyResult && (
                <div className="space-y-4">
                  <div className="helper">We will apply the selected steps with the following options:</div>
                  <ul className="text-sm">
                    <li>• Force overwrite: {forceOverwrite ? "Yes" : "No"}</li>
                    <li>• Create backup: {createBackup ? "Yes" : "No"}</li>
                  </ul>
                  <button onClick={applyMigration} className="btn btn-primary">Start Migration</button>
                </div>
              )}

              {loading && (
                <div className="text-center py-8">
                  <div className="inline-block h-8 w-8 rounded-full border-2 border-white/20 border-t-[var(--brand-600)] animate-spin" />
                  <p className="helper mt-2">Applying your migration...</p>
                </div>
              )}

              {logs.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-lg font-medium mb-2">Migration Log</h3>
                  <div className="log">
                    {logs.map((l, i) => <div key={i}>{l}</div>)}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Download / Final */}
          {currentStep === "download" && applyResult && (
            <section className="card mt-0">
              <h2 className="card-title">Migration Complete!</h2>

              {applyResult.success ? (
                <div>
                  <div className="alert-success">
                    <div>✅</div>
                    <div>Migration completed successfully!</div>
                  </div>

                  <div className="flex flex-wrap gap-3 mb-3">
                    <VerifyButton />
                    <button
                      onClick={startLivePreview}
                      disabled={!file || startingPreview}
                      className="btn btn-purple"
                    >
                      {startingPreview ? "Starting Preview..." : "Start Live Preview"}
                    </button>
                  </div>

                  {previewUrl && (
                    <div className="helper mb-2">
                      Preview URL:&nbsp;<a href={previewUrl} target="_blank" rel="noreferrer">{previewUrl}</a>
                    </div>
                  )}

                  <div className="mb-6">
                    <a
                      href={`/api/download/${applyResult.resultId}`}
                      className="btn btn-primary"
                      download
                    >
                      📥 Download Migrated Project
                    </a>
                  </div>

                  <div className="helper">
                    Your migrated project is ready for download. The download link will expire in 10 minutes.
                  </div>
                </div>
              ) : (
                <div className="alert-error">
                  ❌ Migration failed. Please check the logs and try again.
                </div>
              )}

              {logs.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-lg font-medium mb-2">Final Log</h3>
                  <div className="log">
                    {logs.map((l, i) => <div key={i}>{l}</div>)}
                  </div>
                </div>
              )}

              <div className="mt-6">
                <button onClick={startOver} className="btn btn-gray">Migrate Another Project</button>
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <div className="container-center">© {new Date().getFullYear()} MoFix</div>
      </footer>
    </div>
  );
};

export default App;
