// functions/src/index.ts
import * as admin from "firebase-admin";
import "firebase-admin/storage"; // GCS 사용
import express from "express";
import cors from "cors";
import { onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2/options";
import { defineSecret } from "firebase-functions/params";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getLimits } from "./limits";
import Stripe from "stripe";

/* ===================== 한도 / 버킷 ===================== */
const LIM = getLimits(); // .env > functions:config() > defaults

/* ===================== Firebase Admin ===================== */
admin.initializeApp(); // 기본 초기화(버킷 미지정)
const db = getFirestore();

/* ===================== Stripe Secret ===================== */
const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");

/* ===================== Functions v2 옵션 ===================== */
setGlobalOptions({
  region: "asia-northeast3",
  secrets: [STRIPE_SECRET_KEY],
});

const app = express();

/* ===================== CORS & 공통 헤더 ===================== */
app.use(cors({ origin: true }));
app.use((req, res, next) => {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin as string);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.json());

/* ===================== Health ===================== */
app.get("/", (_req, res) => res.status(200).send("ok v2"));
const okToday = () => `ok-${new Date().toISOString().slice(0, 10)}`;
app.get(["/health", "/_healthz", "/healthz"], (_req, res) => {
  res.status(200).send(okToday());
});

/* ===================== 라우트 목록(옵션) ===================== */
app.get("/routes", (_req, res) => {
  // @ts-ignore
  const stack = app._router?.stack || [];
  const routes: Array<{ method: string; path: string | string[] }> = [];
  stack.forEach((layer: any) => {
    if (layer?.route) {
      const methods = Object.keys(layer.route.methods || {}).filter((m) => layer.route.methods[m]);
      routes.push({ method: methods.join(",").toUpperCase(), path: layer.route.path });
    }
  });
  res.status(200).json({ ok: true, routes });
});

/* ===================== 서버 한도 확인 ===================== */
app.get("/limits", (_req, res) => {
  res.status(200).json(getLimits()); // 호출 시점 재계산
});

/* ===================== Auth helpers ===================== */
async function verifyAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  try {
    const authz = req.headers.authorization || "";
    const m = authz.match(/^Bearer\s+(.+)$/i);
    if (!m) return res.status(401).json({ ok: false, error: "unauthenticated" });
    const decoded = await admin.auth().verifyIdToken(m[1]);
    // @ts-ignore
    req.user = decoded;
    next();
  } catch (e) {
    console.error("[verifyAuth] error", e);
    return res.status(401).json({ ok: false, error: "invalid_token" });
  }
}

async function verifyAuthFlexible(req: express.Request) {
  const authz = req.headers.authorization || "";
  const bearer = authz.match(/^Bearer\s+(.+)$/i)?.[1] || "";
  const qToken = (req.query.idToken as string) || "";
  const idToken = qToken || bearer;
  if (!idToken) {
    const err = new Error("missing token") as any;
    (err as any).status = 401;
    throw err;
  }
  return admin.auth().verifyIdToken(idToken);
}

/* ===================== Usage ===================== */
app.get("/usage/me", verifyAuth, async (req, res) => {
  try {
    // @ts-ignore
    const uid: string = req.user.uid;
    const day = new Date().toISOString().slice(0, 10);
    const ref = db.collection("usage").doc(uid).collection("daily").doc(day);
    const snap = await ref.get();
    const data = snap.exists ? snap.data()! : {};
    res.status(200).json({
      ok: true,
      usage: {
        upload: data.upload ?? 0,
        apply: data.apply ?? 0,
        preview: data.preview ?? 0,
        download: data.download ?? 0,
        total: data.total ?? 0,
        updatedAt: data.updatedAt ?? null,
      },
    });
  } catch (e) {
    console.error("[/usage/me] error", e);
    res.status(500).json({ ok: false, error: "usage_me_failed" });
  }
});

app.post("/usage/bump", verifyAuth, async (req, res) => {
  try {
    // @ts-ignore
    const uid: string = req.user.uid;
    const { op } = req.body as { op?: "upload" | "apply" | "preview" | "download" };
    if (!op) return res.status(400).json({ ok: false, error: "missing_op" });

    const day = new Date().toISOString().slice(0, 10);
    const ref = db.collection("usage").doc(uid).collection("daily").doc(day);

    await ref.set(
      {
        [op]: FieldValue.increment(1),
        total: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[/usage/bump] error", e);
    res.status(500).json({ ok: false, error: "usage_bump_failed" });
  }
});

/* ===================== Results & Logs ===================== */
type ResultCompleteBody = {
  resultId: string;
  sessionId?: string;
  downloadUrl?: string;
  previewUrl?: string;
  planSummary?: any;
  logs?: Array<{ ts?: number; level?: string; msg: string }>;
  status?: "done" | "failed";
};

app.post("/result/complete", verifyAuth, async (req, res) => {
  try {
    // @ts-ignore
    const uid: string = req.user.uid;
    const {
      resultId,
      sessionId,
      downloadUrl = "",
      previewUrl = "",
      planSummary = null,
      logs = [],
      status = "done",
    } = (req.body || {}) as ResultCompleteBody;

    if (!resultId) return res.status(400).json({ ok: false, error: "no_resultId" });

    const ref = db.collection("results").doc(resultId);

    await ref.set(
      {
        uid,
        sessionId: sessionId ?? null,
        status,
        downloadUrl,
        previewUrl,
        planSummary,
        logsCount: FieldValue.increment(Math.max(0, logs.length)),
        createdAt: FieldValue.serverTimestamp(),
        finishedAt: FieldValue.serverTimestamp(),
        buildStatus: "initial",
        retryCount: 0,
      },
      { merge: true }
    );

    if (logs.length > 0) {
      const batch = db.batch();
      const col = ref.collection("logs");
      logs.slice(0, 400).forEach((l) => {
        const dref = col.doc();
        batch.set(dref, {
          ts: l.ts ?? Date.now(),
          level: l.level ?? "info",
          msg: l.msg,
          createdAt: FieldValue.serverTimestamp(),
        });
      });
      await batch.commit();
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[/result/complete] error", e);
    res.status(500).json({ ok: false, error: "result_complete_failed" });
  }
});

app.post("/result/log", verifyAuth, async (req, res) => {
  try {
    const { resultId, level = "info", msg, ts } = req.body || {};
    if (!resultId || !msg) {
      return res.status(400).json({ ok: false, error: "missing_fields" });
    }
    const ref = db.collection("results").doc(resultId).collection("logs").doc();
    await ref.set({
      ts: ts ?? Date.now(),
      level,
      msg,
      createdAt: FieldValue.serverTimestamp(),
    });
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[/result/log] error]", e);
    res.status(500).json({ ok: false, error: "result_log_failed" });
  }
});

/* ===================== Reviews ===================== */
app.post("/result/review", verifyAuth, async (req, res) => {
  try {
    const { resultId, rating, comment, receiptId } = req.body || {};
    if (!resultId || typeof rating !== "number") {
      return res.status(400).json({ ok: false, error: "missing_fields" });
    }
    // @ts-ignore
    const uid: string = req.user.uid;
    const ref = db.collection("results").doc(resultId).collection("reviews").doc();
    await ref.set({
      uid,
      rating,
      comment: comment ?? "",
      receiptId: receiptId ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[/result/review] error", e);
    return res.status(500).json({ ok: false, error: "review_failed" });
  }
});

/* ===================== 업로드/플랜 (용량 가드 추가) ===================== */
app.post("/plan", (req, res) => {
  const lim = getLimits(); // 최신값 반영
  const maxBytes = lim.upload_mb * 1024 * 1024;
  const clen = Number(req.headers["content-length"] || 0);

  if (clen && clen > maxBytes) {
    return res
      .status(413)
      .json({ ok: false, error: "file_too_large", limit_mb: lim.upload_mb, got_bytes: clen });
  }

  // 데모 세션
  return res.status(200).json({ sessionId: "demo-session" });
});

/* ===================== Apply / Preview (데모 라우트) ===================== */
app.post("/apply/:sessionId", (_req, res) =>
  res.status(200).json({
    resultId: "demo-result",
    logs: ["apply started", "apply done"],
    downloadUrl: "",
  })
);

app.post("/preview/start", (_req, res) =>
  res.status(200).json({ resultId: "demo-result", previewUrl: "about:blank" })
);

/* ===================== Download (GCS stream) ===================== */
app.get(["/download/:id", "/download/demo-result"], async (req, res) => {
  try {
    const decoded = await verifyAuthFlexible(req);
    if (!decoded) return res.status(401).json({ ok: false, error: "unauthorized" });

    const id = (req.params && (req.params as any).id) || "demo-result";

    const chosenBucket =
      process.env.GCS_BUCKET?.trim() ||
      LIM.gcs_bucket ||
      // @ts-ignore
      (admin.app().options as any)?.storageBucket ||
      undefined;

    const bucket = chosenBucket ? admin.storage().bucket(chosenBucket) : admin.storage().bucket();

    const filePath = `results/${id}.zip`;
    const file = bucket.file(filePath);
    const [exists] = await file.exists();

    if (!exists) {
      if (id === "demo-result") {
        const filename = `mofix-${id}.txt`;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
        return res
          .status(200)
          .end("This is a demo result placeholder. Upload real ZIP to GCS at results/demo-result.zip");
      }
      return res.status(404).json({ ok: false, error: "not_found" });
    }

    const filename = `mofix-${id}.zip`;
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);

    file
      .createReadStream()
      .on("error", (e) => {
        console.error("[download stream error]", e);
        if (!res.headersSent) res.status(500).end("stream error");
      })
      .pipe(res);
  } catch (e: any) {
    const status = e?.status || (e?.code === 401 ? 401 : 500);
    console.error("[download error]", e);
    if (!res.headersSent)
      res.status(status).json({ ok: false, error: status === 401 ? "unauthorized" : "download_failed" });
  }
});

/* ===================== Debug: 버킷 및 파일 확인 ===================== */
app.get("/debug/storage", async (_req, res) => {
  try {
    const chosen =
      process.env.GCS_BUCKET?.trim() ||
      LIM.gcs_bucket ||
      // @ts-ignore
      (admin.app().options as any)?.storageBucket ||
      "(default-empty)";

    const bucket = chosen ? admin.storage().bucket(chosen) : admin.storage().bucket();
    const [files] = await bucket.getFiles({ prefix: "results/" });

    res.status(200).json({
      ok: true,
      usedBucket: bucket.name,
      total: files.length,
      files: files.slice(0, 50).map((f) => f.name),
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: "debug_failed", message: e?.message || String(e) });
  }
});

/* ******************************************************************
 * 🔵 여기부터 A방식: 1회 재시도 + (옵션) 환불
 * ******************************************************************/

/**
 * 1) VS 빌드 실패 로그 제출
 * body: { resultId: string, logs: string[] }
 */
app.post("/result/failed", verifyAuth, async (req, res) => {
  try {
    const { resultId, logs } = req.body || {};
    if (!resultId || !Array.isArray(logs)) {
      return res.status(400).json({ ok: false, error: "missing_fields" });
    }

    const ref = db.collection("results").doc(resultId);

    await ref.set(
      {
        buildStatus: "failed",
        lastFailedAt: FieldValue.serverTimestamp(),
        lastFailedLogs: logs.slice(0, 500),
      },
      { merge: true }
    );

    const batch = db.batch();
    const col = ref.collection("failLogs");
    logs.slice(0, 200).forEach((line: string) => {
      const dref = col.doc();
      batch.set(dref, {
        msg: line,
        createdAt: FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[/result/failed] error", e);
    return res.status(500).json({ ok: false, error: "failed_submit_failed" });
  }
});

/**
 * 2) 1회 재시도 ZIP 생성
 * body: { resultId: string }
 * 응답: { ok: true, retryResultId: string }
 *
 * - retryResultId = `${resultId}-r1`
 * - GCS: results/resultId.zip → results/resultId-r1.zip 복사
 */
app.post("/result/retry", verifyAuth, async (req, res) => {
  try {
    const { resultId } = req.body || {};
    if (!resultId) {
      return res.status(400).json({ ok: false, error: "missing_resultId" });
    }

    const originalRef = db.collection("results").doc(resultId);
    const snap = await originalRef.get();

    if (!snap.exists) {
      return res.status(404).json({ ok: false, error: "result_not_found" });
    }

    const data = snap.data() || {};
    const currentRetryCount = data.retryCount ?? 0;
    if (currentRetryCount >= 1) {
      return res.status(400).json({ ok: false, error: "retry_limit_reached" });
    }

    const retryResultId = `${resultId}-r1`;

    const chosenBucket =
      process.env.GCS_BUCKET?.trim() ||
      LIM.gcs_bucket ||
      // @ts-ignore
      (admin.app().options as any)?.storageBucket ||
      undefined;

    const bucket = chosenBucket ? admin.storage().bucket(chosenBucket) : admin.storage().bucket();
    const originalPath = `results/${resultId}.zip`;
    const retryPath = `results/${retryResultId}.zip`;

    const originalFile = bucket.file(originalPath);
    const [exists] = await originalFile.exists();
    if (!exists) {
      return res.status(404).json({ ok: false, error: "original_zip_not_found" });
    }

    // 현재는 엔진 재실행 대신 Zip만 복사 (MVP)
    await originalFile.copy(bucket.file(retryPath));

    await originalRef.set(
      {
        retryCount: FieldValue.increment(1),
        lastRetryAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const retryRef = db.collection("results").doc(retryResultId);
    await retryRef.set(
      {
        uid: data.uid ?? null,
        retryOf: resultId,
        status: "retry_pending",
        buildStatus: "retry_ready",
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return res.status(200).json({
      ok: true,
      retryResultId,
    });
  } catch (e) {
    console.error("[/result/retry] error", e);
    return res.status(500).json({ ok: false, error: "retry_failed" });
  }
});

/**
 * 3) 재시도까지 실패한 경우 환불 요청
 * body: { resultId: string, paymentIntentId: string }
 */
app.post("/result/refund", verifyAuth, async (req, res) => {
  try {
    const { resultId, paymentIntentId } = req.body || {};
    if (!resultId || !paymentIntentId) {
      return res.status(400).json({ ok: false, error: "missing_fields" });
    }

    const ref = db.collection("results").doc(resultId);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(404).json({ ok: false, error: "result_not_found" });
    }

    const data = snap.data() || {};
    const retryCount = data.retryCount ?? 0;

    // 정책: 최소 1회 재시도는 사용해야 환불 가능
    if (retryCount < 1) {
      return res.status(400).json({ ok: false, error: "retry_not_used" });
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY.value());


    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
    });

    await ref.set(
      {
        buildStatus: "refund_done",
        refundRequested: true,
        refunded: true,
        refundedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return res.status(200).json({ ok: true, refund });
  } catch (e) {
    console.error("[/result/refund] error", e);
    return res.status(500).json({ ok: false, error: "refund_failed" });
  }
});

/* ===================== 404 ===================== */
app.use((req, res) => {
  res.status(404).json({ ok: false, where: "express-fallback", method: req.method, path: req.path });
});

/* ===================== Export (Gen2) ===================== */
export const api = onRequest(app);
export { onReviewCreated } from "./reviewsAggregate";
