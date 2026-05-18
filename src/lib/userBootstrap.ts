// First-sign-in bootstrap for the `users/{uid}` document in recipy-users.
//
// Called from useUserContext immediately after Firebase Auth resolves a
// signed-in user. Checks whether the doc exists; if not, creates it with
// Google profile defaults + an empty preferences object.
//
// This runs from the client (security rules allow users to write their
// own doc). It's idempotent — re-runs on every app load are safe; the
// existence check short-circuits writes for returning users.
//
// Data shape mirrors spec §3.7 — preferences.* fields are empty in v1;
// phase 4 of M3 (Preferences UI) will start populating them.

import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import { dbUsers } from "./firebase";

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

const EMPTY_PREFERENCES: UserPreferences = {
  diet: [],
  allergies: [],
  spiceTolerance: null,
  defaultPrepMaxMin: null,
  defaultCookMaxMin: null,
  customChips: {
    meal: [],
    cuisines: [],
    diet: [],
    vibes: [],
    mainIngredients: [],
  },
};

/**
 * Ensure the user's root document exists. Returns true if a new doc was
 * created (first-ever sign-in), false if it already existed.
 *
 * Failures are logged but never thrown — auth flow should not break on a
 * bootstrap hiccup. The next sign-in retries.
 */
export async function ensureUserDoc(user: User): Promise<boolean> {
  try {
    const ref = doc(dbUsers, "users", user.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) return false;

    await setDoc(ref, {
      uid: user.uid,
      displayName: user.displayName ?? null,
      email: user.email ?? null,
      photoURL: user.photoURL ?? null,
      createdAt: serverTimestamp(),
      lastSignInAt: serverTimestamp(),
      preferences: EMPTY_PREFERENCES,
    });
    return true;
  } catch (err) {
    console.warn("ensureUserDoc failed", err);
    return false;
  }
}
