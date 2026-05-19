// User-doc operations against recipy-users.
//
// Lives server-side so the browser never has to talk to
// firestore.googleapis.com directly — that domain gets blocked by uBlock
// Origin and most privacy filter lists, which would silently break user
// bootstrap / preferences / saved for anyone running an ad blocker. The
// recipy app talks to `/api/user-doc/*` (same-origin via Firebase Hosting
// rewrites) and this module handles all Firestore writes via the admin
// SDK — which doesn't need a network call from the user's browser.
//
// Auth: every entry point requires a Firebase ID token in the
// Authorization header. The UID comes from the verified token, never
// from the request body — clients can't spoof which user they're acting
// as. App Check already gated the request upstream via the global
// middleware in index.ts; this module enforces user-level identity.

import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth as getAdminAuth } from "firebase-admin/auth";

const DATABASE_ID = "recipy-users";
const USERS_COLLECTION = "users";

// Default preferences shape — empty in v1, M3 phase 4 (Preferences UI)
// fills these in. Kept here (not in a shared types file) because this is
// the only writer of new user docs, and inlining keeps the seed obvious.
const EMPTY_PREFERENCES = {
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

let dbHandle: FirebaseFirestore.Firestore | null = null;
function db(): FirebaseFirestore.Firestore {
  if (!dbHandle) dbHandle = getFirestore(DATABASE_ID);
  return dbHandle;
}

export type VerifiedClaims = {
  uid: string;
  name: string | null;
  email: string | null;
  picture: string | null;
};

export class AuthError extends Error {
  code: "missing_auth" | "invalid_auth";
  status: number;
  constructor(code: "missing_auth" | "invalid_auth", message: string) {
    super(message);
    this.code = code;
    this.status = 401;
  }
}

/**
 * Read + verify a Firebase ID token from an `Authorization: Bearer …`
 * header. Returns the decoded claims (uid + profile fields). Throws
 * AuthError on missing / invalid token — caller converts to a 401.
 */
export async function verifyAuthFromHeader(
  authHeader: string | undefined,
): Promise<VerifiedClaims> {
  const match = (authHeader ?? "").match(/^Bearer (.+)$/);
  if (!match) {
    throw new AuthError("missing_auth", "Missing bearer token.");
  }
  try {
    const decoded = await getAdminAuth().verifyIdToken(match[1]);
    return {
      uid: decoded.uid,
      name: decoded.name ?? null,
      email: decoded.email ?? null,
      picture: decoded.picture ?? null,
    };
  } catch {
    throw new AuthError("invalid_auth", "Invalid or expired ID token.");
  }
}

export type EnsureUserDocResult = {
  created: boolean;
};

/**
 * Idempotent user-doc bootstrap. On first sign-in creates `users/{uid}`
 * with Google profile defaults + empty preferences; on returning sign-ins
 * just touches `lastSignInAt` so existing preferences + saved subcollection
 * stay intact.
 */
export async function ensureUserDoc(
  claims: VerifiedClaims,
): Promise<EnsureUserDocResult> {
  const ref = db().collection(USERS_COLLECTION).doc(claims.uid);
  const snap = await ref.get();
  if (snap.exists) {
    await ref.set(
      { lastSignInAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    return { created: false };
  }
  await ref.set({
    uid: claims.uid,
    displayName: claims.name,
    email: claims.email,
    photoURL: claims.picture,
    createdAt: FieldValue.serverTimestamp(),
    lastSignInAt: FieldValue.serverTimestamp(),
    preferences: EMPTY_PREFERENCES,
  });
  return { created: true };
}
