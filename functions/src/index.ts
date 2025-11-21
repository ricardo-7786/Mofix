// functions/src/index.ts
import * as admin from "firebase-admin";
import "firebase-admin/storage"; // side-effect OK
import express from "express";
import cors from "cors";
import { onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2/options";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getLimits } from "./limits";

/* ===================== 한도 / 버킷 ===================== */
const LIM = getLimits(); // .env > functions:config() > defaults

/* ===================== Firebase Admin ===================== */
admin.initializeApp(); // 기본 초기화(버킷 미지정)

const db = getFirestore();

/* ===================== Functions v2 옵션 ===================== */
setGlobalOptions({
  region: "asia-northeast3",
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
  res.status(200).json({ resultId: "demo-result", logs: ["apply started", "apply done"], downloadUrl: "" })
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

/* ===================== 404 ===================== */
app.use((req, res) => {
  res.status(404).json({ ok: false, where: "express-fallback", method: req.method, path: req.path });
});

/* ===================== Export (Gen2) ===================== */
export const api = onRequest(app);
export { onReviewCreated } from "./reviewsAggregate";
