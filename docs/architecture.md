# Architecture

The technical map of recipy. For product intent and screen-by-screen behaviour, see [`spec.md`](./spec.md). For endpoint contracts, see [`api.md`](./api.md).

## Stack at a glance

| Layer | Tech | Version |
|---|---|---|
| UI | React + Vite + TypeScript | React 19.2, Vite 8.0, TS ~5.6 |
| Styling | Tailwind CSS v4 with `@theme` tokens + `[data-theme="dark"]` override | 4.3 |
| Routing | `react-router-dom` | v7.15 |
| State | Zustand store + thin localStorage adapter | zustand 5.0 |
| Animation | Framer Motion | 12.38 |
| Icons | `lucide-react` + `@hugeicons/react` for equipment | 1.16 / 1.1 |
| Hosting | Firebase Hosting | recipy-63422 |
| Backend | Firebase Cloud Functions (Express, Node 20, 2nd gen) | in `asia-south1` |
| API | `@anthropic-ai/sdk` (Sonnet 4.6 + `web_search_20250305`) | 0.96 |
| Cache | Two-layer — in-memory Map + Firestore (`recipy-cache` named DB) | TTL 7d |
| Validation | `zod` | 3.x |
| Rate limit | `express-rate-limit` per-IP, per-route | v8 |
| Secrets | Firebase Secret Manager | `ANTHROPIC_API_KEY` |
| Attestation | Firebase App Check (reCAPTCHA v3) | required on every API route |
| Firestore rules | Client-side fully closed (admin-SDK bypasses) | see `firestore.rules` |
| Server runtime | `firebase-functions` v2 onRequest | v7 |
| CI | GitHub Actions — auto-deploy on push to `main` | hosting + functions + firestore in one run |

## Routes

Four React Router routes. Wrapped in `<AnimatePresence mode="wait">` so each navigation completes its exit before the next mounts.

| Path | Component | Notes |
|---|---|---|
| `/` | `routes/Form` | Filter chips. Filters live in the store, not the URL. |
| `/results` | `routes/Results` | Streamed search results. No query params — intent travels via `location.state.intent`. |
| `/recipe/:id` | `routes/Recipe` | Tabbed detail view. `:id` is the only param in v1. |
| `/cook/:id` | `routes/Cooking` | M0 placeholder. M3 ships the real screen. |

Recipe's back arrow uses `navigate(-1)` so Results restores scroll naturally. Fallback to `navigate("/results")` when `location.key === "default"` catches the deep-link case where there's no prior entry.

## State

Two parallel concerns, kept separate on purpose:

### `src/lib/store.ts` — runtime state (Zustand)

```ts
{
  filters:       SearchFilters         // what Form chips reflect
  lastSearch:    {                     // most recent search result
    filters,
    recipes: Recipe[],
    fetchedAt: ISO string
  } | null
  activeRecipe:  { recipe, source, openedAt } | null
}
```

Persisted via Zustand's `persist` middleware to `localStorage` key `recipy-store`. Three things live here because each one *outlasts a single component mount* but stays out of the URL:

- `filters` survive back-from-Results so chips stay selected.
- `lastSearch` is what Results renders on POP back from Recipe — no re-fetch.
- `activeRecipe` is what Recipe restores on refresh.

Helper functions in the same file:

- `getFreshLastSearch()` — returns `lastSearch` only if within 24h, lazily clears stale entries.
- `findRecipeInStore(id)` — walks `activeRecipe`, `lastSearch.recipes`, and every `previousVersion` chain. Used by Recipe to resolve deep links and back-nav targets.
- `filtersEqual(a, b)` — field-by-field comparison. Avoids `JSON.stringify` because key-order drift has bitten us before.

### `src/lib/storage.ts` — non-runtime state (raw localStorage)

These persist across reloads but don't drive renders frequently enough to warrant a store subscription. Each goes through a try/catch wrapper that degrades to an in-memory Map when localStorage is unavailable (iOS Safari private mode).

| Key | Owner | Shape | Notes |
|---|---|---|---|
| `recipe-app:cooking-state` | Cooking | `CookingState` | M3. Expires after 7 days. |
| `recipe-app:recent-recipes` | Recipe page | `Recipe[]` | Capped at 10, most recent first. |
| `recipe-app:notifications-prompt` | Cooking | `NotificationsPrompt` | One-time prompt suppression. |
| `recipe-app:dismissed-makeahead` | Recipe page | `string[]` | Recipe IDs the user dismissed. |
| `recipe-app:custom-chips` | Form | `Record<groupId, string[]>` | User-added chip options. |
| `recipe-app:schema-version` | this module | `"5"` (current) | Bump → wipes all `recipe-app:*` keys + the `recipy-store` key on next load. |

The version bump exists because we've changed stored shapes a few times during M1 and M2 and the cheapest "migration" is "wipe and let the app re-populate."

### Why not all in Zustand?

Two reasons: (1) Cooking state, recents, and custom chips are read once on mount by the screen that owns them, so a global subscription is wasteful. (2) Keeping the persist middleware tight (just `filters`, `lastSearch`, `activeRecipe`) means the rehydration payload stays small and the surface area for migration bugs stays small.

## Theming

Two themes ship in v1: the original light "Modern Cookbook" palette and a dark "Warm Charcoal" variant.

The mechanism uses **CSS custom-property cascade only — no `dark:` prefix anywhere in components.** `@theme` defines all tokens (paper, ink, accent, shadows, etc.) at their light values. A `[data-theme="dark"]` selector block in `src/styles/index.css` overrides those same vars with dark values. Tailwind's generated utilities (`bg-paper`, `text-ink`, …) read the vars at use site, so they re-resolve automatically when the attribute flips.

User preference flow:

1. **Persisted** in the Zustand store at `state.theme` — `"light" | "dark" | null`. `null` means "follow the OS" via `prefers-color-scheme`.
2. **First paint** — an inline `<script>` in `<head>` of `index.html` synchronously reads `localStorage.recipy-store`, resolves the preference, and sets `data-theme` on `<html>` before React mounts. This prevents a white-flash on dark loads. The script mirrors `resolveTheme()` in `store.ts` — keep both in sync if either changes.
3. **Runtime updates** — `src/main.tsx` subscribes to store changes and calls `applyTheme(resolveTheme(state.theme))` on every flip. It also listens to `matchMedia("(prefers-color-scheme: dark)").change` so a user in Auto mode tracks the OS as they toggle Light/Dark in their system settings.
4. **`<meta name="theme-color">`** is updated on both first paint and every flip so the iOS Safari chrome tint matches the surface.

The dark accent (`--color-accent: #b63624`) is 15% darker than the light brand red (`#d63f2a`). Lifted accents (we tried `#ff5c44`) read as "neon" against dim paper and broke white-text contrast; darker actually *improved* it. Three tokens introduced specifically for dark mode situations:

- `--color-on-accent` — text on accent fills. Warm off-white (`#fbf5eb`) in both modes.
- `--color-accent-strong` — lifted red for text/border on `accent-soft` surfaces (chip-selected, pill-info). Same as accent in light, lifted in dark.
- `--color-accent-soft` — translucent in dark mode (`rgba(182, 54, 36, 0.10)`) so selected chips read as a hint, not a block.

`ThemeToggle` in the Form header cycles Light → Dark → Auto. The store version was bumped 1 → 2 with a migration that wipes `theme` (preserving filters / lastSearch / activeRecipe) so any explicit preference resets to Auto on next load.

## Loader policy

What surface Results shows is driven by **intent**, not cache presence. Three intents:

| Intent | Source | Surface | Fetch? |
|---|---|---|---|
| `"fresh"` | Form's Find Recipes button; Recipe's More Like This | Full-bleed loader, no top bar | Yes, unless `lastSearch` matches the current filters AND is within the 24h TTL |
| `"regenerate"` | Results' regenerate icon | Overlay loader on top of existing cards | Always — explicit "give me something else" |
| _(none)_ | POP back from Recipe; deep link; refresh | Render `lastSearch.recipes`. If empty → empty state. | No |

Intent is read from `location.state.intent` on mount. We consume it via `navigate(location.pathname, { replace: true, state: null })` so refresh and back-nav don't re-fire the search (browsers preserve history state across both).

A single module-scoped `AbortController` tracks the in-flight fetch. New search → abort previous. Module scope rather than ref scope so cross-mount aborts work and so Strict Mode's dev-only double-invoke can't kill the fetch via cleanup.

A `MIN_LOADER_MS` of 600 ms keeps the loader on screen long enough to register, even on cache-hit responses that would otherwise flicker off.

## Animation choreography

Routes are wrapped in a `motion.div` keyed by `pathname`. `AnimatePresence` in `mode="wait"` so the exiting route finishes before the next mounts.

Today only one explicit exit animation: Recipe slides off to the right when popping back to Results (the iOS-style hierarchical-nav cue). The `exit` variant reads a custom prop `{ navType, isRecipe }` so the slide fires only on POP from a `/recipe/*` path. Everything else exits with `x: 0` (no visible movement) but still respects `mode="wait"`'s 280 ms tick.

Forward entries use `PageTransition` (`src/components/PageTransition.tsx`) — a CSS-only slide-up class. CSS over Framer here so the transform reverts to identity after the animation, leaving `position: fixed` descendants intact on Safari.

Card → header title morph uses Framer's `layoutId` (`recipe-title-${id}`). Disabled on POP so the reverse morph doesn't fight the slide-off-right exit animation.

## Backend

`functions/src/index.ts` is an Express app exported as a 2nd-gen Cloud Function in `asia-south1`. Middleware chain (in order):

1. `app.set("trust proxy", 1)` — read client IP from `X-Forwarded-For` (Cloud Run sits behind Google's LB).
2. CORS — explicit allowlist (see [`api.md`](./api.md)).
3. `express.json({ limit: "1mb" })`.
4. Request logger — `method path ip=<client-ip>`.
5. `verifyAppCheck` — rejects anything without a valid App Check token. Self-skips `OPTIONS` and `/api/health`.
6. **Per-route rate limiter** — `writeLimiter` (10/min) on every POST, `readLimiter` (30/min) on `/api/health`. See [§Rate limiting](#rate-limiting).

Each route is wrapped in `asyncHandler` so thrown errors land in the error middleware, which converts them to the canonical `{ error: { code, message } }` envelope.

### Anthropic wrapper

`functions/src/anthropic.ts` centralises three things:

- A lazy SDK client (`getClient(apiKey)`) that recycles across cold starts when the secret value doesn't change.
- `callWithWebSearch` — non-streaming. Used by `/api/find-alternate-source`.
- `streamWithWebSearch` — async generator yielding text deltas. Used by `/api/search-recipes`. Pairs with `JsonArrayStream` (`functions/src/streamingJson.ts`) which finds balanced JSON objects in the text and emits them as soon as their closing brace lands.
- `callPlain` — no tools, for recompute + substitutions.
- `extractFinalText`, `parseJsonLoose` — text extraction + tolerant JSON parsing (strips code fences, finds the first balanced `[...]` or `{...}`).

### Cache

`functions/src/cache.ts` keys results by a hash of the filter object. **Two-layer:**

1. **In-memory Map** inside the function instance — capped at 50 entries, insertion-order eviction. Hit returns in single-digit ms.
2. **Firestore** in the `recipy-cache` named database, collection `search-cache`. Survives cold starts and spreads across instances.

Reads check memory first, fall through to Firestore on miss, and backfill memory on a Firestore hit. Writes update memory synchronously and Firestore via `await writeCache(...)` after `res.end()` — so the client sees the response close immediately while Cloud Run keeps the instance alive long enough to finish the persistent write. TTL is 7 days (an actual TTL field, checked on read). Regenerate paths set `skipCache: true` to bypass the read; the value never enters the filter hash so cache lookups aren't polluted.

### Rate limiting

`express-rate-limit` v8 with per-IP, per-route limiters wired into the Express chain after App Check but before each route handler. Two limiter instances:

- `writeLimiter` — 10 requests / minute on every POST endpoint (`/api/search-recipes`, `/api/find-alternate-source`, `/api/recompute-field`, `/api/get-substitutions`, `/api/feedback`).
- `readLimiter` — 30 requests / minute on `/api/health`.

Per-route means a search and a feedback submit have separate buckets — they don't compete. A single client's effective ceiling is 10×5 + 30 = 80 req/min, well below anything a real user would do but tight enough to cap cost if a retry loop ever fires.

**`app.set("trust proxy", 1)`** is required for the limiter to work behind Cloud Run's load balancer. Without it, `req.ip` is the LB's address and every request looks like the same client. The request logger now prints `ip=...` so trust-proxy is verifiable from Cloud Run logs.

The limiter's default store is in-memory, so the effective ceiling across N warm Cloud Run instances is N × limit (N ≤ `maxInstances: 10`). Acceptable at one-household scale; if strict ceilings ever matter we'd swap in a Firestore-backed store.

### Firestore rules

`firestore.rules` (at repo root) is fully closed:

```
allow read, write: if false;
```

Both collections (`search-cache`, `feedback`) live inside the `recipy-cache` named database. The Cloud Function uses firebase-admin which bypasses these rules. No client code opens a direct Firestore connection. If that ever changes (realtime listeners for a multi-user feature), this is where gates open.

The rules deploy via the same GitHub Actions workflow as hosting + functions, courtesy of the `firestore` block in `firebase.json` and the `--only hosting,functions,firestore` flag on the `firebase deploy` command. Service account requires Cloud Datastore Owner + Firebase Rules Admin in addition to the existing hosting/functions roles.

### Validation

`functions/src/validation.ts` is the zod source of truth for `Recipe`, `Ingredient`, `Step`, `SearchFilters`, and the request bodies for each endpoint. Every incoming filter set and every outgoing recipe is validated against it. Recipes that fail validation are dropped silently — better to return fewer than to ship a malformed one.

Two of the fields are free-form user text that eventually lands inside an LLM prompt template, so zod also sanitizes them at the entry boundary:

- `similarTo` (search bias) — strips control chars / newlines, trims, caps at 80 chars; 500-char hard reject pre-clean. Without this, a user could close the surrounding `"..."` quotes in the prompt template and inject instruction-like text. Sanitization happens via `.transform().pipe()` so the parsed type is the cleaned value.
- `custom:<value>` chip values — capped at 60 chars, control chars rejected. Same threat model, smaller surface (each custom chip is one short label).

Successfully poisoned recipes would land in the Firestore cache and affect other identical-filter queries, so this matters more than the immediate spend impact.

### Security headers

`firebase.json` ships four response headers on every hosted asset:

| Header | Value | Why |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | Stops browsers MIME-sniffing a CSS/JSON response into an executable script. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Don't leak the full URL (which may carry a recipe id) to third parties. |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), interest-cohort=()` | App doesn't use these; lock them off so a future XSS can't either. `interest-cohort=()` also opts out of FLoC. |
| `Content-Security-Policy` | see below | Defence-in-depth against script injection, framing, exfil. |

The CSP:

```
default-src 'self';
script-src 'self' 'unsafe-inline' https://www.gstatic.com https://www.google.com;
style-src  'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src   'self' https://fonts.gstatic.com;
img-src    'self' data: https://www.gstatic.com;
connect-src 'self' https://*.googleapis.com https://www.google.com;
frame-src  https://www.google.com;
object-src 'none';
base-uri   'self';
form-action 'self';
frame-ancestors 'none';
```

`'unsafe-inline'` is on `script-src` because of the inline theme-init script in `<head>` of `index.html` (synchronous read of `localStorage` before React mounts, to avoid a white-flash on dark loads). Migrating to a script-hash would mean recomputing the hash on every edit; not worth the maintenance overhead for an app with no `dangerouslySetInnerHTML` and no third-party HTML rendering. `'unsafe-inline'` on `style-src` covers React's inline `style="..."` attrs and Framer Motion's transform writes.

`connect-src` is wildcarded to `https://*.googleapis.com` because the Firebase Web SDK calls *several* `*.googleapis.com` endpoints on init — Installations (`firebaseinstallations.googleapis.com`) is required before App Check (`firebaseappcheck.googleapis.com`) can mint a token, and Remote Config / Firestore would add more. Listing each one explicitly is brittle (each Firebase SDK addition risks a fresh prod break); the wildcard still blocks non-Google origins.

`img-src` allows `www.gstatic.com` for the reCAPTCHA badge.

CSP violations are visible in the browser console — if a future addition needs a new origin, you'll see the block before users do.

## Deployment

GitHub Actions (`.github/workflows/firebase-hosting-merge.yml`) deploys hosting, functions, AND Firestore rules on every push to `main`:

```bash
firebase deploy --only hosting,functions,firestore --project recipy-63422 --non-interactive --force
```

`--force` auto-applies the Artifact Registry cleanup policy (1-day retention of old container images) so the deploy doesn't error on that non-fatal warning. The same workflow runs `npm ci && npm run build` for the frontend, then `npm ci && npm run build` inside `functions/`.

PR previews are wired through `firebase-hosting-pull-request.yml` — every PR gets a unique Hosting preview URL.

App Check secrets and Firebase project config live in the Firebase Console:

- reCAPTCHA v3 site key is in `src/lib/firebase.ts` (public-safe; the secret is in Firebase).
- Debug tokens for local dev get pasted into Firebase Console → App Check → Manage debug tokens.

## Performance budgets

| Target | Current |
|---|---|
| Initial bundle (gzipped) | ~150 KB |
| Time-to-first-recipe-card (cold) | 8 s (network + model) |
| Time-to-first-recipe-card (cache hit) | < 100 ms server-side, 600 ms client-held |
| Sonnet 4.6 search call | ~$0.50 per query (web_search + ~7k output tokens) |

The streaming protocol matters because the first recipe lands within ~3 s while the second and third trickle in over the next 5 s. Without streaming, the user would stare at a loader for 8 s; with it, cards arrive one at a time.

## File / repo layout

```
recipy/
├── README.md
├── CHANGELOG.md
├── package.json
├── firebase.json             # hosting + functions + firestore config
├── firestore.rules           # fully-closed client rules (admin-SDK bypasses)
├── firestore.indexes.json    # placeholder (no composite indexes in v1)
├── vite.config.ts
├── .github/workflows/        # auto-deploy on push, preview on PR
├── docs/
│   ├── spec.md              # product spec
│   ├── architecture.md      # this file
│   └── api.md               # endpoint contracts
├── public/                  # manifest, icons, robots.txt
├── src/
│   ├── main.tsx             # React root + StrictMode + BrowserRouter
│   ├── App.tsx              # AnimatedRoutes + ResumeBanner + ScrollToTop
│   ├── styles/index.css     # Tailwind v4 @theme tokens
│   ├── routes/
│   │   ├── Form.tsx
│   │   ├── Results.tsx
│   │   ├── Recipe.tsx       # large — tabs, sticky CTA, kebab, feedback sheet
│   │   └── Cooking.tsx      # M0 stub
│   ├── components/
│   │   ├── ChipGroup.tsx
│   │   ├── RecipeCard.tsx
│   │   ├── IngredientRow.tsx
│   │   ├── ServingsAdjuster.tsx
│   │   ├── FeedbackSheet.tsx
│   │   ├── ActionSheet.tsx
│   │   ├── Loader.tsx       # cooking-themed full-bleed loader
│   │   ├── ThemeToggle.tsx  # tri-state Light / Dark / Auto cycle
│   │   ├── PageTransition.tsx
│   │   ├── ResumeBanner.tsx # M3 stub
│   │   └── ScrollToTop.tsx
│   ├── hooks/
│   │   ├── useScrollSpy.ts
│   │   └── useUserContext.tsx
│   └── lib/
│       ├── store.ts         # Zustand store (filters, lastSearch, activeRecipe)
│       ├── storage.ts       # localStorage adapter for the rest
│       ├── filters.ts       # summarizeFilters, toApiBody
│       ├── api.ts           # frontend HTTP client (App Check, NDJSON parser)
│       ├── firebase.ts      # Firebase init + App Check + token fetch
│       ├── mockApi.ts       # mock responses behind VITE_USE_MOCKS=true
│       ├── mockRecipes.ts   # one fully-realised recipe for UI work
│       ├── scaling.ts       # quantity scaling + unit rounding
│       ├── substitutions.ts # applies substitutes to step text via word-boundary regex
│       ├── equipmentIcons.tsx
│       └── types.ts         # mirror of the backend zod shape
└── functions/
    ├── package.json
    └── src/
        ├── index.ts         # Express app + handlers
        ├── anthropic.ts     # SDK wrappers (search, plain, stream)
        ├── prompts.ts       # system + per-endpoint user prompts
        ├── validation.ts    # zod schemas
        ├── cache.ts         # in-memory filter-keyed cache
        ├── streamingJson.ts # JsonArrayStream: balanced-brace stream parser
        └── appCheck.ts      # verifyAppCheck middleware
```

## Conventions

- File-level comments at the top of every TS/TSX file. State the file's role and any non-obvious rules. The reader should know why a file exists without scrolling.
- No banned vocabulary in code comments (no "leverage," "robust," "seamless"). Specifics over abstractions.
- Imports grouped: React → libraries → relative.
- Never edit settings.json or run `firebase deploy` manually — GitHub Actions owns deploy.
- Prefer named exports.
- One milestone per commit. Title format: `area: short summary` (e.g. `state:`, `functions:`, `M2 polish:`). Body explains the why.
