import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp(); // Functions 환경변수/서비스계정 자동 사용
}
export const db = admin.firestore();
export const auth = admin.auth();
