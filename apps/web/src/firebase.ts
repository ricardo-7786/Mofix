// apps/web/src/firebase.ts
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  signOut,
  connectAuthEmulator,
} from "firebase/auth";
import {
  getFunctions,
  httpsCallable,
  connectFunctionsEmulator,
} from "firebase/functions";

/** ✅ Firebase 콘솔 웹앱 설정 */
const firebaseConfig = {
  apiKey: "AIzaSyCsRR5z_OyY-Is8VWJD-bmkOOhlCaHB1mM",
  authDomain: "mofix-72dc6.firebaseapp.com",
  projectId: "mofix-72dc6",
  storageBucket: "mofix-72dc6.appspot.com",
  messagingSenderId: "556021056433",
  appId: "1:556021056433:web:cfa9e0812a78bdd6783390",
};

/* ============ Init ============ */
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
/** Functions는 지역 고정(서울/asia-northeast3) */
export const functions = getFunctions(app, "asia-northeast3");

/* ============ (옵션) 에뮬레이터 연결 ============ */
const useAuthEmu =
  (typeof import.meta !== "undefined" &&
    (import.meta as any).env?.NEXT_PUBLIC_USE_AUTH_EMULATOR === "true") ||
  (typeof process !== "undefined" &&
    process.env?.NEXT_PUBLIC_USE_AUTH_EMULATOR === "true");

const useFnsEmu =
  (typeof import.meta !== "undefined" &&
    (import.meta as any).env?.NEXT_PUBLIC_USE_FUNCTIONS_EMULATOR === "true") ||
  (typeof process !== "undefined" &&
    process.env?.NEXT_PUBLIC_USE_FUNCTIONS_EMULATOR === "true");

if (useAuthEmu) {
  try {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  } catch {}
}
if (useFnsEmu) {
  try {
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  } catch {}
}

/* ============ 로그인 헬퍼 ============ */
/** 앱 시작 시 호출해 익명 로그인 보장 */
export async function ensureAnonSignedIn() {
  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }
}

/* 유저 없으면 자동 익명 로그인 */
onAuthStateChanged(auth, (u) => {
  if (!u) signInAnonymously(auth).catch(console.error);
});

/* ============ 전역(window) 노출 ============ */
declare global {
  interface Window {
    auth?: ReturnType<typeof getAuth>;
    getIdToken?: (forceRefresh?: boolean) => Promise<string | undefined>;
  }
}

if (typeof window !== "undefined") {
  window.auth = auth;
  // 콘솔에서 바로 쓰기 편하게 헬퍼 추가
  window.getIdToken = async (force = true) => {
    try {
      const u = auth.currentUser || (await new Promise((ok) =>
        onAuthStateChanged(auth, (user) => user && ok(user))
      ));
      return await (u as any).getIdToken(force);
    } catch (e) {
      console.error(e);
      return undefined;
    }
  };
}

/* ============ 편의 re-export ============ */
export { onAuthStateChanged, signOut, httpsCallable };
