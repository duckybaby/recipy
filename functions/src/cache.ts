// In-memory response cache for /api/search-recipes.
//
// Backed by a Map inside the warm function instance. Cloud Run will keep
// instances around for ~15 min of idleness, so repeat queries within that
// window get the cache; cold starts and second-instance traffic miss it.
// That's fine — the cache is a cost optimisation, not a correctness
// requirement.
//
// We avoid Firestore here on purpose: the project's Firestore database
// isn't provisioned, and trying to write to it returns NOT_FOUND. The
// retrying writes left dangling promises that Cloud Run interpreted as
// unfinished work, which truncated streaming responses on the client
// side (real user impact). If/when we add saved-recipes or a feedback
// dashboard, that can come back as Firestore — but the search cache
// has no reason to be durable.

import { createHash } from "node:crypto";
import type { Recipe, SearchFilters } from "./validation";

const TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_ENTRIES = 200; // bound memory; oldest entries get evicted

type CacheEntry = {
  recipes: Recipe[];
  expiresAt: number;
};

const store = new Map<string, CacheEntry>();

/** Stable hash of the filter object, ignoring key order. Used as the key. */
export function hashFilters(filters: SearchFilters): string {
  const canonical = {
    meal: [...filters.meal].sort(),
    cuisines: [...filters.cuisines].sort(),
    diet: [...filters.diet].sort(),
    prepMax: filters.prepMax,
    cookMax: filters.cookMax,
    vibes: [...filters.vibes].sort(),
    mainIngredients: [...filters.mainIngredients].sort(),
    surprise: filters.surprise,
    similarTo: filters.similarTo ?? null,
  };
  return createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex")
    .slice(0, 24);
}

export async function readCache(
  filters: SearchFilters,
): Promise<Recipe[] | null> {
  // Surprise mode skips cache — the point of "surprise me" is variety.
  if (filters.surprise) return null;

  const key = hashFilters(filters);
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    store.delete(key);
    return null;
  }
  return entry.recipes;
}

export async function writeCache(
  filters: SearchFilters,
  recipes: Recipe[],
): Promise<void> {
  if (filters.surprise) return;
  if (recipes.length === 0) return; // don't cache empty responses

  // Evict the oldest entry if we've grown past the bound. The Map's
  // iteration order is insertion order, so the first key is the oldest.
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }

  const key = hashFilters(filters);
  store.set(key, {
    recipes,
    expiresAt: Date.now() + TTL_MS,
  });
}

/**
 * Record a feedback event. In v1 we don't have a place to store these
 * durably yet (Firestore is unprovisioned, and the schema's TBD), so
 * for now we structured-log to Cloud Logging — every event is preserved
 * there and we can BigQuery them later if we want to train on them.
 */
export async function logFeedback(
  recipeId: string,
  reason: string,
): Promise<void> {
  // Structured log so Cloud Logging indexes the fields. Easy to query
  // later via Logs Explorer (`jsonPayload.recipeId="..."`).
  console.log(
    JSON.stringify({
      type: "feedback",
      recipeId,
      reason,
      at: new Date().toISOString(),
    }),
  );
}
