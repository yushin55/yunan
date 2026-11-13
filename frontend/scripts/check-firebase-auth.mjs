// Checks the real Firebase Google sign-in configuration without signing in a user.
// Uses only the public web API key; never prints credentials or creates accounts.
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const mode = process.argv[2] || "development";
const env = { ...loadEnv(mode, root, "VITE_"), ...process.env };

async function check() {
  if (env.VITE_USE_FIREBASE_EMULATORS === "true" ||
      (mode === "development" && env.VITE_USE_FIREBASE_EMULATORS !== "false")) {
    console.log("Firebase emulators are enabled. Real Google sign-in is not checked.");
    return;
  }

  const project = env.VITE_FIREBASE_PROJECT_ID;
  const apiKey = env.VITE_FIREBASE_API_KEY;
  if (!project || !apiKey || project.startsWith("demo-") || apiKey === "demo-key") {
    throw new Error("Set the real VITE_FIREBASE_PROJECT_ID and VITE_FIREBASE_API_KEY in frontend/.env.");
  }

  const origin = process.argv[3] || "http://localhost:5173";
  const continueUri = new URL(origin).origin;
  if (!/^https?:/.test(continueUri)) throw new Error("The app origin must use http or https.");

  // Popup sign-in validates /v1/projects in the SDK. createAuthUri alone can
  // succeed even when the browser's hostname is not authorized for sign-in.
  const configResponse = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects?key=${encodeURIComponent(apiKey)}`,
    { signal: AbortSignal.timeout(15000) },
  );
  const config = await configResponse.json();
  if (!configResponse.ok) {
    const code = String(config.error?.message || `HTTP_${configResponse.status}`).split(" : ")[0];
    console.error(`Firebase project configuration failed: ${code}`);
    process.exitCode = 1;
    return;
  }
  const hostname = new URL(continueUri).hostname.toLowerCase();
  const authorized = (config.authorizedDomains || []).some((entry) => {
    const domain = entry.toLowerCase();
    // Match Firebase's domain/subdomain rules; IP addresses require an exact match.
    return hostname === domain ||
      (!/^\d{1,3}(\.\d{1,3}){3}$/.test(domain) && hostname.endsWith(`.${domain}`));
  });
  if (!authorized) {
    console.error(`Google sign-in configuration failed: UNAUTHORIZED_DOMAIN (${hostname})`);
    console.error(`Add ${hostname} to Firebase Authentication > Settings > Authorized domains (hostname only, without protocol or port).`);
    console.error(`Firebase console: https://console.firebase.google.com/project/${encodeURIComponent(project)}/authentication/settings`);
    process.exitCode = 1;
    return;
  }
  console.log(`Sign-in hostname is authorized: ${hostname}.`);

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId: "google.com", continueUri }),
      signal: AbortSignal.timeout(15000),
    },
  );
  const result = await response.json();
  if (!response.ok) {
    // Print only the known error code, never a response containing OAuth session data.
    const code = String(result.error?.message || `HTTP_${response.status}`).split(" : ")[0];
    console.error(`Google sign-in configuration failed: ${code}`);
    if (code === "OPERATION_NOT_ALLOWED" || code === "CONFIGURATION_NOT_FOUND") {
      console.error("Enable Google in Firebase Authentication > Sign-in method, select a support email, and save.");
    } else if (code === "UNAUTHORIZED_DOMAIN" || code === "INVALID_CONTINUE_URI") {
      console.error(`Add ${new URL(continueUri).hostname} to Firebase Authentication > Settings > Authorized domains.`);
    }
    console.error(`Firebase console: https://console.firebase.google.com/project/${encodeURIComponent(project)}/authentication/providers`);
    process.exitCode = 1;
    return;
  }
  if (!result.authUri || result.providerId !== "google.com") {
    throw new Error("Firebase did not return a Google authorization URL.");
  }
  console.log(`Google authorization URL generated successfully for ${continueUri}.`);
  console.log("Finish a browser sign-in to verify the account and OAuth consent flow.");
}

check().catch(() => {
  console.error("Could not check Firebase sign-in. Check the web app settings, app origin, and network connection.");
  process.exitCode = 1;
});
