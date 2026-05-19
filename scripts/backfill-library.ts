// One-time backfill: read every doc in recipy-cache/search-cache,
// extract the recipes array, dedupe by source URL, and upsert each into
// recipy-list/recipes/{normalizedUrlHash}.
//
// Run locally with a Firebase service-account key for the project. The
// key needs Cloud Datastore User on both databases.
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json \
//   npx ts-node scripts/backfill-library.ts [--dry-run]
//
// Flags:
//   --dry-run    Print what would be written, don't actually write.
//                Recommended for the first run so you can see the counts
//                before committing data.
//
// Idempotent: re-running is safe. Recipes that already exist in the
// library get their `lastSeenAt` updated, nothing else.

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { upsertLibraryBatch } from "../functions/src/library";
import type { Recipe, SearchFilters } from "../functions/src/validation";

const PROJECT_ID = "recipy-63422";
const CACHE_DB_ID = "recipy-cache";
const SEARCH_COLLECTION = "search-cache";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  initializeApp({
    projectId: PROJECT_ID,
    credential: applicationDefault(),
  });

  const cacheDb = getFirestore(CACHE_DB_ID);

  console.log(`Backfill starting${DRY_RUN ? " (DRY RUN)" : ""}`);
  console.log(`Reading from ${CACHE_DB_ID}/${SEARCH_COLLECTION}`);

  const PAGE_SIZE = 100;
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  let cacheDocsRead = 0;
  let recipesSeen = 0;
  const uniqueUrls = new Set<string>();
  let totalOk = 0;
  let totalFailed = 0;

  while (true) {
    let query = cacheDb
      .collection(SEARCH_COLLECTION)
      .orderBy("__name__")
      .limit(PAGE_SIZE);
    if (lastDoc) query = query.startAfter(lastDoc);

    const snap = await query.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      cacheDocsRead++;
      const data = doc.data() as {
        recipes?: Recipe[];
        filtersJson?: string;
      };

      if (!data.recipes || !Array.isArray(data.recipes)) {
        console.warn(`Skipping ${doc.id}: no recipes array`);
        continue;
      }

      let filters: SearchFilters | undefined;
      if (data.filtersJson) {
        try {
          filters = JSON.parse(data.filtersJson) as SearchFilters;
        } catch {
          // ignore — filters become undefined, library doc just won't
          // have firstSeenIn.filters set.
        }
      }

      for (const r of data.recipes) {
        recipesSeen++;
        if (r.source?.url) uniqueUrls.add(r.source.url.toLowerCase());
      }

      if (DRY_RUN) {
        console.log(
          `  ${doc.id}: would upsert ${data.recipes.length} recipes`,
        );
        continue;
      }

      const result = await upsertLibraryBatch(data.recipes, filters);
      totalOk += result.ok;
      totalFailed += result.failed;

      // Light throttle — Firestore is fast but no need to thunder.
      await new Promise((res) => setTimeout(res, 50));
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE_SIZE) break;
  }

  console.log("\nDone.");
  console.log(`  Cache docs read:      ${cacheDocsRead}`);
  console.log(`  Recipe entries seen:  ${recipesSeen}`);
  console.log(`  Unique source URLs:   ${uniqueUrls.size}`);
  if (!DRY_RUN) {
    console.log(`  Library upserts OK:   ${totalOk}`);
    console.log(`  Library upserts fail: ${totalFailed}`);
  }
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
