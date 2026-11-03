// Validate names only: configuration values must never be included in errors.
export function validateFirebaseConfig(env: Record<string, unknown>, useEmulators: boolean) {
  const mode = env.VITE_USE_FIREBASE_EMULATORS;
  if (mode !== undefined && mode !== "true" && mode !== "false") {
    throw new Error("VITE_USE_FIREBASE_EMULATORS must be true or false");
  }
  if (env.PROD === true && useEmulators) {
    throw new Error("Production must not use Firebase emulators");
  }
  if (useEmulators) return;
  const required = [
    "VITE_FIREBASE_API_KEY",
    "VITE_FIREBASE_AUTH_DOMAIN",
    "VITE_FIREBASE_PROJECT_ID",
    "VITE_FIREBASE_APP_ID",
  ];
  const invalid = required.filter((name) => {
    const value = env[name];
    return typeof value !== "string" || !value.trim() ||
      value.startsWith("demo-") || /[<>]/.test(value);
  });
  if (invalid.length) {
    throw new Error(`Firebase 설정을 확인해 주세요: ${invalid.join(", ")}`);
  }
  try {
    const value = env.VITE_API_BASE_URL;
    if (typeof value !== "string") throw new Error();
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== value) throw new Error();
  } catch {
    throw new Error("VITE_API_BASE_URL must be an http(s) origin without a trailing slash");
  }
}
