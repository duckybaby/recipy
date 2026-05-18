// User context — Firebase Auth state + (future) preferences.
//
// M3 phase 2 ships this seam wired to live auth:
//   - `user` is the Firebase Auth User (or null when signed out).
//   - `loading` is true during the initial onAuthStateChanged resolve
//     (~100ms from IndexedDB on cold start; longer on first-ever load).
//   - `signOut()` clears the auth session.
//
// Later M3 phases add:
//   - `preferences` (phase 4) — diet, allergies, spice, custom chips
//   - `savedRecipeIds` (phase 5) — for the heart-toggle state
//
// Components read whichever slice they need via the same hook so future
// growth doesn't require touching every consumer.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, signOut as fbSignOut, type User } from "firebase/auth";
import { auth } from "../lib/firebase";
import { ensureUserDoc } from "../lib/userBootstrap";

export type UserContextValue = {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const Ctx = createContext<UserContextValue>({
  user: null,
  loading: true,
  signOut: async () => {},
});

export function UserContextProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // Start with `loading: true` so AuthGate can render a neutral spinner
  // for the brief window before onAuthStateChanged fires. Firebase reads
  // from IndexedDB on cold start; usually ~100ms.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (next) => {
      setUser(next);
      setLoading(false);
      if (next) {
        // Fire-and-forget the bootstrap. Failures are logged inside
        // ensureUserDoc; we don't gate the UI on it because a returning
        // user's doc already exists and a first-time user's profile load
        // (drawer photo + name) reads from `auth.currentUser`, not the
        // Firestore doc.
        void ensureUserDoc(next);
      }
    });
    return unsub;
  }, []);

  // useMemo so the context value's identity is stable across renders
  // that don't change user/loading. Consumers re-render only on actual
  // state transitions.
  const value = useMemo<UserContextValue>(
    () => ({
      user,
      loading,
      signOut: () => fbSignOut(auth),
    }),
    [user, loading],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUserContext(): UserContextValue {
  return useContext(Ctx);
}
