// AuthGate — the hard gate for M3.
//
// Three rendering states based on Firebase Auth resolution:
//   • loading (`onAuthStateChanged` hasn't fired yet) → neutral spinner.
//     This window is ~100ms on warm starts because Firebase reads from
//     IndexedDB; rendering Splash here would flash for signed-in users.
//   • not signed in → <Splash />.
//   • signed in → the wrapped children (the app routes).
//
// Sits inside <UserContextProvider> so it can read the auth state. App.tsx
// wraps every route in <AuthGate>.

import type { ReactNode } from "react";
import { useUserContext } from "../hooks/useUserContext";
import { Splash } from "./Splash";

export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useUserContext();

  if (loading) {
    // Minimal placeholder — paper background so the surface doesn't flash
    // white in dark mode, no copy so we don't tease either the splash or
    // the app for the ~100ms this is on screen.
    return (
      <div
        aria-busy="true"
        className="flex min-h-[100dvh] items-center justify-center bg-paper"
      />
    );
  }

  if (!user) return <Splash />;

  return <>{children}</>;
}
