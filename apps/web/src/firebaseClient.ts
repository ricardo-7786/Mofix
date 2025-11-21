// apps/web/src/firebaseClient.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  User,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "mofix-72dc6.firebaseapp.com",
  projectId: "mofix-72dc6",
  storageBucket: "mofix-72dc6.appspot.com",
  messagingSenderId: "XXXXXXXXXXXX",
  appId: "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  // 필요한 값들 기존 Firebase 설정에서 그대로 복붙
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);

// 구글 프로바이더
const provider = new GoogleAuthProvider();
provider.setCustomParameters({
  prompt: "select_account",
});

// 팝업 로그인 함수
export const signInWithGooglePopup = () => signInWithPopup(auth, provider);

// 앱 전체에서 쓸 수 있는 유저 상태 리스너 헬퍼 (선택사항)
export const subscribeAuth = (
  cb: (user: User | null) => void
): (() => void) => {
  return onAuthStateChanged(auth, cb);
};

