// Upsert helper for the recipy-list library.
//
// Every recipe Anthropic returns gets written here, keyed by a hash of
// the source URL. Same URL across multiple searches collapses to one doc
// — the upsert merges `lastSeenAt` and increments nothing else.
//
// Writes happen via firebase-admin (admin SDK bypasses rules). The same
// helper is used by:
//   - the /api/search-recipes handler (live path, after res.end())
//   - the /api/find-alternate-source handler (single-recipe variant)
//   - scripts/backfill-library.ts (one-time backfill of existing cache)
//
// Errors are caught and logged but never thrown — a library write
// failure must never break the user-facing response.

import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { createHash } from "node:crypto";
import type { Recipe, SearchFilters } from "./validation";

const DATABASE_ID = "recipy-list";
const RECIPES_COLLECTION = "recipes";
const SCHEMA_VERSION = 1;

let dbHandle: FirebaseFirestore.Firestore | null = null;
function db(): FirebaseFirestore.Firestore {
  if (!dbHandle) dbHandle = getFirestore(DATABASE_ID);
  return dbHandle;
}

/**
 * Stable identifier for a recipe based on its source URL.
 *
 * Normalisation rules (in order):
 *   1. Lowercase the entire URL.
 *   2. Strip the protocol (http/https).
 *   3. Strip `www.` prefix.
 *   4. Strip query string and fragment — recipe pages often have UTM tags
 *      or session IDs that don't affect content.
 *   5. Strip trailing slash.
 *
 * Then SHA-256, first 24 hex chars. Same character budget as the cache key.
 *
 * Two URLs that point at the same recipe page (with/without trailing slash,
 * with/without UTM tags, http vs https, www vs apex) collapse to one doc.
 */
export function recipeIdFromUrl(url: string): string {
  const normalised = url
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("?")[0]
    .split("#")[0]
    .replace(/\/$/, "");

  return createHash("sha256").update(normalised).digest("hex").slice(0, 24);
}

/**
 * Upsert a single recipe into the library. Idempotent — same URL across
 * runs writes one doc, just with refreshed `lastSeenAt`.
 *
 * `addedAt` and `firstSeenIn` are only set on the FIRST insert; subsequent
 * upserts leave them alone. We use a transaction so the existence check
 * and the conditional fields stay consistent.
 */
export async function upsertLibraryRecipe(
  recipe: Recipe,
  firstSeenInFilters?: SearchFilters,
): Promise<void> {
  const id = recipeIdFromUrl(recipe.source.url);
  const docRef = db().collection(RECIPES_COLLECTION).doc(id);

  try {
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(docRef);

      const baseUpdate: Record<string, unknown> = {
        ...recipe,
        schemaVersion: SCHEMA_VERSION,
        lastSeenAt: FieldValue.serverTimestamp(),
        deletedAt: null,
      };

      if (!snap.exists) {
        baseUpdate.addedAt = FieldValue.serverTimestamp();
        if (firstSeenInFilters) {
          baseUpdate.firstSeenIn = { filters: firstSeenInFilters };
        }
      }

      tx.set(docRef, baseUpdate, { merge: true });
    });
  } catch (err) {
    // Library writes are best-effort. The cache write already succeeded,
    // the user already has their response, and the next search of any
    // overlapping recipe will get another chance to upsert.
    console.warn(`library.upsertLibraryRecipe failed for ${id}`, err);
  }
}

/**
 * Upsert a batch of recipes. Used by the live search path and the backfill
 * script. Runs upserts in parallel — Firestore handles ~500 writes/sec
 * per database easily, and a single search returns 3 recipes, so this is
 * effectively zero contention.
 */
export async function upsertLibraryBatch(
  recipes: Recipe[],
  firstSeenInFilters?: SearchFilters,
): Promise<{ ok: number; failed: number }> {
  const results = await Promise.allSettled(
    recipes.map((r) => upsertLibraryRecipe(r, firstSeenInFilters)),
  );

  let ok = 0;
  let failed = 0;
  for (const r of results) {
    if (r.status === "fulfilled") ok++;
    else failed++;
  }
  return { ok, failed };
}
