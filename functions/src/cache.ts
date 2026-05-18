// Response cache for /api/search-recipes — two-layer.
//
// 1) Hot path: an in-memory Map inside the warm function instance. ~50 ns
//    reads, no network round-trip. Bounded at 50 entries with insertion-
//    order eviction.
// 2) Persistent path: the `recipy-cache` Firestore database in asia-south1
//    (same region as the function). Survives cold starts and instance
//    spin-down; the same query from any device hits it.
//
// On read we check memory first, fall through to Firestore, and backfill
// memory with anything we found. On write we update memory immediately
// and Firestore after — callers `await` the write before returning so
// there's no fire-and-forget promise outliving the handler. The earlier
// truncated-response bug was exactly that: dangling Firestore writes
// against an unprovisioned database that Cloud Run treated as still-
// pending work.
//
// We point at the NAMED database "recipy-cache" rather than (default) —
// the project's default database isn't provisioned. firebase-admin's
// `getFirestore(databaseId)` selects the named one.
//
// `logFeedback` writes to the same Firestore project under `feedback` so
// the events are queryable, with a structured-log mirror so we never lose
// an event if Firestore is temporarily unavailable.

import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { createHash } from "node:crypto";
import type { Recipe, SearchFilters } from "./validation";

const DATABASE_ID = "recipy-cache";
const SEARCH_COLLECTION = "search-cache";
const FEEDBACK_COLLECTION = "feedback";

// 7 days. Recipes don't go stale on the timescale that matters here —
// source pages rarely change content meaningfully day-to-day. A longer
// TTL means the same filter combo within a week stays cached, which
// drops Anthropic spend dramatically (most household repeat queries
// land in the same combo bucket). When the M2 library work lands and
// recipes become per-recipe docs queryable by tag, this TTL stops
// mattering — the library is permanent.
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_MEM_ENTRIES = 50;

type CacheEntry = {
  recipes: Recipe[];
  expiresAt: number; // epoch ms
};

const memCache = new Map<string, CacheEntry>();

// Lazy Firestore handle so the SDK only initialises on first use (cheap
// cold-start optimisation). The named-database call is `getFirestore(id)`.
let dbHandle: FirebaseFirestore.Firestore | null = null;
function db(): FirebaseFirestore.Firestore {
  if (!dbHandle) dbHandle = getFirestore(DATABASE_ID);
  return dbHandle;
}

/** Stable hash of the filter object, ignoring key order. Cache key.
 *  similarTo is lowercased and so are the payloads of any `custom:` chip
 *  values so "custom:Italian" and "custom:italian" share a cache slot
 *  — without that, casing variants would fan out into separate Anthropic
 *  calls for what's effectively the same lookup. Canonical enum values
 *  (already lowercase per validation.ts) are left untouched. */
function normalizeChip(val: string): string {
  if (!val.startsWith("custom:")) return val;
  return "custom:" + val.slice("custom:".length).toLowerCase();
}

export function hashFilters(filters: SearchFilters): string {
  const canonical = {
    meal: [...filters.meal].map(normalizeChip).sort(),
    cuisines: [...filters.cuisines].map(normalizeChip).sort(),
    diet: [...filters.diet].map(normalizeChip).sort(),
    prepMax: filters.prepMax,
    cookMax: filters.cookMax,
    vibes: [...filters.vibes].map(normalizeChip).sort(),
    mainIngredients: [...filters.mainIngredients].map(normalizeChip).sort(),
    surprise: filters.surprise,
    similarTo: filters.similarTo?.toLowerCase() ?? null,
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

  // Hot layer first.
  const mem = memCache.get(key);
  if (mem) {
    if (mem.expiresAt > Date.now()) return mem.recipes;
    memCache.delete(key);
  }

  // Persistent layer.
  try {
    const snap = await db().collection(SEARCH_COLLECTION).doc(key).get();
    if (!snap.exists) return null;
    const data = snap.data() as
      | {
          recipes?: Recipe[];
          createdAt?: FirebaseFirestore.Timestamp;
        }
      | undefined;
    if (!data?.recipes || !data?.createdAt) return null;

    const ageMs = Date.now() - data.createdAt.toMillis();
    if (ageMs > TTL_MS) return null;

    // Backfill the hot layer so the next read on this instance is local.
    memCache.set(key, {
      recipes: data.recipes,
      expiresAt: Date.now() + (TTL_MS - ageMs),
    });
    evictMemIfFull();
    return data.recipes;
  } catch (err) {
    // Cache failures must never break the request — fall through to a
    // fresh search.
    console.warn("cache.readCache failed", err);
    return null;
  }
}

export async function writeCache(
  filters: SearchFilters,
  recipes: Recipe[],
): Promise<void> {
  if (filters.surprise) return;
  if (recipes.length === 0) return;

  const key = hashFilters(filters);

  // Write the hot layer first — synchronous, can't fail.
  memCache.set(key, { recipes, expiresAt: Date.now() + TTL_MS });
  evictMemIfFull();

  // Persistent layer. Callers await this so we don't leave a dangling
  // promise after `res.end()`.
  try {
    await db().collection(SEARCH_COLLECTION).doc(key).set({
      recipes,
      createdAt: FieldValue.serverTimestamp(),
      filtersJson: JSON.stringify(filters), // debugging aid; not used for lookup
    });
  } catch (err) {
    console.warn("cache.writeCache failed", err);
  }
}

function evictMemIfFull(): void {
  if (memCache.size <= MAX_MEM_ENTRIES) return;
  const oldestKey = memCache.keys().next().value;
  if (oldestKey !== undefined) memCache.delete(oldestKey);
}

/**
 * Log a feedback event. v1 stores it in Firestore under `feedback` so we
 * can query it later (source quality signal, post-mortem on bad recipes).
 * A structured `console.log` mirrors the same payload so events are never
 * lost even if Firestore is briefly unavailable — Cloud Logging captures
 * everything.
 */
export async function logFeedback(
  recipeId: string,
  reason: string,
): Promise<void> {
  const at = new Date().toISOString();

  console.log(JSON.stringify({ type: "feedback", recipeId, reason, at }));

  try {
    await db().collection(FEEDBACK_COLLECTION).add({
      recipeId,
      reason,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.warn("cache.logFeedback failed", err);
  }
}
