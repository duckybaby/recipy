// V2 personalisation seam (spec §11).
//
// In v1 this returns an empty/no-op context. In v2 the provider will read
// from Firestore + auth and populate favourites, allergies, pantry, etc.
// Wire components to this hook even in v1 so v2 is a hook-implementation
// swap, not a refactor.

import { createContext, useContext, type ReactNode } from "react";

export type UserContext = {
  favourites: string[]; // recipe ids
  cookedBefore: string[]; // recipe ids
  allergies: string[];
  pantry: string[];
  notes: Record<string, string>; // recipeId → note
  diet: string | null;
};

const EMPTY: UserContext = {
  favourites: [],
  cookedBefore: [],
  allergies: [],
  pantry: [],
  notes: {},
  diet: null,
};

const Ctx = createContext<UserContext>(EMPTY);

export function UserContextProvider({ children }: { children: ReactNode }) {
  // V1: always empty. V2 will replace this with a Firestore-backed value.
  return <Ctx.Provider value={EMPTY}>{children}</Ctx.Provider>;
}

export function useUserContext(): UserContext {
  return useContext(Ctx);
}
