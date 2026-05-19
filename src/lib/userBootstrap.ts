// First-sign-in bootstrap for the users/{uid} document in recipy-users.
//
// Calls the server's /api/user-doc/ensure endpoint instead of writing to
// Firestore directly from the browser. Same-origin /api request rewrites
// to our Cloud Function, which runs admin-SDK writes server-side. This
// route deliberately avoids firestore.googleapis.com from the browser —
// uBlock Origin + most privacy filter lists block that domain, which
// would silently break user-data flows for anyone running an ad blocker.
// Auth tokens travel in the Authorization header; the function verifies
// them via firebase-admin/auth, so the UID is trusted (not spoofable).
//
// Data shape mirrors spec §3.7 — preferences.* fields are empty in v1;
// M3 phase 4 (Preferences UI) fills them via /api/user-doc/* endpoints
// using the same pattern.

import type { User } from "firebase/auth";
import { getAppCheckToken } from "./firebase";

export type UserPreferences = {
  diet: string[];
  allergies: string[];
  spiceTolerance: "mild" | "medium" | "hot" | null;
  defaultPrepMaxMin: number | null;
  defaultCookMaxMin: number | null;
  customChips: {
    meal: string[];
    cuisines: string[];
    diet: string[];
    vibes: string[];
    mainIngredients: string[];
  };
};

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

/**
 * Ensure the user's root document exists. Returns true if a new doc was
 * created (first-ever sign-in), false if it already existed — or if the
 * call failed (logged, not thrown; the next sign-in retries).
 *
 * Failures here must never break the auth flow. The drawer's profile
 * photo and display name read from `auth.currentUser`, not the Firestore
 * doc, so a missing doc just means preferences won't load until the next
 * successful ensure.
 */
export async function ensureUserDoc(user: User): Promise<boolean> {
  try {
    const idToken = await user.getIdToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    };
    const appCheckToken = await getAppCheckToken();
    if (appCheckToken) headers["X-Firebase-AppCheck"] = appCheckToken;

    const res = await fetch(`${API_BASE}/api/user-doc/ensure`, {
      method: "POST",
      headers,
    });
    if (!res.ok) {
      console.warn("ensureUserDoc HTTP error", res.status);
      return false;
    }
    const body = (await res.json()) as { created?: boolean };
    return body.created === true;
  } catch (err) {
    console.warn("ensureUserDoc failed", err);
    return false;
  }
}
