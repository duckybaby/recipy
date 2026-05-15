// App Check verification middleware (Firebase App Check).
//
// Verifies the X-Firebase-AppCheck token attached by the frontend
// (see src/lib/firebase.ts). Reject requests without a valid token so
// the function can't be called from curl, Postman, or a cloned app.
//
// Enforcement is controlled by ENFORCE_APP_CHECK at the top of this file.
// We default to true in production — that's the whole point of wiring
// App Check. The Firebase emulator is exempt so local dev still works.

import type { Request, Response, NextFunction } from "express";
import { getAppCheck } from "firebase-admin/app-check";

const ENFORCE_APP_CHECK = true;

// FUNCTIONS_EMULATOR=true is set automatically by the Firebase Functions
// emulator. Treat that environment as exempt — the SDK debug token flow
// covers local dev (a developer pastes their console-printed debug token
// into Firebase Console once).
const IS_EMULATOR = process.env.FUNCTIONS_EMULATOR === "true";

export async function verifyAppCheck(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // Skip CORS preflight — it won't carry the App Check header anyway.
  if (req.method === "OPTIONS") return next();

  // Allow the health endpoint through (handy for uptime probes).
  if (req.path === "/api/health") return next();

  const token = req.header("X-Firebase-AppCheck");
  if (!token) {
    if (ENFORCE_APP_CHECK && !IS_EMULATOR) {
      res.status(401).json({
        error: {
          code: "app_check_missing",
          message: "Missing App Check token.",
        },
      });
      return;
    }
    console.warn("App Check token missing (not enforced)");
    return next();
  }

  try {
    await getAppCheck().verifyToken(token);
    return next();
  } catch (err) {
    console.warn("App Check token invalid", err);
    if (ENFORCE_APP_CHECK && !IS_EMULATOR) {
      res.status(401).json({
        error: {
          code: "app_check_invalid",
          message: "Invalid App Check token.",
        },
      });
      return;
    }
    return next();
  }
}
