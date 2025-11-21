// functions/src/auth.ts
import * as admin from "firebase-admin";
import { Request, Response, NextFunction } from "express";

if (!admin.apps.length) {
  admin.initializeApp(); // Functions 기본 서비스 계정 사용
}

export async function requireFirebaseUser(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // 1) 우선순위: Authorization: Bearer <idToken>
    let idToken: string | undefined;
    const auth = req.headers.authorization || req.headers.Authorization;
    if (typeof auth === "string" && auth.startsWith("Bearer ")) {
      idToken = auth.substring("Bearer ".length).trim();
    }

    // 2) 대안 헤더(선택): X-Firebase-Auth
    if (!idToken && typeof req.headers["x-firebase-auth"] === "string") {
      idToken = String(req.headers["x-firebase-auth"]);
    }

    if (!idToken) {
      return res.status(401).json({ error: "unauthenticated" });
    }

    const decoded = await admin.auth().verifyIdToken(idToken);
    (req as any).uid = decoded.uid;
    (req as any).token = decoded;
    next();
  } catch (e) {
    console.error("[requireFirebaseUser] verify failed:", e);
    return res.status(401).json({ error: "unauthenticated" });
  }
}
