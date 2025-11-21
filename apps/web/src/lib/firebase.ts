import { initializeApp, getApps } from "firebase/app";
import { getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "mofix-72dc6.firebaseapp.com",
  projectId: "mofix-72dc6",
  storageBucket: "mofix-72dc6.firebasestorage.app",
  appId: "YOUR_APP_ID",
};

export const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);

// 앱 부팅 시 익명 로그인 보장
export function ensureAnonymousSignIn() {
  onAuthStateChanged(auth, async (u) => {
    if (!u) await signInAnonymously(auth);
  });
}
