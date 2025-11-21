// functions/src/usage.ts
import * as admin from "firebase-admin";
const db = admin.firestore();

/** 일일 한도 설정 (필요에 맞춰 조정) */
const LIMITS = {
  upload: 20,
  apply: 50,
  preview: 50,
  total: 100, // 전체 상한
};

type Op = "upload" | "apply" | "preview";

function todayYMD(d = new Date()) {
  const z = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

/** 일일 사용량 문서 경로: usage_daily/{uid}_{YYYY-MM-DD} */
function dailyDocRef(uid: string, ymd: string) {
  return db.collection("usage_daily").doc(`${uid}_${ymd}`);
}

export async function getUsage(uid: string) {
  const ymd = todayYMD();
  const ref = dailyDocRef(uid, ymd);
  const snap = await ref.get();
  const data = snap.exists ? snap.data()! : {};

  const usedUpload = Number(data.upload || 0);
  const usedApply = Number(data.apply || 0);
  const usedPreview = Number(data.preview || 0);
  const usedTotal = usedUpload + usedApply + usedPreview;

  return {
    ok: true,
    date: ymd,
    used: { upload: usedUpload, apply: usedApply, preview: usedPreview, total: usedTotal },
    limit: { ...LIMITS },
    remaining: {
      upload: Math.max(LIMITS.upload - usedUpload, 0),
      apply: Math.max(LIMITS.apply - usedApply, 0),
      preview: Math.max(LIMITS.preview - usedPreview, 0),
      total: Math.max(LIMITS.total - usedTotal, 0),
    },
    quota_exceeded:
      usedUpload >= LIMITS.upload ||
      usedApply >= LIMITS.apply ||
      usedPreview >= LIMITS.preview ||
      usedTotal >= LIMITS.total,
  };
}

export async function bumpUsage(uid: string, op: Op, ip?: string) {
  const ymd = todayYMD();
  const ref = dailyDocRef(uid, ymd);

  let after: any;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.exists
      ? {
          upload: Number(snap.get("upload") || 0),
          apply: Number(snap.get("apply") || 0),
          preview: Number(snap.get("preview") || 0),
        }
      : { upload: 0, apply: 0, preview: 0 };

    const next = { ...cur, [op]: cur[op] + 1 };
    const nextTotal = next.upload + next.apply + next.preview;

    // 한도 검사
    if (next[op] > (LIMITS as any)[op] || nextTotal > LIMITS.total) {
      const err: any = new Error("quota_exceeded");
      err.code = "quota_exceeded";
      err.op = op;
      err.limit = { ...LIMITS };
      throw err;
    }

    tx.set(
      ref,
      {
        ...next,
        total: nextTotal,
        uid,
        date: ymd,
        lastIp: ip || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    after = { ...next, total: nextTotal };
  });

  return {
    ok: true,
    date: ymd,
    used: after,
    limit: { ...LIMITS },
    remaining: {
      upload: Math.max(LIMITS.upload - after.upload, 0),
      apply: Math.max(LIMITS.apply - after.apply, 0),
      preview: Math.max(LIMITS.preview - after.preview, 0),
      total: Math.max(LIMITS.total - after.total, 0),
    },
    quota_exceeded:
      after.upload >= LIMITS.upload ||
      after.apply >= LIMITS.apply ||
      after.preview >= LIMITS.preview ||
      after.total >= LIMITS.total,
  };
}
