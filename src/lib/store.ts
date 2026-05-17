// Single Zustand store for app runtime state (spec §7.9, rewritten M2.1).
//
// What lives here:
//   • filters       — what the user has selected in Form. Outlives a single
//                     Form mount so back-from-Results restores the chips.
//   • lastSearch    — the most recent recipe results + the filters used.
//                     Powers the Results cards on POP back from Recipe and
//                     the cache fast-path when filters haven't changed.
//   • activeRecipe  — the recipe being viewed on /recipe/:id. Replaces the
//                     old localStorage key of the same name.
//
// What does NOT live here:
//   • cookingState, recentRecipes, dismissedMakeahead, notificationsPrompt,
//     customChips — these stay in lib/storage.ts. They're app data that
//     individual screens own, not the navigation state these three power.
//
// Persistence uses Zustand's `persist` middleware so the store is durable
// across reloads. The store key is `recipy-store` (no `recipe-app:` prefix)
// so it lives outside the SCHEMA_VERSION sweep in lib/storage.ts.
//
// Loader policy lives in Results.tsx and reads `location.state.intent`. The
// store does NOT track loader state — that's a render-time concern, not a
// persisted one.

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Recipe, SearchFilters } from "./types";

export const EMPTY_FILTERS: SearchFilters = {
  meal: [],
  cuisines: [],
  diet: [],
  prepMax: null,
  cookMax: null,
  vibes: [],
  mainIngredients: [],
  surprise: false,
};

export type LastSearchState = {
  filters: SearchFilters;
  recipes: Recipe[];
  fetchedAt: string; // ISO
};

export type ActiveRecipeState = {
  recipe: Recipe;
  source: "search" | "alternate" | "resumed";
  openedAt: string; // ISO
};

interface AppState {
  filters: SearchFilters;
  lastSearch: LastSearchState | null;
  activeRecipe: ActiveRecipeState | null;

  setFilters: (next: SearchFilters) => void;
  patchFilters: (patch: Partial<SearchFilters>) => void;
  resetFilters: () => void;

  setLastSearch: (next: LastSearchState) => void;
  clearLastSearch: () => void;

  setActiveRecipe: (recipe: Recipe, source?: ActiveRecipeState["source"]) => void;
  clearActiveRecipe: () => void;
}

const LAST_SEARCH_TTL_MS = 24 * 60 * 60 * 1000;

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      filters: EMPTY_FILTERS,
      lastSearch: null,
      activeRecipe: null,

      setFilters: (next) => set({ filters: next }),
      patchFilters: (patch) =>
        set((s) => ({ filters: { ...s.filters, ...patch } })),
      resetFilters: () => set({ filters: EMPTY_FILTERS }),

      setLastSearch: (next) => set({ lastSearch: next }),
      clearLastSearch: () => set({ lastSearch: null }),

      setActiveRecipe: (recipe, source = "search") =>
        set({
          activeRecipe: {
            recipe,
            source,
            openedAt: new Date().toISOString(),
          },
        }),
      clearActiveRecipe: () => set({ activeRecipe: null }),
    }),
    {
      name: "recipy-store",
      storage: createJSONStorage(() => localStorage),
      version: 1,
      // Drop any persisted state from earlier versions — none exist today
      // but this keeps future migrations honest.
      migrate: (_persistedState, _fromVersion) => undefined,
      // Don't persist nothing — keep all three slices durable.
      partialize: (s) => ({
        filters: s.filters,
        lastSearch: s.lastSearch,
        activeRecipe: s.activeRecipe,
      }),
    },
  ),
);

// ============================================================== selectors ===

/**
 * Returns the persisted lastSearch only if it's within the 24h TTL window.
 * Stale entries are nulled out lazily on read — no background sweeper.
 *
 * Use this from outside React (event handlers, helpers). Inside a component,
 * `useStore((s) => s.lastSearch)` plus a manual age check works too, but
 * this keeps the TTL logic in one place.
 */
export function getFreshLastSearch(): LastSearchState | null {
  const last = useStore.getState().lastSearch;
  if (!last) return null;
  const age = Date.now() - new Date(last.fetchedAt).getTime();
  if (age > LAST_SEARCH_TTL_MS) {
    // Lazy cleanup so we don't keep returning the stale entry.
    useStore.getState().clearLastSearch();
    return null;
  }
  return last;
}

/**
 * Find a Recipe by id across every place it might live in-store. Falls back
 * through: activeRecipe → lastSearch.recipes. recentRecipes (lib/storage.ts)
 * is the caller's responsibility — different consumers care about different
 * fallbacks.
 *
 * Also matches against `previousVersion.id` so deep links to a recipe that's
 * since been alt-swapped still resolve to the prior version rather than
 * dead-ending on "couldn't find that recipe".
 */
export function findRecipeInStore(id: string): Recipe | null {
  const s = useStore.getState();
  const active = s.activeRecipe?.recipe;
  if (active?.id === id) return active;
  if (active?.previousVersion?.id === id) return active.previousVersion;
  if (s.lastSearch) {
    for (const r of s.lastSearch.recipes) {
      if (r.id === id) return r;
      if (r.previousVersion?.id === id) return r.previousVersion;
    }
  }
  return null;
}

/**
 * Shallow-equal two filter objects. Used by Results.tsx to decide whether
 * the cached lastSearch matches the user's current filter selection. We
 * could JSON.stringify both, but key-order drift between fresh objects and
 * persisted ones has bitten us before — explicit comparison is safer.
 */
export function filtersEqual(a: SearchFilters, b: SearchFilters): boolean {
  if (a.prepMax !== b.prepMax) return false;
  if (a.cookMax !== b.cookMax) return false;
  if ((a.surprise ?? false) !== (b.surprise ?? false)) return false;
  if ((a.similarTo ?? null) !== (b.similarTo ?? null)) return false;
  if (!arrayEqual(a.meal, b.meal)) return false;
  if (!arrayEqual(a.cuisines, b.cuisines)) return false;
  if (!arrayEqual(a.diet, b.diet)) return false;
  if (!arrayEqual(a.vibes, b.vibes)) return false;
  if (!arrayEqual(a.mainIngredients, b.mainIngredients)) return false;
  return true;
}

function arrayEqual<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
