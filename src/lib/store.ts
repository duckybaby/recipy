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
//   • theme         — user's explicit light/dark choice. `null` means
//                     "follow the system" (prefers-color-scheme). Read by
//                     the early init script in index.html so the right
//                     surface paints on first frame.
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

// Theme preference. `null` means the user hasn't picked — fall back to
// `prefers-color-scheme`. "light" / "dark" are explicit overrides.
export type ThemePreference = "light" | "dark" | null;

interface AppState {
  filters: SearchFilters;
  lastSearch: LastSearchState | null;
  activeRecipe: ActiveRecipeState | null;
  theme: ThemePreference;

  setFilters: (next: SearchFilters) => void;
  patchFilters: (patch: Partial<SearchFilters>) => void;
  resetFilters: () => void;

  setLastSearch: (next: LastSearchState) => void;
  clearLastSearch: () => void;

  setActiveRecipe: (recipe: Recipe, source?: ActiveRecipeState["source"]) => void;
  clearActiveRecipe: () => void;

  setTheme: (next: ThemePreference) => void;
}

const LAST_SEARCH_TTL_MS = 24 * 60 * 60 * 1000;

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      filters: EMPTY_FILTERS,
      lastSearch: null,
      activeRecipe: null,
      theme: null,

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

      setTheme: (next) => set({ theme: next }),
    }),
    {
      name: "recipy-store",
      storage: createJSONStorage(() => localStorage),
      // v2: reset every persisted `theme` back to null (Auto). The
      // toggle had two manual states before — once users committed,
      // they were locked out of Auto. The cycle now passes through it,
      // but anyone whose store predates this bump still carries their
      // old explicit preference. Wiping just `theme` (not filters /
      // lastSearch / activeRecipe) is the gentlest fix.
      version: 2,
      migrate: (persistedState, fromVersion) => {
        if (fromVersion < 2 && persistedState && typeof persistedState === "object") {
          const rest = { ...(persistedState as Record<string, unknown>) };
          rest.theme = null;
          return rest as Partial<AppState>;
        }
        return persistedState as Partial<AppState>;
      },
      // Persist every slice the early init script + back-nav restore care
      // about. `theme` matters here because the inline script in index.html
      // reads it before React mounts.
      partialize: (s) => ({
        filters: s.filters,
        lastSearch: s.lastSearch,
        activeRecipe: s.activeRecipe,
        theme: s.theme,
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

// ============================================================== theme ===

// iOS Safari status-bar tint. Keep in sync with --color-paper for each mode
// so the chrome doesn't clash with the page surface.
const THEME_COLOR_LIGHT = "#ffffff";
const THEME_COLOR_DARK = "#1a1612";

/**
 * Resolve a preference to a concrete mode. `null` → consult the OS via
 * `prefers-color-scheme`. Safe to call before React mounts.
 */
export function resolveTheme(pref: ThemePreference): "light" | "dark" {
  if (pref === "dark" || pref === "light") return pref;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/**
 * Apply a resolved theme to the document: sets `data-theme` on <html>
 * (which triggers the CSS token cascade) and updates the iOS Safari
 * chrome-tint meta tag. Idempotent.
 */
export function applyTheme(mode: "light" | "dark"): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = mode;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", mode === "dark" ? THEME_COLOR_DARK : THEME_COLOR_LIGHT);
  }
}
