# Changelog

Ship log keyed by milestone. Commits referenced where useful. Most recent at the top.

## M4 — Recipe richness (May 2026)

Driven by real user feedback. People wanted more information on the recipe page (image, video, protein over calories) and finer filters at the dish-shape level (smoothie / salad / soup) and the health-intent level (lighter / high-protein). M4 is purely additive — pre-M4 cached recipes parse fine and just lack the new fields.

### Schema

- **Protein** — `Recipe.protein` (`{ perServingGrams, inferenceSource }` or `null`) on both backend zod (`functions/src/validation.ts`) and frontend types. Prompt updated to estimate grams per serving from the ingredient list. Recovery sheet gains a "Protein looks wrong?" reason that hits `/api/recompute-field` with `field: "protein"`.
- **Hero image** — `source.imageUrl` was `null` in v1 by prompt instruction; M4 wires Anthropic to populate it from the source page. Recipe page renders it at the top of the identity block, `aspect-video object-cover` to keep the layout stable.
- **Video embed** — new `Recipe.videoUrl` field. Anthropic returns the YouTube / Vimeo URL the source page embeds (no off-page YouTube searches). Recipe page renders a collapsed "Watch the video ▾" toggle below the identity. Defensive `toEmbedUrl` helper normalises watch / share URLs to embeddable form.
- **Dish type** — new `Recipe.dishType: string[]` field and `SearchFilters.dishTypes` filter. 15 presets (Curry · Stir-fry · Soup · Salad · Smoothie · Bowl · Sandwich · Wrap · Pasta · Casserole · Bake · Roast · Grill · Pizza · Pancake/Dosa) plus custom chips. Form gains a new chip group; EditChoicesSheet mirrors it.
- **Has-video filter** — new `SearchFilters.hasVideo` boolean. Yes/no toggle on Form (below the chip groups) and on EditChoicesSheet. Soft hint to the prompt — doesn't strictly exclude videoless results.
- **"Lighter" and "High protein" vibe chips** — two new presets in the existing Vibe group. Prompt translates them to descriptive phrases ("lighter (lower-calorie, smaller-portion approach)" and "high protein (aim for at least 25 g per serving)") rather than dropping them in as bare vibes.
- **Version stack** — `Recipe.previousVersion` (single) → `Recipe.previousVersions: Recipe[]` (capped at 3). Each "Find different recipe" tap pushes onto the stack. Recipe page shows "Alternate recipe · N earlier versions" link; tapping opens a list sheet that swaps to any version. Side-by-side compare view stays V2.

### UI

- **Stats row** changes from Prep · Cook · Serves · Cal to **Prep · Cook · Protein · Cal**. Serves count remains on the Ingredients tab adjuster, which is where the user actually changes it. Protein shows "—" when the field is null (pre-M4 data).
- **Card meta** on Results gains a protein segment between time and calories. Cards with `videoUrl` get a small play-icon badge in the top-right corner.
- **CSP** — `img-src` broadened to `https:` so any source-domain image works (privacy / cookie risk is low for image hotlinks and we don't follow redirects). `frame-src` adds YouTube + Vimeo embed domains.

### Migration

- Zustand persist version bumped 2 → 3. Migration walks `lastSearch.recipes` and `activeRecipe.recipe`, converts any surviving `previousVersion` (singular) to a 1-entry `previousVersions` array, and backfills the two new SearchFilters fields. Theme + everything else preserved.

### Milestone renumber

M4 (was Cooking) → **M5**. M5 (was Instamart) → **M6**. M6 (was Polish) → **M7**. Remaining M3 phases (Preferences UI + Saved-with-modifications) are pending after M4; the rescoped Saved design (`baseRecipeId` + `modifications` block instead of a heart-bookmark) lives in spec §3.9.

## M2.6.1 — Security headers follow-up (May 2026)

Small follow-up after the M2.6 security audit. Four items: one real gap, three defence-in-depth.

- **HSTS landed.** `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` on every hosted response. Without it, a first-connect over plain `http://` on a new device or network could be MITM'd before the Firebase Hosting redirect to HTTPS lands. Two-year max-age, ready for `hstspreload.org` submission after a few weeks of stable deploys.
- **`X-Frame-Options: DENY`** added alongside the existing CSP `frame-ancestors 'none'`. Modern browsers honour the CSP directive; the legacy header covers the long tail.
- **CSP reporting wired up.** `report-uri /api/csp-report` directive added to the CSP. New `POST /api/csp-report` endpoint in the Cloud Function accepts both legacy `application/csp-report` and modern `application/reports+json` envelopes, logs them as structured `csp_violation` lines to Cloud Logging, returns `204`. App Check is skipped for the path (browser-issued reports don't carry app tokens); read-limited at 30/min/IP so a misconfigured policy can't cost-amplify. JSON middleware extended to accept both CSP MIME types.
- **Cache-key consistency.** `hashFilters` in `functions/src/cache.ts` now lowercases the payload of every `custom:` chip (e.g. `"custom:Italian"` and `"custom:italian"` share a slot) the same way `similarTo` already does. Casing variants no longer fan out into separate Anthropic calls for the same lookup.

## M2.6 — Responsive layouts + security pass (May 2026)

Two threads in one push: the PWA goes responsive on tablet/desktop (phone layout was the only one rendering before), and a security audit pass closes a handful of small backend surfaces.

### Responsive layouts

The whole app was mobile-only until now — desktop and tablet just showed the phone column centred on a sea of paper. Each screen now scales via Tailwind responsive prefixes (`md:`, `lg:`, `xl:`); no separate component trees. Breakpoints are Tailwind defaults: `md` 768 / `lg` 1024 / `xl` 1280.

- **Form** — chip grid reflows 1-up → 2-up at `md` → 3-up at `lg`. Container caps at 1100px at `md+` (was `max-w-md` ~448px). Sticky-bottom Find Recipes CTA gets `md:hidden`; the same action moves into the header at `md+` to the left of the theme toggle. ChipGroup gains a 4-row cap with Show all / Show fewer, measured via ResizeObserver so it only appears when the chip set actually overflows.
- **Results** — TopBar widens to match the grid; card list reflows 1/2/3-up at md/lg. Loader illustration scales up at `md+`. Card title scales `text-title → text-card-title` at `md+` and gets a third line, so the morph-to-Recipe-H1 stays translate-only.
- **Recipe** — restructures into a 1:3 sticky-left grid at `lg+`, cap 1280px. Left aside floats (no card chrome) with action row / identity block / stats / make-ahead / inline CTA. Right column carries the tabs (sticky, frosted) + tab content. Stats reflow 4×1 → 2×2 with full perimeter border + cross-pattern dividers at `lg+`. Mobile sticky-bottom CTA hides at `lg+` in favour of an inline CTA at the bottom of the aside. Recipe step body type scales up to `text-step` at `lg+`. Sticky elements pin at `top-0` with internal `pt-6` so the frosted bg covers the full viewport edge — no scroll-through gap above the tabs.
- **PWA** — `manifest.webmanifest` adds `display_override: ["window-controls-overlay", "standalone"]` so the installed app on desktop opens chromeless with the title-bar area available to the React shell.

### Security pass

Audit surfaced a handful of small surfaces; all addressed.

- **Prompt-injection guards on user-supplied LLM inputs.** `similarTo` is now sanitized in zod (`functions/src/validation.ts`): control chars/newlines stripped, trimmed, capped at 80 chars, with a 500-char hard reject pre-clean. Custom-chip values (`custom:<value>`) are capped at 60 chars and reject control chars. Without these, a user could close the surrounding quotes in the prompt template and inject instruction-like text — outputs land in the Firestore cache so a successful poison could affect other identical-filter queries.
- **Backend error messages no longer leak.** The unhandled-error middleware in `functions/src/index.ts` now returns a generic `internal_error` for 500s. CORS rejections still surface the rejected origin so DevTools debugging stays sane — that's the caller's own origin, not internal state.
- **Cache key normalized.** `hashFilters()` lowercases `similarTo` before hashing — `"Tomato soup"` and `"tomato soup"` now share a slot. Closes a mild cache-pollution / Anthropic-spend-amplification vector.
- **CSP + companion security headers** added to `firebase.json` (`X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` locking down camera/mic/geo/FLoC, and a `Content-Security-Policy` with `'self'` defaults plus narrow allowlists for Google Fonts, Firebase App Check, and reCAPTCHA). `script-src` carries `'unsafe-inline'` for the inline theme-init script in `index.html`; the XSS surface stays small because React escapes by default and the app has no `dangerouslySetInnerHTML`. `frame-ancestors 'none'` blocks clickjacking.
- **`dist/` Finder dupes** (`* 2.js`, `index 2.html`, etc.) deleted. `dist/` was already gitignored — these were local-only.
- **Dependency refresh** in `functions/` via `npm update`. 9 LOW-severity advisories remain — all transit through `@tootallnate/once <3.0.1` deep inside `firebase-admin`'s dep tree. `npm audit fix --force` would downgrade `firebase-admin` to v10 (worse). Upstream-blocked.

### Cleanup

- Removed `roundForDisplay()` from `scaling.ts` and `findMockRecipe()` from `mockRecipes.ts` — both exported but with zero callers. Updated the stale "M1: rows render but recovery flows aren't wired up" comment in `FeedbackSheet.tsx` (they've been wired since M2 polish).

## M2.5 — Dark mode + security hardening (May 2026)

[`ebbde95`](https://github.com/duckybaby/recipy/commit/ebbde95) — Two unrelated fronts in one push: dark mode rolled out across the whole UI, and Patch 3 (security/a11y/cost-ceiling) landed in the backend + workflow.

### Dark mode — "Warm Charcoal" palette

`@theme` tokens stay light; a `[data-theme="dark"]` override block flips ~25 vars (paper, ink, accent, shadows, toasts). Tailwind utilities re-resolve through CSS custom-property cascade, so no `dark:` prefix lives anywhere in components.

The dark accent runs **15% darker** than the brand red (`#d63f2a → #b63624`). Lifting it (we tried `#ff5c44`) read as "neon Instagram button" against the dim page and broke white-text contrast. Darker actually improved CTA contrast (5.3:1 vs 4.6:1) while feeling grounded.

New tokens introduced to handle the dark-mode shift cleanly:

- `--color-on-accent` — warm off-white text on CTA fills (`#fbf5eb`, same in both modes — pure white reads "tech demo" against tomato).
- `--color-accent-strong` — lifted red for text/border on `accent-soft` surfaces (chip-selected, pill-info). Same as accent in light, lifted in dark so the chip label stays legible against the subtle tomato wash.
- `--color-accent-soft` (dark) — switched from a solid `#4f2218` to translucent `rgba(182, 54, 36, 0.10)` so the selected chip reads as a hint, not a block. Border + text carry the "selected" signal.
- `--color-toast-success-bg/text` + `--color-toast-info-bg/text` — eliminates the hardcoded `rgba(45, 106, 79, 0.55)` and `rgba(28, 28, 28, 0.75)` that lived in Results and Recipe.
- `--color-accent-flash`, `--shadow-fab-neutral` — for the timer pulse and the Instamart-mode FAB drop shadow.

`ThemeToggle` component in the Form header. Tri-state cycle: **Light → Dark → Auto**. Auto follows `prefers-color-scheme` AND listens for OS-level changes mid-session via `matchMedia.change`. Persisted in the Zustand store, version bumped 1 → 2 with a migration that wipes only `theme` (keeps filters / lastSearch / activeRecipe) — so any explicit preference set during testing resets to Auto on next load.

Inline `<script>` in `<head>` of `index.html` reads `localStorage.recipy-store` synchronously, resolves the theme, and sets `data-theme` on `<html>` before React mounts. No white flash on dark loads. Also updates the iOS Safari `theme-color` meta tag dynamically.

### Patch 3 — Firestore rules + viewport zoom + rate limiting

- **`firestore.rules`** added at repo root. Client-side access fully closed (`allow read, write: if false`). The Cloud Function uses firebase-admin which bypasses these rules. No browser code reads Firestore directly, so closed is correct. `firebase.json` gained a `firestore` block with `"database": "recipy-cache"` so deploys target the named DB. CI workflow `--only` extended to `hosting,functions,firestore`. Service account needs Cloud Datastore Owner + Firebase Rules Admin on the GCP project — both granted.
- **Viewport meta** in `index.html` dropped `maximum-scale=1.0, user-scalable=no` (WCAG 2.1.4.4 — Resize text). The custom-chip input in `ChipGroup.tsx` bumped from `text-strong` (15px) to `text-body` (16px) so iOS Safari doesn't auto-zoom on focus.
- **`express-rate-limit@^8.0.0`** added to `functions/`. `writeLimiter` (10/min) on all five POST routes, `readLimiter` (30/min) on `/api/health`. Per-route by design — a search shouldn't compete with a feedback submit. Required `app.set("trust proxy", 1)` so `req.ip` reflects the real client (Cloud Run sits behind Google's LB). Request logger now includes `ip=` so trust-proxy is verifiable from Cloud Run logs. In-memory store means the effective ceiling is N×limit across warm instances (N ≤ `maxInstances: 10`) — fine at household scale.

### Dependency refresh

| Package | Old | New |
|---|---|---|
| `firebase-functions` | ^6.0.0 | ^7.2.5 |
| `@anthropic-ai/sdk` | ^0.40.0 | ^0.96.0 |
| `express-rate-limit` | ^7.4.0 (just added) | ^8.5.2 |
| `actions/checkout` (CI) | v4 | v5 |
| `actions/setup-node` (CI) | v4 | v5 |

The v4 actions deprecation warning from the last CI run is gone. TypeScript (5→6), zod (3→4), and express (4→5) intentionally deferred — they have wider semantic changes and need a considered separate update.

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
