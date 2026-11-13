import { initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  signInAnonymously,
  signInWithCredential,
  signInWithCustomToken,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
const env = import.meta.env;
export const useEmulators =
  env.VITE_USE_FIREBASE_EMULATORS === "true" ||
  (env.DEV && env.VITE_USE_FIREBASE_EMULATORS !== "false");
const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY || "demo-key",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "demo-yunan.firebaseapp.com",
  projectId: env.VITE_FIREBASE_PROJECT_ID || "demo-yunan",
  appId: env.VITE_FIREBASE_APP_ID || "demo-app",
});
export const auth = getAuth(app);
export const db = getFirestore(app);
if (useEmulators) {
  connectAuthEmulator(auth, `http://${location.hostname}:9099`, {
    disableWarnings: true,
  });
  connectFirestoreEmulator(db, location.hostname, 8080);
}
let signingIn: Promise<unknown> | null = null;
/** The current account: a signed-in teacher, or else an anonymous student account. */
export async function authenticate() {
  await auth.authStateReady();
  if (!auth.currentUser) {
    signingIn ??= signInAnonymously(auth).finally(() => {
      signingIn = null;
    });
    await signingIn;
  }
  return auth.currentUser!;
}

/** Teachers sign in with Google or Kakao; students stay anonymous. */
export const isTeacher = (user: User | null): user is User => !!user && !user.isAnonymous;

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return (await signInWithPopup(auth, provider)).user;
}

/** Local emulator only: a fake Google teacher, so development and UI tests need no real account. */
export async function signInAsTestTeacher(account = "local-teacher") {
  if (!useEmulators) throw new Error("Test sign-in is for the Firebase emulator only.");
  const idToken = JSON.stringify({ sub: account, email: `${account}@example.com`, email_verified: true, name: "테스트 선생님" });
  return (await signInWithCredential(auth, GoogleAuthProvider.credential(idToken))).user;
}

/** The custom token our server issues after checking the Kakao login. */
export async function signInWithKakaoToken(token: string) {
  return (await signInWithCustomToken(auth, token)).user;
}

export const signOutTeacher = () => signOut(auth);
