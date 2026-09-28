import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInAnonymously } from "firebase/auth";
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
