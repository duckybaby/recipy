// Firestore-backed response cache for /api/search-recipes (spec §8).
//
// "Identical filter combos within 1 hour return the cached response. Use
// Firestore as a simple key-value cache, keyed by hashed filter object."
//
// We use Firestore (not Memorystore) because functions are stateless and
// scale to zero; a tiny KV in Firestore is free at our volume and survives
// cold starts.

import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { createHash } from "node:crypto";
import type { Recipe, SearchFilters } from "./validation";

const COLLECTION = "search-cache";
const TTL_MS = 60 * 60 * 1000; // 1 hour

type CacheDoc = {
  key: string;
  recipes: Recipe[];
  createdAt: FirebaseFirestore.Timestamp;
  filtersJson: string; // debugging aid; not used for lookup
};

/** Stable hash of the filter object, ignoring key order. */
export function hashFilters(filters: SearchFilters): string {
  const canonical = {
    meal: [...filters.meal].sort(),
    cuisines: [...filters.cuisines].sort(),
    diet: [...filters.diet].sort(),
    timeMax: filters.timeMax,
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
  // Surprise mode skips cache — point of "surprise me" is variety.
  if (filters.surprise) return null;

  const key = hashFilters(filters);
  try {
    const snap = await getFirestore().collection(COLLECTION).doc(key).get();
    if (!snap.exists) return null;
    const doc = snap.data() as CacheDoc;
    const ageMs = Date.now() - doc.createdAt.toMillis();
    if (ageMs > TTL_MS) return null;
    return doc.recipes;
  } catch (err) {
    // Cache failures should never break the request.
    console.warn("cache.readCache failed", err);
    return null;
  }
}

export async function writeCache(
  filters: SearchFilters,
  recipes: Recipe[],
): Promise<void> {
  if (filters.surprise) return;
  if (recipes.length === 0) return; // don't cache empty responses

  const key = hashFilters(filters);
  try {
    await getFirestore()
      .collection(COLLECTION)
      .doc(key)
      .set({
        key,
        recipes,
        createdAt: FieldValue.serverTimestamp(),
        filtersJson: JSON.stringify(filters),
      });
  } catch (err) {
    console.warn("cache.writeCache failed", err);
  }
}

/**
 * Append a feedback event to Firestore. v2 will use these to learn source
 * quality. v1 just stores them.
 */
export async function logFeedback(
  recipeId: string,
  reason: string,
): Promise<void> {
  try {
    await getFirestore().collection("feedback").add({
      recipeId,
      reason,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.warn("cache.logFeedback failed", err);
  }
}
