// localStorage adapter (spec §7.9).
//
// All access goes through this module so v2 can swap in a Firestore-backed
// implementation without touching call sites. Every operation is wrapped in
// try/catch — iOS Safari private mode throws on setItem, and the app must
// degrade gracefully to in-memory rather than crash.

import type {
  ActiveRecipe,
  CookingState,
  LastSearch,
  NotificationsPrompt,
  Recipe,
} from "./types";

const PREFIX = "recipe-app:";

// Bump this whenever a stored shape changes in a way old data can't be
// trusted with. On boot we compare the value in localStorage against this
// number; mismatch → wipe every `${PREFIX}*` key once, so the user doesn't
// have to clear Safari storage by hand.
//
// v3: forced reset after M2 polish ship — stale cached search results
//   from earlier dev iterations were causing odd back-navigation refetches
//   on real devices. Cleanest fix is a single wipe for everyone.
// v2: equipment lists got richer when we shipped HugeIcons.
const SCHEMA_VERSION = 3;
const VERSION_KEY = `${PREFIX}schema-version`;

(function migrateStorageOnce() {
  try {
    if (typeof localStorage === "undefined") return;
    const stored = localStorage.getItem(VERSION_KEY);
    if (stored === String(SCHEMA_VERSION)) return;
    // Walk in reverse since removeItem shifts the index.
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PREFIX) && key !== VERSION_KEY) {
        localStorage.removeItem(key);
      }
    }
    localStorage.setItem(VERSION_KEY, String(SCHEMA_VERSION));
  } catch {
    /* localStorage unavailable — nothing to migrate. */
  }
})();

const K = {
  activeRecipe: `${PREFIX}active-recipe`,
  cookingState: `${PREFIX}cooking-state`,
  recentRecipes: `${PREFIX}recent-recipes`,
  lastSearch: `${PREFIX}last-search`,
  notificationsPrompt: `${PREFIX}notifications-prompt`,
  dismissedMakeahead: `${PREFIX}dismissed-makeahead`,
  customChips: `${PREFIX}custom-chips`,
} as const;

// In-memory fallback when localStorage is unavailable (private mode, quota).
const memory = new Map<string, string>();
let useMemory = false;

function read<T>(key: string): T | null {
  try {
    const raw = useMemory ? memory.get(key) : localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  const raw = JSON.stringify(value);
  try {
    if (useMemory) {
      memory.set(key, raw);
    } else {
      localStorage.setItem(key, raw);
    }
  } catch {
    // localStorage threw — degrade to memory for the rest of the session.
    useMemory = true;
    memory.set(key, raw);
  }
}

function remove(key: string): void {
  try {
    if (useMemory) memory.delete(key);
    else localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

// ---------- Active recipe (spec §7.9) ----------

export function getActiveRecipe(): ActiveRecipe | null {
  return read<ActiveRecipe>(K.activeRecipe);
}

export function setActiveRecipe(value: ActiveRecipe): void {
  write(K.activeRecipe, value);
}

export function clearActiveRecipe(): void {
  remove(K.activeRecipe);
}

// ---------- Cooking state (spec §7.9) ----------

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function getCookingState(): CookingState | null {
  const state = read<CookingState>(K.cookingState);
  if (!state) return null;
  // Expire after 7 days (spec §7.9)
  const age = Date.now() - new Date(state.lastTouchedAt).getTime();
  if (age > SEVEN_DAYS_MS) {
    remove(K.cookingState);
    return null;
  }
  return state;
}

export function setCookingState(value: CookingState): void {
  write(K.cookingState, value);
}

export function clearCookingState(): void {
  remove(K.cookingState);
}

// ---------- Recent recipes (spec §7.9) ----------

const RECENT_CAP = 10;

export function getRecentRecipes(): Recipe[] {
  return read<Recipe[]>(K.recentRecipes) ?? [];
}

export function pushRecentRecipe(recipe: Recipe): void {
  const existing = getRecentRecipes().filter((r) => r.id !== recipe.id);
  const next = [recipe, ...existing].slice(0, RECENT_CAP);
  write(K.recentRecipes, next);
}

// ---------- Last search (spec §7.9) ----------

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function getLastSearch(): LastSearch | null {
  const ls = read<LastSearch>(K.lastSearch);
  if (!ls) return null;
  const age = Date.now() - new Date(ls.fetchedAt).getTime();
  if (age > ONE_DAY_MS) {
    remove(K.lastSearch);
    return null;
  }
  return ls;
}

export function setLastSearch(value: LastSearch): void {
  write(K.lastSearch, value);
}

// ---------- Notifications prompt state (spec §6) ----------

export function getNotificationsPrompt(): NotificationsPrompt | null {
  return read<NotificationsPrompt>(K.notificationsPrompt);
}

export function setNotificationsPrompt(value: NotificationsPrompt): void {
  write(K.notificationsPrompt, value);
}

// ---------- Dismissed make-ahead nudges (spec §5) ----------

export function getDismissedMakeahead(): string[] {
  return read<string[]>(K.dismissedMakeahead) ?? [];
}

export function dismissMakeahead(recipeId: string): void {
  const current = getDismissedMakeahead();
  if (!current.includes(recipeId)) {
    write(K.dismissedMakeahead, [...current, recipeId]);
  }
}

export function clearDismissedMakeahead(): void {
  remove(K.dismissedMakeahead);
}

// ---------- Custom chips (Form page) ----------
//
// Users can add their own option to any chip group (e.g. "Korean" under
// Cuisine, "Brunch" under Meal). Stored as a map keyed by group id with
// the entries the user has typed. Lower-cased + trimmed.

export type CustomChipsByGroup = Record<string, string[]>;

export function getCustomChips(): CustomChipsByGroup {
  return read<CustomChipsByGroup>(K.customChips) ?? {};
}

export function getCustomChipsForGroup(groupId: string): string[] {
  return getCustomChips()[groupId] ?? [];
}

export function addCustomChip(groupId: string, raw: string): void {
  const value = raw.trim();
  if (!value) return;
  const all = getCustomChips();
  const existing = all[groupId] ?? [];
  if (existing.some((v) => v.toLowerCase() === value.toLowerCase())) return;
  all[groupId] = [...existing, value];
  write(K.customChips, all);
}

export function removeCustomChip(groupId: string, value: string): void {
  const all = getCustomChips();
  if (!all[groupId]) return;
  all[groupId] = all[groupId].filter((v) => v !== value);
  if (all[groupId].length === 0) delete all[groupId];
  write(K.customChips, all);
}

// Useful for tests + the M5 "iOS Safari private mode" check
export function isUsingMemoryFallback(): boolean {
  return useMemory;
}
