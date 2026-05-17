# Changelog

Ship log keyed by milestone. Commits referenced where useful. Most recent at the top.

## M2.1 — State refactor (May 2026)

[`f98ab00`](https://github.com/duckybaby/recipy/commit/f98ab00) — Filters moved off URL search params into a Zustand store. URL is back to three paths (`/`, `/results`, `/recipe/:id`) with no query strings. Loader policy now follows user intent (`location.state.intent`) rather than cache presence, which fixed two long-standing bugs:

- Find Recipes always shows the loader for at least 600 ms, even when the cache would have answered. Cache hit means no API call, but the loader still confirms the tap registered.
- Back nav from Recipe to Results no longer re-fetches with empty filters. The card you tapped is still on top.

Each Results slot can now hold one `previousVersion` so "find alternate" preserves the original for the M2 compare view (cap of 2 versions per slot).

Dropped "weeknight easy" from the difficulty enum (1–4 levels now) and tightened the prompt so Claude has to pick the level honestly instead of clustering everything in the middle.

Reverted the prompt-cache patch — the write premium wasn't amortising at our hit rate. Kept the cuisine-de-bias patch so unscoped searches spread across global traditions.

`SCHEMA_VERSION` bumped to 5 so legacy `recipe-app:*` keys and the old `recipy-store` entry get wiped once on first load.

Vite now pre-bundles `zustand` via `optimizeDeps.include` — the lazy discover was triggering a mid-session reload that left a stale React reference in the optimized bundle and crashed every `useStore` call.

## M2 polish — Recipe redesign + transitions (May 2026)

[`18502aa`](https://github.com/duckybaby/recipy/commit/18502aa), [`b06e2ce`](https://github.com/duckybaby/recipy/commit/b06e2ce), [`12b05ad`](https://github.com/duckybaby/recipy/commit/12b05ad) — Recipe page rebuilt around tabs (Recipe · Equipment · Ingredients), sticky bottom CTA that shrinks to a `ChefHat` FAB on scroll-down and expands back on scroll-up, kebab menu for tertiary recovery actions, and an in-bar title that fades in once the in-page title scrolls out. Ingredients tab carries a checkbox-driven Instamart batch flow (select items → check availability → add to cart) and an inline substitutions accordion that rewrites step text via `applySubstitutions`.

App-like transitions wired through `framer-motion`'s `AnimatePresence` (`mode="wait"`): Form → Results slides up, Results → Recipe morphs the card title into the page header via `layoutId`, Recipe → Results on POP slides right.

Backend patches:
- Patch 1: hardened input validation (zod), App Check verification in front of every route, structured error envelopes.
- Patch 2: prompt caching (later reverted in M2.1).
- Patch 3: cuisine de-bias prompt — kept.

## M2 — Anthropic backend + frontend wiring (March 2026)

[`f9b0730`](https://github.com/duckybaby/recipy/commit/f9b0730), [`dc03c8c`](https://github.com/duckybaby/recipy/commit/dc03c8c), [`9f5e3b8`](https://github.com/duckybaby/recipy/commit/9f5e3b8), [`3bb6296`](https://github.com/duckybaby/recipy/commit/3bb6296), [`29adc6e`](https://github.com/duckybaby/recipy/commit/29adc6e), [`40d3f3b`](https://github.com/duckybaby/recipy/commit/40d3f3b), [`ebc1316`](https://github.com/duckybaby/recipy/commit/ebc1316) — Cloud Functions came online. Express app on Node 20, second-gen Cloud Function in `asia-south1`, fronted by Firebase Hosting's `/api/**` rewrite. App Check (reCAPTCHA v3) shields every route. `/api/search-recipes` streams NDJSON so the frontend renders each recipe as its closing brace lands.

Web search uses Claude Sonnet 4.6 with the `web_search_20250305` server tool, capped at 3 uses per call to stay under Tier-1 rate limits. `max_tokens` set to 16384 to fit three full recipes worth of normalised JSON. Output is instructed to be compact (no pretty-printing) so the stream parser sees closing braces sooner.

GitHub Actions deploys hosting + functions on push to `main` ([`f222466`](https://github.com/duckybaby/recipy/commit/f222466)).

## Phase 1 — Reskin + local mocks (February 2026)

[`81a9a31`](https://github.com/duckybaby/recipy/commit/81a9a31) — Reskinned to a warmer palette (paper, ink, accent orange). Mock API behind a `VITE_USE_MOCKS` flag so the frontend can be developed without burning Anthropic credits. `mockRecipes.ts` carries one fully-realised recipe (Tomato Rasam) that exercises every section of the Recipe page.

## M1 — Three screens, mocked data (January 2026)

[`3706d7e`](https://github.com/duckybaby/recipy/commit/3706d7e) — Form → Results → Recipe wired up against mocked data. Design tokens hardened in `index.css` via Tailwind v4's `@theme`. Chip groups, recipe cards, ingredient rows, servings adjuster, feedback sheet all in place. URL search params held filter state (later replaced in M2.1).

## M0 — Bootstrap (January 2026)

[`4939eed`](https://github.com/duckybaby/recipy/commit/4939eed) — Vite 8 + React 19 + TypeScript + Tailwind v4 + PWA scaffold. React Router v7 wiring. Folder structure per spec.

---

## Up next

- **M3** — Cooking mode: offline-capable steps screen, wake lock with visibilitychange auto-recovery, multi-channel timer alert (visual + vibrate + chime + system notification), notifications permission card on first cook.
- **M4** — Instamart Path B (heuristic): the classification is already in place; needs the cart-prefill URL.
- **M5** — Polish: hit every acceptance criterion in [`docs/spec.md` §13](docs/spec.md).

V2 work (out of scope for v1): per-user accounts, Firestore sync, saved recipes ("Library"), source quality signal, voice mode in cooking. See [`docs/spec.md` §15](docs/spec.md) for the full V2 backlog.
