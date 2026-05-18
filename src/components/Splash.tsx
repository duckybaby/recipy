// Splash / sign-in screen (spec §3.5 — M3).
//
// Full-viewport gate shown when nobody is signed in. Single CTA: Sign in
// with Google. On success, AuthGate unmounts this and the app proper takes
// over.
//
// Persistence is the SDK default (`browserLocalPersistence`) — the user
// signs in once per device and stays signed in across reboots, browser
// updates, and schema migrations.

import { useState } from "react";
import { signInWithPopup, signInWithRedirect } from "firebase/auth";
import { auth, googleProvider } from "../lib/firebase";

export function Splash() {
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setError(null);
    setSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
      // No further action — onAuthStateChanged in useUserContext picks
      // up the new user and AuthGate swaps Splash out for the app.
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      // Popup blocked → fall back to a full-page redirect. Mobile Safari
      // in particular tends to block popups; redirect always works.
      if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
        try {
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (redirectErr) {
          console.warn("redirect sign-in failed", redirectErr);
        }
      }
      // User closed the popup — silent recover, not an error to show.
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        setSigningIn(false);
        return;
      }
      console.warn("sign-in failed", err);
      setError("Couldn't sign in. Try again?");
      setSigningIn(false);
    }
  }

  return (
    <main className="safe-pt safe-pb flex min-h-[100dvh] flex-col items-center justify-center bg-paper px-5">
      <div className="mx-auto flex w-full max-w-md flex-col items-center text-center">
        <h1 className="font-serif text-title text-ink">recipy</h1>
        <p className="mt-2 text-body text-ink-muted">What are we cooking?</p>

        <p className="mt-10 text-body text-ink">
          Find a real recipe, scale it for your household, walk through it step by step.
        </p>

        <button
          type="button"
          onClick={handleSignIn}
          disabled={signingIn}
          aria-label="Sign in with Google"
          className="focus-ring mt-10 inline-flex w-full items-center justify-center gap-3 rounded-button border border-line bg-paper px-5 py-3 text-strong font-medium text-ink shadow-soft transition-colors hover:bg-paper-soft disabled:cursor-not-allowed disabled:opacity-60"
          style={{ minHeight: 48 }}
        >
          <GoogleGMark />
          <span>{signingIn ? "Signing in…" : "Sign in with Google"}</span>
        </button>

        {error && (
          <p
            role="alert"
            className="mt-4 text-caption text-accent"
            style={{ color: "var(--color-accent-strong, var(--color-accent))" }}
          >
            {error}
          </p>
        )}

        <p className="mt-10 text-caption text-ink-faint">
          Your saved recipes and preferences live on your account.
        </p>
      </div>
    </main>
  );
}

/**
 * Google "G" logomark — the four-colour glyph used on Google's official
 * "Sign in with Google" button. Inlined as SVG so we don't depend on a
 * remote asset (or a CDN URL that could break the offline-first story).
 * Path data is the public branding asset Google publishes for partners.
 */
function GoogleGMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}
