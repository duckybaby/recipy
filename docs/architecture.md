# Architecture

The technical map of recipy. For product intent and screen-by-screen behaviour, see [`spec.md`](./spec.md). For endpoint contracts, see [`api.md`](./api.md).

## Stack at a glance

| Layer | Tech | Version |
|---|---|---|
| UI | React + Vite + TypeScript | React 19.2, Vite 8.0, TS ~6.0 |
| Styling | Tailwind CSS v4 with `@theme` tokens | 4.3 |
| Routing | `react-router-dom` | v7.15 |
| State | Zustand store + thin localStorage adapter | zustand 5.0 |
| Animation | Framer Motion | 12.38 |
| Icons | `lucide-react` + `@hugeicons/react` for equipment | 1.16 / 1.1 |
| Hosting | Firebase Hosting | recipy-63422 |
| Backend | Firebase Cloud Functions (Express, Node 20, 2nd gen) | in `asia-south1` |
| API | `@anthropic-ai/sdk` (Sonnet 4.6 + `web_search_20250305`) | 0.40 |
| Validation | `zod` | 3.23 |
| Secrets | Firebase Secret Manager | `ANTHROPIC_API_KEY` |
| Attestation | Firebase App Check (reCAPTCHA v3) | required on every API route |
| CI | GitHub Actions — auto-deploy on push to `main` | hosting + functions in one run |

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

`functions/src/index.ts` is an Express app exported as a 2nd-gen Cloud Function in `asia-south1`. Middleware chain:

1. CORS — explicit allowlist (see [`api.md`](./api.md)).
2. `express.json({ limit: "1mb" })`.
3. Request logger (path + method).
4. `verifyAppCheck` — rejects anything without a valid App Check token. Self-skips `OPTIONS` and `/api/health`.

Each route is wrapped in `asyncHandler` so thrown errors land in the error middleware, which converts them to the canonical `{ error: { code, message } }` envelope.

### Anthropic wrapper

`functions/src/anthropic.ts` centralises three things:

- A lazy SDK client (`getClient(apiKey)`) that recycles across cold starts when the secret value doesn't change.
- `callWithWebSearch` — non-streaming. Used by `/api/find-alternate-source`.
- `streamWithWebSearch` — async generator yielding text deltas. Used by `/api/search-recipes`. Pairs with `JsonArrayStream` (`functions/src/streamingJson.ts`) which finds balanced JSON objects in the text and emits them as soon as their closing brace lands.
- `callPlain` — no tools, for recompute + substitutions.
- `extractFinalText`, `parseJsonLoose` — text extraction + tolerant JSON parsing (strips code fences, finds the first balanced `[...]` or `{...}`).

### Cache

`functions/src/cache.ts` keys results by a hash of the filter object. v1 uses an in-memory Map inside the function instance. Across cold starts this is empty, so identical queries within ~15 minutes of warmth get the cache; older queries refetch. Persistent (Firestore-backed) cache is on the M5 deferred list.

### Validation

`functions/src/validation.ts` is the zod source of truth for `Recipe`, `Ingredient`, `Step`, `SearchFilters`, and the request bodies for each endpoint. Every incoming filter set and every outgoing recipe is validated against it. Recipes that fail validation are dropped silently — better to return fewer than to ship a malformed one.

## Deployment

GitHub Actions (`.github/workflows/firebase-hosting-merge.yml`) deploys both hosting and functions on every push to `main`:

```bash
firebase deploy --only hosting,functions --project recipy-63422 --non-interactive --force
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
├── firebase.json
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
