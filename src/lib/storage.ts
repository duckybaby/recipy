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

const K = {
  activeRecipe: `${PREFIX}active-recipe`,
  cookingState: `${PREFIX}cooking-state`,
  recentRecipes: `${PREFIX}recent-recipes`,
  lastSearch: `${PREFIX}last-search`,
  notificationsPrompt: `${PREFIX}notifications-prompt`,
  dismissedMakeahead: `${PREFIX}dismissed-makeahead`,
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

// Useful for tests + the M5 "iOS Safari private mode" check
export function isUsingMemoryFallback(): boolean {
  return useMemory;
}
