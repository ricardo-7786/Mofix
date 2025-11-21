// apps/web/src/client/App.tsx

import * as React from 'react';
import {
  AppBar, Toolbar, Typography, Box, Container, Paper, Stepper, Step, StepLabel,
  Button, IconButton, Divider, Link, Snackbar, Alert, LinearProgress, Collapse, Stack,
  Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress
} from '@mui/material';
import Tooltip from '@mui/material/Tooltip';
import Chip from '@mui/material/Chip';
import Badge from '@mui/material/Badge';

import ReviewModal from '../components/ReviewModal';
import logoUrl from '../assets/logo.png';

import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import ArticleRoundedIcon from '@mui/icons-material/ArticleRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';

import PricingModal from '../components/PricingModal';
import GetTokenButton from "../components/GetTokenButton";

// ✅ Firebase (Auth만 사용)
import { auth, onAuthStateChanged } from '../firebase';
import { signInAnonymously } from 'firebase/auth';

// ⬇️ quota/usage 유틸
import {
  fetchUsageMe,
  fetchLimits,
  bumpUsage,
  type UsageMe,
  type Limits
} from './api';

// ✅ Functions URL
const API_BASE = 'https://api-yqpwamvbqq-du.a.run.app';
console.log('[API_BASE]', API_BASE);

const steps = ['Upload', 'Plan', 'Apply', 'Preview', 'Download'] as const;

/* ========================= Dev Bypass ========================= */
function readBypassFlag(): boolean {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('dev') === '1') {
      localStorage.setItem('DEV_BYPASS', '1');
    }
    return localStorage.getItem('DEV_BYPASS') === '1';
  } catch {
    return false;
  }
}
function isBypass(): boolean { return readBypassFlag(); }
function devLog(...args: any[]) { if (isBypass()) console.log('[DEV MODE]', ...args); }

/* ========================= 공통 REST 유틸 ========================= */
async function getIdTokenOrThrow() {
  const u = auth.currentUser;
  if (!u) throw new Error('Unauthenticated');
  return u.getIdToken(true);
}

type SaveResultArgs = {
  resultId: string;
  sessionId: string | null;
  planSummary?: any;
  logs?: { ts?: number; level?: string; msg: string }[];
  downloadUrl?: string | null;
  previewUrl?: string | null;
};

async function saveResult(args: SaveResultArgs) {
  try {
    const idToken = await getIdTokenOrThrow();
    const r = await fetch(`${API_BASE}/result/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        resultId: args.resultId,
        sessionId: args.sessionId ?? undefined,
        downloadUrl: args.downloadUrl ?? undefined,
        previewUrl: args.previewUrl ?? undefined,
        planSummary: args.planSummary ?? { steps: 3 },
        logs: args.logs ?? [],
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) console.warn('[RESULT_SAVE] fail', j);
    else console.log('[RESULT_SAVE] ok', j);
  } catch (e) {
    console.warn('[RESULT_SAVE] error', e);
  }
}

/* ========================= PreviewOnceDialog ========================= */
const LS_PREFIX = 'preview_used:';
function isPreviewUsedLS(key: string) {
  try { return localStorage.getItem(LS_PREFIX + key) === '1'; } catch { return false; }
}
function setPreviewUsedLS(key: string) {
  try { localStorage.setItem(LS_PREFIX + key, '1'); } catch {}
}

/* ========================= Review One-time Guard ========================= */
// ★ 세션까지 포함해서 키 생성
const REVIEW_LS = 'review_shown:';
const reviewKey = (rid: string, sid?: string | null) => `${REVIEW_LS}${rid}${sid ? `:${sid}` : ''}`;

const isReviewShown = (rid?: string | null, sid?: string | null) => {
  if (!rid) return true;
  try {
    const k = reviewKey(rid, sid);
    const v = localStorage.getItem(k) === '1';
    console.debug('[REVIEW] isReviewShown?', { rid, sid, key: k, v });
    return v;
  } catch {
    return false;
  }
};

const markReviewShown = (rid?: string | null, sid?: string | null) => {
  if (!rid) return;
  try {
    const k = reviewKey(rid, sid);
    localStorage.setItem(k, '1');
    console.debug('[REVIEW] markReviewShown', { rid, sid, key: k });
  } catch {}
};

type PreviewOnceDialogProps = {
  open: boolean;
  onClose: () => void;
  onAutoComplete: () => void;     // ✅ 10초 완주 시에만 호출 → 결제 언락
  previewUrl: string;
  seconds?: number;
  previewKey: string;
  markUsedOnManualClose?: boolean; // 기본 true
};

function PreviewOnceDialog({
  open,
  onClose,
  onAutoComplete,
  previewUrl,
  seconds = 10,
  previewKey,
  markUsedOnManualClose = true,
}: PreviewOnceDialogProps) {
  const [left, setLeft] = React.useState(seconds);

  React.useEffect(() => {
    if (!open) return;
    setLeft(seconds);
    const timer = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          clearInterval(timer);
          setPreviewUsedLS(previewKey);
          onAutoComplete();
          onClose();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [open, seconds, previewKey, onAutoComplete, onClose]);

  const progress = Math.round(((seconds - left) / seconds) * 100);

  const handleManualClose = () => {
    if (markUsedOnManualClose) setPreviewUsedLS(previewKey);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleManualClose} fullWidth maxWidth="lg">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        Preview (10s trial)
        <Chip size="small" label={`${left}s`} />
        <Box sx={{ flex: 1 }} />
        <IconButton aria-label="close" onClick={handleManualClose}>
          <CloseRoundedIcon />
        </IconButton>
      </DialogTitle>

      <LinearProgress variant="determinate" value={progress} sx={{ height: 4 }} />

      <DialogContent sx={{ p: 0 }}>
        <Box sx={{ height: 600 }}>
          <iframe
            src={previewUrl}
            title="MoFix Preview"
            width="100%"
            height="100%"
            style={{ border: 0 }}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 2, py: 1 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mr: 'auto' }}>
          ⏰ One-time preview per result. The trial ends automatically after 10 seconds.
        </Typography>
        <Button onClick={handleManualClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

/* ================================ App ================================ */
export default function App() {
  const [activeStep, setActiveStep] = React.useState(0);

  // Upload state
  const [isDragging, setIsDragging] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);
  const [sessionId, setSessionId] = React.useState<string | null>(null);

  // Apply state
  const [applying, setApplying] = React.useState(false);
  const [applyLogs, setApplyLogs] = React.useState<string[]>([]);
  const [resultId, setResultId] = React.useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = React.useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);

  // Notifications
  const [toast, setToast] = React.useState<{open: boolean; type: 'success'|'error'|'info'|'warning'; msg: string}>({
    open: false, type: 'info', msg: ''
  });

  // Pricing
  const [showPricing, setShowPricing] = React.useState(false);

  // Gating
  const [canPay, setCanPay] = React.useState(false);

  // One-time preview flags
  const previewKey = (resultId && sessionId) ? `${resultId}:${sessionId}` : (resultId ?? '');
  const [previewUsed, setPreviewUsed] = React.useState<boolean>(previewKey ? isPreviewUsedLS(previewKey) : false);

  React.useEffect(() => {
    if (!previewKey) setPreviewUsed(false);
    else setPreviewUsed(isPreviewUsedLS(previewKey));
    console.debug('[PREVIEW] key/setUsed', { previewKey, used: isPreviewUsedLS(previewKey) });
  }, [previewKey]);

  const [previewOpen, setPreviewOpen] = React.useState(false);
  const openPreviewDialog = () => setPreviewOpen(true);
  const closePreviewDialog = () => {
    setPreviewOpen(false);
    if (previewKey) setPreviewUsed(isPreviewUsedLS(previewKey));
  };

  // ✅ 프리뷰 버튼 로딩 상태
  const [loadingPreviewBtn, setLoadingPreviewBtn] = React.useState(false);

  // ✅ 리뷰 모달 상태
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const [reviewRating, setReviewRating] = React.useState<number | null>(null);
  const [reviewComment, setReviewComment] = React.useState('');
  const [reviewSubmitting, setReviewSubmitting] = React.useState(false);

  // ⭐️ VSCode에서 넘어온 resultId를 따로 저장
  const [resultIdFromUrl, setResultIdFromUrl] = React.useState<string | null>(null);

  // ⭐️ 처음 로드 시 쿼리 파라미터(from, resultId) 읽어서 VSCode → 자동 리뷰 모달 오픈
  React.useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('from') === 'vscode') {
        setReviewOpen(true);
        const rid = params.get('resultId');
        if (rid) {
          setResultIdFromUrl(rid);

          // 이미 리뷰를 본 적 있으면 바로 닫기
          if (isReviewShown(rid, null)) {
            setReviewOpen(false);
          } else {
            // 열자마자 shown 마킹해서 중복 방지
            markReviewShown(rid, null);
          }
        }
      }
    } catch (e) {
      console.warn('[REVIEW] failed to parse query params', e);
    }
  }, []);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  function isZip(file: File) { return file.type === 'application/zip' || /\.zip$/i.test(file.name); }

  // === Firebase Auth: 자동 익명 로그인 + 초기 usage bump(예: preview) ===
  const [user, setUser] = React.useState<import('firebase/auth').User | null>(null);
  const autoCalledRef = React.useRef(false);

  // ✅ 첫 로드 시 익명 로그인
  React.useEffect(() => {
    if (!auth.currentUser) {
      signInAnonymously(auth).catch(console.error);
    }
  }, []);

  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u && !autoCalledRef.current) {
        autoCalledRef.current = true;
        devLog('usage/bump (preview) skipped? not skipped but harmless in dev');
        bumpUsage('preview');

        setTimeout(async () => {
          try {
            await u.getIdToken(true);
            await refreshUsage();
            devLog('usage refreshed after login');
          } catch (err) {
            console.warn('refreshUsage after login failed', err);
          }
        }, 800);
      }
    });
    return () => unsub();
  }, []);

  // === 헬스 체크 (선택)
  const restHealth = async () => {
    const r = await fetch(`${API_BASE}/health`);
    return { ok: r.ok && (await r.text()).trim().startsWith('ok') };
  };

  // === 사용량/한도 상태 =========================
  const [usage, setUsage] = React.useState<UsageMe["usage"] | null>(null);
  const [loadingUsage, setLoadingUsage] = React.useState(false);
  const [quotaExceeded, setQuotaExceeded] = React.useState(false);

  const [limits, setLimits] = React.useState<Limits | null>(null);

  // /usage/me 새로고침
  const refreshUsage = React.useCallback(async () => {
    try {
      setLoadingUsage(true);

      if (isBypass()) {
        setUsage({ total: 999, upload: 0, apply: 0, preview: 0, download: 0 } as any);
        setQuotaExceeded(false);
        devLog('refreshUsage → DEV BYPASS ACTIVE');
        return;
      }

      const data = await fetchUsageMe();
      setUsage((data as any)?.usage ?? null);

      const remain =
        (data as any)?.usage?.total ??
        (data as any)?.remaining?.total ??
        (data as any)?.remaining ??
        0;

      const exceeded =
        remain <= 0 ||
        Boolean((data as any)?.quota_exceeded) ||
        Boolean((data as any)?.exceeded);

      setQuotaExceeded(exceeded);
    } catch (e) {
      console.error('[usage] refresh failed', e);
    } finally {
      setLoadingUsage(false);
    }
  }, []);

  // 마운트 시 limits + usage 불러오기
  React.useEffect(() => {
    (async () => {
      try {
        if (isBypass()) {
          setLimits({
            upload_mb: 9999,
            uploads_per_day: 9999,
            bytes_per_month: 10 * 1024 * 1024 * 1024,
            raw_ttl_days: 7,
            results_ttl_days: 30,
            gcs_bucket: 'dev',
          } as any);
          devLog('limits → mocked');
        } else {
          const lm = await fetchLimits().catch(() => null);
          if (lm) setLimits(lm);
        }
      } catch (e) {
        console.warn('fetchLimits failed', e);
      }
    })();
    const t = setTimeout(() => { refreshUsage(); }, 300);
    return () => clearTimeout(t);
  }, [refreshUsage]);

  // ✅ 업로드 하루 횟수 정책 계산
  const uploadsPerDay = limits?.uploads_per_day ?? 0;
  const uploadMb = limits?.upload_mb ?? 0;
  const uploadsUsedToday = usage?.upload ?? 0;
  const uploadsLeft = Math.max(0, uploadsPerDay ? (uploadsPerDay - uploadsUsedToday) : 0);
  const canUploadByPolicy = isBypass() ? true : (uploadsPerDay ? uploadsLeft > 0 : true);

  // ✅ 초과 시 자동 업셀 (dev bypass면 절대 열지 않음)
  const exceededOpenedRef = React.useRef(false);
  React.useEffect(() => {
    if (isBypass()) { setShowPricing(false); return; }
    const shouldUpsell = quotaExceeded && (previewUsed || !resultId);
    if (!loadingUsage && shouldUpsell && !exceededOpenedRef.current) {
      exceededOpenedRef.current = true;
      setShowPricing(true);
    }
    if (!quotaExceeded) {
      exceededOpenedRef.current = false;
    }
  }, [quotaExceeded, loadingUsage, previewUsed, resultId]);

  function ensureQuotaOrUpsell(actionName: string): boolean {
    if (isBypass()) {
      devLog(`ensureQuotaOrUpsell(${actionName}) → bypass TRUE`);
      return true;
    }
    if (actionName === 'Upload' && !canUploadByPolicy) {
      setToast({ open: true, type: 'warning', msg: 'You have used all upload attempts for today.' });
      setShowPricing(true);
      return false;
    }
    if (quotaExceeded) {
      setToast({ open: true, type: 'warning', msg: `Quota exceeded. Please choose a plan to continue ${actionName}.` });
      setShowPricing(true);
      return false;
    }
    return true;
  }

  // === 토큰 자동 갱신 (30분 주기)
  React.useEffect(() => {
    const iv = setInterval(async () => {
      try {
        await auth.currentUser?.getIdToken(true);
      } catch (e) {
        console.warn('token refresh failed', e);
      }
    }, 30 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);

  // === 테스트 버튼 핸들러 ===
  const [busy, setBusy] = React.useState(false);

  const onClickUsageGet = async () => {
    if (!user) {
      setToast({ open: true, type: 'error', msg: 'Please sign in first.' });
      return;
    }
    setBusy(true);
    try {
      if (isBypass()) {
        setUsage({ total: 999, upload: 0 } as any);
        setQuotaExceeded(false);
        setToast({ open: true, type: 'info', msg: 'Dev mode: mock usage (remaining.total=999)' });
        return;
      }

      const r = await fetchUsageMe();
      setUsage((r as any)?.usage ?? null);

      const remain =
        (r as any)?.usage?.total ??
        (r as any)?.remaining?.total ??
        (r as any)?.remaining ??
        0;

      const exceeded =
        remain <= 0 ||
        Boolean((r as any)?.quota_exceeded) ||
        Boolean((r as any)?.exceeded);

      setQuotaExceeded(exceeded);
      setToast({
        open: true,
        type: exceeded ? 'error' : 'info',
        msg: exceeded ? 'Quota exceeded' : `OK (remaining.total=${remain})`,
      });
    } catch (e: any) {
      console.error('[USAGE_GET] failed:', e?.message || e);
      setToast({ open: true, type: 'error', msg: e?.message || 'Failed to fetch usage' });
    } finally {
      setBusy(false);
    }
  };

  const onClickHealthPing = async () => {
    setBusy(true);
    try {
      const r = await restHealth();
      if (r.ok) {
        console.log('[HEALTH] success', r);
        setToast({ open: true, type: 'success', msg: 'Health OK (/health)' });
      } else {
        console.log('[HEALTH] fail', r);
        setToast({ open: true, type: 'error', msg: 'Health check failed' });
      }
    } catch (e: any) {
      console.error('[HEALTH] error:', e?.message || e);
      setToast({ open: true, type: 'error', msg: e?.message || 'Health error' });
    } finally {
      setBusy(false);
    }
  };

  // 보기 좋은 바이트 포맷 (툴팁용)
  const formatBytes = (n?: number) => {
    if (n === undefined || n === null) return '-';
    const units = ['B','KB','MB','GB','TB'];
    let i = 0;
    let v = n;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(1)} ${units[i]}`;
  };

  // ✅ 배지에 쓸 남은 총량(서버 설계에 따라 의미 다름)
  const remainTotal = isBypass() ? 999 : (usage?.total ?? 0);

  // ▶︎ 미리보기 버튼 disabled
  const previewBtnDisabled = previewUsed || loadingPreviewBtn;

  // ▶︎ 다운로드 버튼 disabled
  const downloadDisabled = isBypass() ? false : (!canPay || quotaExceeded);

  /* ========================= 업로드 구현 ========================= */
  async function uploadZip(file: File) {
    if (!isZip(file)) {
      setToast({ open: true, type: 'error', msg: 'Only ZIP files are allowed.' });
      return;
    }
    if (!ensureQuotaOrUpsell('Upload')) return;

    try {
      setUploading(true);
      setStatus(`Uploading ${file.name}…`);

      const fd = new FormData();
      fd.append('project', file, file.name);

      const res = await fetch(`${API_BASE}/plan`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      const json = await res.json();
      setSessionId(json.sessionId ?? null);
      setStatus('Plan generated.');
      setActiveStep(1);
      setToast({ open: true, type: 'success', msg: 'Upload complete! Plan generated.' });

      await bumpUsage('upload');
      await refreshUsage();
    } catch (e: any) {
      setToast({ open: true, type: 'error', msg: e?.message || 'Upload failed.' });
      setStatus(null);
    } finally {
      setUploading(false);
    }
  }

  const uploadLocked = uploading || !!sessionId;

  // ▶️ Apply
  const clearPreviewFlag = (rid: string, sid: string | null) => {
    try { localStorage.removeItem(`${LS_PREFIX}${rid}:${sid ?? ''}`); } catch {}
  };

  async function startApply() {
    if (!sessionId) return;
    if (!ensureQuotaOrUpsell('Apply')) return;
    try {
      setApplying(true);
      setApplyLogs((l) => [...l, 'Starting apply…']);
      setActiveStep(2);

      const res = await fetch(`${API_BASE}/apply/${encodeURIComponent(sessionId)}`, { method: 'POST' });
      if (!res.ok) throw new Error(`Apply failed (${res.status})`);
      const json = await res.json();
      setApplyLogs((l) => [...l, ...(json.logs ?? [])]);

      setResultId(json.resultId);

      clearPreviewFlag(json.resultId, sessionId);
      setPreviewUsed(false);
      setCanPay(false);

      setDownloadUrl(json.downloadUrl ? json.downloadUrl : (json.resultId ? `${API_BASE}/download/${json.resultId}` : null));

      setToast({ open: true, type: 'success', msg: 'Apply complete! Preview/Download are ready.' });

      if (json.resultId) {
        const fd = new FormData();
        fd.append('resultId', json.resultId);
        const pv = await fetch(`${API_BASE}/preview/start`, { method: 'POST', body: fd });
        if (pv.ok) {
          const pj = await pv.json();
          setPreviewUrl(pj.previewUrl ?? pj.url ?? null);
        } else {
          setApplyLogs((l) => [...l, 'Preview start failed.']);
        }
      }

      await bumpUsage('apply');
      await refreshUsage();

      if (json.resultId) {
        const logsForSave = (json.logs ?? []).map((msg: string) => ({
          ts: Date.now(), level: 'info', msg,
        }));
        await saveResult({
          resultId: json.resultId,
          sessionId,
          planSummary: { steps: 3 },
          logs: logsForSave,
          downloadUrl,
          previewUrl,
        });
      }

      setActiveStep(3);
    } catch (e: any) {
      setToast({ open: true, type: 'error', msg: e?.message || 'Apply failed.' });
    } finally {
      setApplying(false);
    }
  }

  // ▶️ Preview (10s dialog)
  const handleOpenPreview = async () => {
    if (!resultId) return;

    if (previewUsed && !isBypass()) {
      setShowPricing(true);
      return;
    }

    try {
      setLoadingPreviewBtn(true);

      if (!previewUrl) {
        const fd = new FormData();
        fd.append('resultId', resultId);
        const pv = await fetch(`${API_BASE}/preview/start`, { method: 'POST', body: fd });
        if (!pv.ok) {
          setToast({ open: true, type: 'error', msg: 'Failed to start preview.' });
          return;
        }
        const pj = await pv.json();
        const url = pj.previewUrl ?? pj.url ?? null;
        if (!url) {
          setToast({ open: true, type: 'error', msg: 'Preview URL not returned.' });
          return;
        }
        setPreviewUrl(url);
      }

      await bumpUsage('preview');
      await refreshUsage();
      openPreviewDialog();

      if (isBypass()) {
        setTimeout(() => {
          setPreviewUsed(true);
          setCanPay(true);
        }, 50);
      }
    } finally {
      setLoadingPreviewBtn(false);
    }
  };

  // ▶️ Download — A) fetch+blob  → B) 새 탭  → C) 히든 iframe
  const onDownloadClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!downloadUrl) return;
    e.preventDefault();

    try {
      if (!ensureQuotaOrUpsell('Download')) return;

      const idToken = await getIdTokenOrThrow();

      // (A) fetch → blob 저장
      let completed = false;
      try {
        const res = await fetch(downloadUrl, {
          method: 'GET',
          headers: { Authorization: `Bearer ${idToken}` },
        });

        if (res.ok) {
          const blob = await res.blob();

          const cd = res.headers.get('content-disposition') || '';
          const m = /filename\*=UTF-8''([^;]+)|filename="?([^"]+)"?/i.exec(cd);
          const serverName = decodeURIComponent(m?.[1] || m?.[2] || '');
          const filename = serverName || `mofix-${resultId ?? 'output'}.zip`;

          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);

          completed = true;
        } else {
          console.warn('[DOWNLOAD] fetch not ok', res.status, await res.text().catch(()=>'')); 
        }
      } catch (err) {
        console.warn('[DOWNLOAD] fetch error, will fallback', err);
      }

      // (B) 새 탭 열기(서명 URL/302 등)
      if (!completed) {
        const withToken =
          downloadUrl +
          (downloadUrl.includes('?') ? '&' : '?') +
          'idToken=' + encodeURIComponent(idToken) +
          '&dl=1';

        const win = window.open(withToken, '_blank', 'noopener');
        if (win) completed = true;
      }

      // (C) 히든 iframe
      if (!completed) {
        const withToken =
          downloadUrl +
          (downloadUrl.includes('?') ? '&' : '?') +
          'idToken=' + encodeURIComponent(idToken) +
          '&dl=1';

        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = withToken;
        document.body.appendChild(iframe);
        setTimeout(() => iframe.remove(), 20000);
      }

      // ✅ 다운로드가 실제로 완료된 경우에만 후속 처리
      if (completed) {
        await bumpUsage('download');
        await refreshUsage();

        const effectiveRid = resultId ?? resultIdFromUrl ?? null;

        // ★ 세션 포함해서 표시 여부 판단 + 열자마자 shown 마킹
        const shouldOpen = !!effectiveRid && !isReviewShown(effectiveRid, sessionId);
        console.debug('[REVIEW] after-download', {
          resultId: effectiveRid, sessionId, shouldOpen, canPay, previewUsed
        });

        if (shouldOpen && effectiveRid) {
          markReviewShown(effectiveRid, sessionId);
          setTimeout(() => setReviewOpen(true), 300);
        } else {
          console.debug('[REVIEW] skip (already shown or no resultId)');
        }
      } else {
        console.warn('[DOWNLOAD] not completed → skip review popup');
      }
    } catch (err) {
      console.error('Download fatal error', err);
      setToast({ open: true, type: 'error', msg: 'Download failed.' });
    }
  };

  // ▶︎ 리뷰 제출 (디버그 로그 + 실패해도 모달 닫기)
  const submitReview = async () => {
    const effectiveRid = resultId ?? resultIdFromUrl;

    if (!effectiveRid) {
      console.warn('[REVIEW] missing resultId', { resultId, resultIdFromUrl });
      setToast({ open: true, type: 'warning', msg: 'Result ID is missing.' });
      setReviewOpen(false);
      return;
    }

    // ⭐ 별점을 안 눌러도 기본 5점으로 전송
    const ratingToSend = reviewRating ?? 5;

    setReviewSubmitting(true);
    try {
      const idToken = await getIdTokenOrThrow();

      const payload = {
        resultId: effectiveRid,
        rating: ratingToSend,
        comment: reviewComment || '',
      };
      console.log('[REVIEW] sending', payload);

      const r = await fetch(`${API_BASE}/result/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(payload),
      });

      const text = await r.text().catch(() => '');
      let parsed: any = {};
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch {
        // JSON 아닐 수도 있음
      }

      console.log('[REVIEW] response', {
        status: r.status,
        ok: r.ok,
        text,
        parsed,
      });

      if (!r.ok) {
        throw new Error(parsed?.error || `review_failed (status ${r.status})`);
      }

      // ✅ 성공 시
      markReviewShown(effectiveRid, sessionId);
      setReviewOpen(false);
      setToast({ open: true, type: 'success', msg: 'Thanks! Your review was saved.' });
    } catch (e: any) {
      console.error('[REVIEW] error', e);
      setToast({
        open: true,
        type: 'error',
        msg: e?.message || 'Failed to save the review',
      });
      // 🔥 실패해도 일단 모달 닫기 (임시)
      setReviewOpen(false);
    } finally {
      setReviewSubmitting(false);
    }
  };

  // ───────────────────────────── UI ─────────────────────────────
  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'linear-gradient(180deg, #0b0f1f 0%, #131935 40%, #1a1445 100%)',
        color: '#E6EAF7',
        filter: (previewOpen || reviewOpen) ? 'blur(8px) saturate(0.95)' : 'none',
        pointerEvents: (previewOpen || reviewOpen) ? 'none' : 'auto',
        transition: 'filter .2s ease',
        willChange: 'filter',
      }}
    >
      {/* AppBar */}
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          bgcolor: 'rgba(16,21,34,.75)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid rgba(148,163,184,.15)',
        }}
      >
        <Toolbar>
          <Box
            component="a"
            href="#/"
            sx={{ display: 'flex', alignItems: 'center', gap: 0.6, textDecoration: 'none', color: 'inherit' }}
          >
            <Box component="img" src={logoUrl} alt="MoFix Logo" sx={{ height: 72, width: 'auto', display: 'block', marginRight: 0, lineHeight: 0 }} />
            <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: 0.3, ml: '-12px' }}>MoFix</Typography>
          </Box>

          <Box sx={{ flex: 1 }} />

          <Button color="inherit" sx={{ textTransform: 'none' }} onClick={() => setShowPricing(true)}>Plans</Button>
          <Button color="inherit" sx={{ textTransform: 'none' }} href="/docs">Docs</Button>
          <Divider flexItem orientation="vertical" sx={{ mx: 2, borderColor: 'rgba(148,163,184,.25)' }} />

          {/* ✅ Remaining badge + policy tooltip (EN) */}
          <Tooltip
            arrow
            title={
              <Box sx={{ fontSize: 12 }}>
                <div><b>Upload policy</b>: {uploadMb}MB per upload, {uploadsPerDay || '-'} uploads/day</div>
                <div>Uploads today: {uploadsUsedToday} / {uploadsPerDay || '-'}</div>
                <div>Total remaining credits: {remainTotal}</div>
                <div>This month usage (example): {formatBytes(undefined)}</div>
                {isBypass() && <div style={{marginTop:4, color:'#7CFFBA'}}><b>DEV MODE ACTIVE</b> — all limits bypassed.</div>}
              </Box>
            }
          >
            <Badge
              sx={{ mr: 1 }}
              badgeContent={uploadsPerDay ? (isBypass() ? '∞' : uploadsLeft) : (isBypass() ? '∞' : remainTotal)}
              color="primary"
              overlap="circular"
            >
              <Chip
                label={
                  loadingUsage
                    ? 'Loading…'
                    : uploadsPerDay
                      ? `Remaining uploads ${isBypass() ? '∞' : `${uploadsLeft}/${uploadsPerDay}`}`
                      : `Remaining ${isBypass() ? '∞' : remainTotal}`
                }
                variant="outlined"
                size="small"
                sx={{ bgcolor: '#1e2638', color: '#cfe3ff' }}
              />
            </Badge>
          </Tooltip>

          <Chip
            icon={<CheckCircleIcon />}
            label={
              isBypass()
                ? 'Dev'
                : user
                  ? (user.isAnonymous ? 'Anon' : (user.email ?? 'User'))
                  : 'Guest'
            }
            size="small"
            sx={{ bgcolor: '#1e2638', color: '#cfe3ff' }}
          />
        </Toolbar>
      </AppBar>

      <Container sx={{ py: 5, textAlign: 'center' }}>
        <Typography variant="h3" sx={{ fontWeight: 900, mb: 1, lineHeight: 1.1, letterSpacing: .2 }}>
          Improve Your User Interface
        </Typography>
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, color: '#A7B1C8' }}>
          <Chip size="small" color="primary" variant="outlined"
            label={steps[activeStep]}
            sx={{ bgcolor: 'rgba(124,77,255,.15)', borderColor: 'rgba(124,77,255,.35)', color: '#CFCBFF' }} />
          <Typography variant="body2">›</Typography><Typography variant="body2">Plan</Typography>
          <Typography variant="body2">›</Typography><Typography variant="body2">Apply</Typography>
          <Typography variant="body2">›</Typography><Typography variant="body2">Download</Typography>
        </Box>
      </Container>

      {/* Upload & actions */}
      <Container maxWidth="lg" sx={{ display: 'flex', justifyContent: 'center', px: 2, pb: 4 }}>
        <Paper elevation={0}
          sx={{
            width: 'min(960px, 100%)', mx: 'auto', p: { xs: 3, sm: 4 }, borderRadius: 3,
            bgcolor: 'rgba(18,24,40,.68)', border: '1px solid rgba(148,163,184,.18)',
            boxShadow: '0 18px 80px rgba(2,8,23,.45), 0 0 120px rgba(124,77,255,.08)'
          }}>
          <Typography variant="h5" sx={{ fontWeight: 800, mb: 3, color: '#DEE6FF' }}>
            Upload a design file
          </Typography>

          <Box
            onClick={() => {
              if (!ensureQuotaOrUpsell('Upload')) return;
              fileInputRef.current?.click();
            }}
            onDrop={(e: React.DragEvent<HTMLDivElement>) => {
              e.preventDefault(); e.stopPropagation();
              setIsDragging(false);
              if (uploadLocked || !ensureQuotaOrUpsell('Upload')) return;
              const f = e.dataTransfer.files?.[0];
              if (f) uploadZip(f);
            }}
            onDragOver={(e: React.DragEvent<HTMLDivElement>) => {
              e.preventDefault(); e.stopPropagation();
              if (uploadLocked) return;
              setIsDragging(true);
            }}
            onDragLeave={(e: React.DragEvent<HTMLDivElement>) => {
              e.preventDefault(); e.stopPropagation();
              if (uploadLocked) return;
              setIsDragging(false);
            }}
            sx={{
              cursor: uploadLocked ? 'not-allowed' : 'pointer',
              pointerEvents: uploadLocked ? 'none' : 'auto',
              opacity: uploadLocked ? 0.6 : 1,
              border: `1.5px dashed ${isDragging ? 'rgba(124,77,255,.7)' : 'rgba(148,163,184,.28)'}`,
              bgcolor: isDragging ? 'rgba(124,77,255,.08)' : 'rgba(10,16,28,.55)',
              transition: 'all .15s ease',
              borderRadius: 2,
              p: { xs: 3, sm: 4 },
              textAlign: 'center',
              color: '#B9C4E6',
              position: 'relative'
            }}
          >
            <CloudUploadIcon sx={{ fontSize: 42, mb: 1, opacity: .9 }} />
            <Typography sx={{ mb: 1 }}>
              Drag &amp; drop a ZIP file{uploadLocked ? '' : ', or click to select'}
            </Typography>

            {!uploadLocked && (
              <Button
                variant="contained"
                onClick={() => {
                  if (!ensureQuotaOrUpsell('Upload')) return;
                  fileInputRef.current?.click();
                }}
                disabled={!canUploadByPolicy}
                sx={{
                  mt: 1, px: 3, py: 1, textTransform: 'none', fontWeight: 800, borderRadius: 2,
                  background: 'linear-gradient(180deg,#7C4DFF 0%,#5F3BFF 100%)',
                  boxShadow: '0 6px 24px rgba(124,77,255,.45), 0 0 0 1px rgba(124,77,255,.35) inset',
                  ':hover': { background: 'linear-gradient(180deg,#8758ff 0%,#6644ff 100%)' },
                  '&.Mui-disabled': { opacity: 0.6 }
                }}
              >
                Choose File
              </Button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,application/zip"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const f = e.target.files?.[0];
                if (f) {
                  if (!ensureQuotaOrUpsell('Upload')) return;
                  uploadZip(f);
                }
                e.currentTarget.value = '';
              }}
              disabled={uploadLocked || !canUploadByPolicy}
              style={{ display: 'none' }}
            />
          </Box>

          <Box sx={{ mt: 3, color: '#9AA7BF', fontSize: 14, lineHeight: 1.7 }}>
            <div>• Upload your project as a ZIP.</div>
            <div>• We’ll analyze it and generate a migration plan.</div>
          </Box>

          {uploading && (
            <Box sx={{ mt: 3 }}>
              <LinearProgress sx={{ height: 6, borderRadius: 999 }} />
              <Typography variant="body2" sx={{ mt: 1, color: '#B9C4E6' }}>
                {status ?? 'Uploading…'}
              </Typography>
            </Box>
          )}

          {sessionId && !uploading && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems="center" sx={{ mt: 3 }}>
              <Chip color="success" label="Plan ready" />
              <Typography variant="body2" sx={{ color: '#B9C4E6' }}>
                Session: {sessionId.slice(0, 8)}…
              </Typography>
              <Box sx={{ flex: 1 }} />
              <Button
                size="small"
                variant="contained"
                startIcon={<PlayArrowRoundedIcon />}
                disabled={applying || (!isBypass() && quotaExceeded)}
                onClick={startApply}
                sx={{ textTransform: 'none', fontWeight: 800, borderRadius: 2 }}
              >
                Continue
              </Button>
            </Stack>
          )}

          <Collapse in={applying || !!resultId} unmountOnExit>
            <Box sx={{ mt: 3, p: 2, borderRadius: 2, bgcolor: 'rgba(12,18,30,.55)', border: '1px solid rgba(148,163,184,.18)' }}>
              {applying && <>
                <Typography sx={{ mb: 1, fontWeight: 700, color: '#C8D2F2' }}>Applying changes…</Typography>
                <LinearProgress sx={{ height: 6, borderRadius: 999 }} />
              </>}
              {!!applyLogs.length && (
                <Box sx={{ mt: 2, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, color: '#AFC0E8', maxHeight: 160, overflow: 'auto' }}>
                  {applyLogs.map((l, i) => <div key={i}>• {l}</div>)}
                </Box>
              )}

              {!applying && resultId && (
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems="center" sx={{ mt: 2 }}>
                  <Chip icon={<ArticleRoundedIcon />} label={`Result: ${resultId.slice(0,8)}…`} sx={{ color: '#D7E0FF' }} />
                  <Box sx={{ flex: 1 }} />

                  <Tooltip title={previewUsed && !isBypass() ? 'Preview trial already used for this result' : '10-second preview trial'}>
                    <span>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<VisibilityRoundedIcon />}
                        onClick={handleOpenPreview}
                        disabled={previewBtnDisabled && !isBypass()}
                        sx={{
                          textTransform: 'none',
                          borderColor: 'rgba(124,77,255,.5)',
                          color: '#CFCBFF',
                          '&.Mui-disabled': { opacity: 0.6, borderColor: 'rgba(124,77,255,.3)', color: '#9aa7ff' },
                        }}
                      >
                        {loadingPreviewBtn ? <><CircularProgress size={16} sx={{ mr: .75 }} />Starting…</> : 'Preview (10s)'}
                      </Button>
                    </span>
                  </Tooltip>

                  <Tooltip title={
                    (!isBypass() && quotaExceeded) ? 'Quota exceeded' :
                    (!isBypass() && !canPay) ? 'Complete 10s preview to unlock' :
                    'Download generated ZIP'
                  }>
                    <span>
                      <Button
                        size="small"
                        variant="contained"
                        color="primary"
                        startIcon={<DownloadRoundedIcon />}
                        onClick={onDownloadClick}
                        disabled={downloadDisabled}
                        sx={{ textTransform: 'none', fontWeight: 800, borderRadius: 2, opacity: downloadDisabled ? 0.6 : 1 }}
                      >
                        Download ZIP
                      </Button>
                    </span>
                  </Tooltip>
                </Stack>
              )}
            </Box>
          </Collapse>

        </Paper>
      </Container>

      {/* 테스트 버튼 */}
      <Container maxWidth="lg" sx={{ px: 2, pb: 4 }}>
        <Paper sx={{ p: 3, bgcolor: 'rgba(18,24,40,.68)', borderRadius: 3, border: '1px solid rgba(148,163,184,.18)' }}>
          <Typography variant="subtitle1" gutterBottom>Test buttons</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <Button
              variant="contained"
              startIcon={<VisibilityRoundedIcon />}
              disabled={busy}
              onClick={onClickUsageGet}
              sx={{ textTransform: 'none', fontWeight: 700 }}
            >
              Get usage
            </Button>
            <Button
              variant="outlined"
              startIcon={<PlayArrowRoundedIcon />}
              disabled={busy}
              onClick={onClickHealthPing}
              sx={{ textTransform: 'none', borderColor: 'rgba(124,77,255,.5)', color: '#CFCBFF' }}
            >
              Health ping
            </Button>
          </Stack>
          <Typography variant="body2" sx={{ mt: 2, opacity: 0.8 }}>
            Check console logs for <code>quota_exceeded</code> or <code>success</code>.
          </Typography>
        </Paper>
      </Container>

      {/* Stepper & Footer */}
      <Container maxWidth="lg" sx={{ pb: 2 }}>
        <Stepper
          activeStep={activeStep}
          alternativeLabel
          sx={{
            mx: 'auto', maxWidth: 920, mb: 4,
            '.MuiStepConnector-line': { borderColor: 'rgba(214,220,247,.25)' },
            '.MuiStepLabel-label': { color: '#CDD4EA !important', fontWeight: 700, letterSpacing: .15 },
            '.MuiStepIcon-root': { color: 'rgba(136,153,255,.35)' },
            '.MuiStepIcon-root.Mui-active': { color: '#7C4DFF' },
            '.MuiStepIcon-root.Mui-completed': { color: '#7C4DFF' },
          }}
        >
          {steps.map((label) => (<Step key={label}><StepLabel>{label}</StepLabel></Step>))}
        </Stepper>

        <Box sx={{ textAlign: 'center', color: '#9AA7BF', py: 3, borderTop: '1px solid rgba(148,163,184,.18)' }}>
          © {new Date().getFullYear()} MoFix · <Link href="#" color="inherit" underline="hover">Terms</Link> ·{' '}
          <Link href="#" color="inherit" underline="hover">Privacy</Link>
          <CheckCircleIcon sx={{ ml: 1, fontSize: 16, opacity: .6, verticalAlign: 'middle' }} />
        </Box>
      </Container>

      {/* Pricing */}
      <PricingModal open={showPricing && !isBypass()} onClose={() => setShowPricing(false)} showLocal={false} />

      {previewUrl && resultId && (
        <PreviewOnceDialog
          open={previewOpen}
          onClose={closePreviewDialog}
          onAutoComplete={() => {
            setPreviewUsed(true);
            setCanPay(true);
          }}
          previewUrl={previewUrl}
          seconds={10}
          previewKey={previewKey}
          markUsedOnManualClose={true}
        />
      )}

      {/* ✅ Review Modal */}
      <ReviewModal
        open={reviewOpen}
        resultId={resultId ?? resultIdFromUrl}
        rating={reviewRating}
        setRating={setReviewRating}
        comment={reviewComment}
        setComment={setReviewComment}
        submitting={reviewSubmitting}
        onClose={() => { setReviewOpen(false); }}
        onLater={() => {
          // 열 때 이미 shown 마킹했으므로 여기서는 닫기만
          setReviewOpen(false);
        }}
        onSubmit={submitReview}
        setSnack={(v) =>
          setToast({
            open: v.open,
            msg: v.msg,
            type: v.severity ?? 'success',
          })
        }
      />

      <Snackbar
        open={toast.open}
        autoHideDuration={3000}
        onClose={() => setToast(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={toast.type} variant="filled" sx={{ width: '100%' }}>
          {toast.msg}
        </Alert>
      </Snackbar>

      {/* 콘솔에 ID 토큰 찍는 테스트 버튼 (개발용) */}
      <GetTokenButton />
    </Box>
  );
}
