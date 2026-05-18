// Firebase client SDK init + App Check + Auth + Firestore handles.
//
// App Check cryptographically attests that requests to our Cloud Function
// come from this real web app on its real domain (via reCAPTCHA v3) —
// not from curl, Postman, or a cloned deployment. The function rejects
// requests without a valid App Check token (see functions/src/appCheck.ts).
//
// Auth (M3): Google sign-in only in v1. The SDK defaults to
// `browserLocalPersistence` (IndexedDB-backed) so users stay signed in
// across reboots, browser updates, and schema migrations.
//
// Firestore: three named databases — `recipy-cache` (server-only),
// `recipy-list` (read for authed users), `recipy-users` (per-uid). The
// client SDK only needs handles to the two it actually talks to:
// `recipy-list` (read saved-recipe lookups) and `recipy-users`
// (read/write profile + preferences + saved subcollection).
//
// The values in this file are public Firebase identifiers (not secrets):
// the `apiKey` here identifies the project but does not grant access on
// its own — Firebase relies on App Check + security rules for that.
// Same for the reCAPTCHA v3 SITE key; the matching SECRET key lives only
// in Firebase Console.

import { initializeApp } from "firebase/app";
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
  getToken,
  type AppCheck,
} from "firebase/app-check";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// In dev, the SDK will generate a debug token instead of calling reCAPTCHA
// (which would fail on localhost without a public domain). The token is
// printed to the browser console once; you paste it into Firebase Console
// → App Check → Manage debug tokens to allow this dev environment.
// Must be set BEFORE initializeAppCheck runs.
if (import.meta.env.DEV) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}

const firebaseConfig = {
  apiKey: "AIzaSyCWfEfX4Bcs6c_iV022ahB4pb6sxYL5ad4",
  // Custom auth domain so the Google sign-in popup shows
  // "Sign in to recipy.shankar.design" instead of the
  // generic *.firebaseapp.com fallback. Firebase Hosting
  // serves /__/auth/handler on the custom domain automatically;
  // no extra config beyond adding the domain to the project's
  // Authorized Domains list (Console → Authentication → Settings).
  authDomain: "recipy.shankar.design",
  projectId: "recipy-63422",
  storageBucket: "recipy-63422.firebasestorage.app",
  messagingSenderId: "666083696337",
  appId: "1:666083696337:web:ba17700d4ef3b6a4446ff0",
  measurementId: "G-626PHY4KQZ",
};

const RECAPTCHA_V3_SITE_KEY = "6LdMD-wsAAAAABYgeeUrqwKMbFfIgqO_sNNWNTGt";

export const firebaseApp = initializeApp(firebaseConfig);

let appCheck: AppCheck | null = null;
try {
  appCheck = initializeAppCheck(firebaseApp, {
    provider: new ReCaptchaV3Provider(RECAPTCHA_V3_SITE_KEY),
    // The SDK proactively refreshes tokens before they expire.
    isTokenAutoRefreshEnabled: true,
  });
} catch (err) {
  // Defensive: initialization can throw on hot-reload (already initialised),
  // or in environments without a window. The api.ts client treats missing
  // tokens as "best effort" — the function rejects them in enforced mode.
  console.warn("App Check init failed", err);
}

/**
 * Fetch a fresh App Check token to attach to an outgoing request as the
 * `X-Firebase-AppCheck` header. Returns null if App Check isn't available
 * or token fetch fails — caller decides whether to proceed.
 */
export async function getAppCheckToken(): Promise<string | null> {
  if (!appCheck) return null;
  try {
    const result = await getToken(appCheck, /* forceRefresh */ false);
    return result.token;
  } catch (err) {
    console.warn("App Check token fetch failed", err);
    return null;
  }
}

// ===== Auth =====

export const auth = getAuth(firebaseApp);

// Single Google provider instance — the SDK is happy with one shared
// across every sign-in call. We don't set custom OAuth scopes; the
// default `profile email` is what we want (displayName + email +
// photoURL come back on the user object).
export const googleProvider = new GoogleAuthProvider();

// ===== Firestore =====
//
// Two named databases the client talks to directly. `recipy-cache` is
// server-only (Cloud Function admin SDK); no client handle needed.

export const dbList = getFirestore(firebaseApp, "recipy-list");
export const dbUsers = getFirestore(firebaseApp, "recipy-users");
