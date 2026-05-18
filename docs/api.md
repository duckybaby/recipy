# API contract

The Cloud Function lives at `https://recipy-63422.web.app/api/*` (Hosting rewrite → Cloud Run function `api` in `asia-south1`). Local dev hits the same URL via the Vite proxy in `vite.config.ts`.

All endpoints are `POST`, accept JSON, and require an `X-Firebase-AppCheck` header carrying a valid App Check token. Requests without a token are rejected with `401`; failing tokens with `403`. CORS allowlist:

- `https://recipy-63422.web.app`
- `https://recipy-63422.firebaseapp.com`
- `https://recipy.shankar.design`
- `http://localhost:5173`
- `http://127.0.0.1:5173`

Any other origin returns `403 Origin not allowed`. Same-origin server-to-server calls (no `Origin` header) pass.

All error responses share one envelope:

```json
{ "error": { "code": "snake_case_code", "message": "human-readable explanation" } }
```

Validation errors (Zod) surface their actual message so the client can show useful debug info. Unhandled 500s return a generic `{ "code": "internal", "message": "Internal error" }` envelope — real failure context lands in Cloud Logging via `console.error`, not in the client response. CORS rejections still echo the rejected origin (`cors_blocked`) so DevTools debugging stays sane.

## Rate limits

Per-IP, per-route, in-memory store on the Cloud Function. Headers follow the IETF [draft-7 rate-limit spec](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/) — clients can read `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset`.

| Endpoint family | Limit | Window |
|---|---|---|
| `POST /api/*` (all five) | 10 / IP | 60 s |
| `GET  /api/health` | 30 / IP | 60 s |

Per-route means each POST has its own bucket — a search and a feedback submit don't compete. Single-IP effective ceiling is 80 req/min. Exceeding returns:

```json
{ "error": { "code": "rate_limited", "message": "Too many requests. Try again in a minute." } }
```

with status `429`.

In-memory store + `maxInstances: 10` on the function means the effective ceiling is up to 10× the configured limit when traffic spreads across warm instances. Acceptable at one-household scale.

---

## POST /api/search-recipes

**Streams NDJSON.** Each line is a JSON object, newline-delimited. The frontend's `searchRecipesStream` in `src/lib/api.ts` parses line-by-line so cards can render as they arrive.

### Request body

```ts
{
  meal: Meal[],                         // 0..5 values
  cuisines: Cuisine[],                  // 0..N values, supports custom: prefix (≤60 chars, no control chars)
  diet: Diet[],                         // 0..5 values
  prepMax: 5 | 15 | 30 | null,          // "any" coerced to null client-side
  cookMax: 15 | 30 | 60 | null,
  vibes: Vibe[],
  mainIngredients: MainIngredient[],
  surprise?: boolean,                   // when true, ignores the chip filters and asks for a spread across cuisines
  similarTo?: string                    // dish title; biases the search but doesn't return the same dish
                                        // sanitized: control chars/newlines stripped, trimmed, capped 80 chars
                                        //            (500-char hard reject pre-clean)
}
```

See `src/lib/types.ts` for the enum values.

Both `similarTo` and any `custom:<value>` chip ultimately get interpolated into the LLM user prompt, so the backend sanitizes them in zod at the entry boundary — stripping control chars and capping length so a user can't break out of the surrounding quotes to inject instruction-like text. `similarTo` is also lowercased before the cache hash so `"Tomato soup"` and `"tomato soup"` share a cache slot.

### Response stream

`Content-Type: application/x-ndjson; charset=utf-8`. Three line shapes:

```jsonc
// One per recipe, emitted as the model finishes producing it.
{"type":"recipe","recipe": <Recipe>}

// Final line. `cached: true` means we hit the Firestore cache, no Anthropic call was made.
{"type":"done","count": 3, "cached": false}

// Optional non-fatal stream error. Followed by a `done` with whatever count made it through.
{"type":"error","message": "..."}
```

A cache hit and a fresh fetch use the same protocol, so the client has one code path.

### Caveats

- Web search is capped at 3 uses per call (Tier-1 rate limits).
- `max_tokens` is 16384 — enough headroom for 3 full recipes.
- The model is instructed to emit compact JSON (no pretty-printing) so the stream parser sees closing braces sooner.

---

## POST /api/find-alternate-source

Fetches one alternate recipe for the same dish from a different source.

### Request body

```ts
{
  dish: string,           // recipe title
  excludeUrls: string[]   // source URLs already shown — won't return any of these
}
```

### Response

```ts
{ recipe: Recipe }
```

### Errors

- `404 no_alternate` — search returned nothing usable.

---

## POST /api/recompute-field

Asks Claude to re-estimate a single numeric field for a recipe. Used by the "Calorie count is off" / "Time is way off" feedback flows.

### Request body

```ts
{
  recipe: Recipe,
  field: "calories" | "time"
}
```

### Response

```ts
{ value: number }      // integer kcal/serving or integer minutes
```

### Errors

- `502 bad_model_output` — the model returned non-numeric JSON.

---

## POST /api/get-substitutions

For every ingredient in the list, asks Claude for 1–2 common substitutes with quantity equivalents. Used by the Recipe page's inline substitutions accordion.

### Request body

```ts
{
  ingredients: Ingredient[]   // full Ingredient shape, including quantity + unit
}
```

### Response

```ts
{
  substitutions: {
    [ingredientName: string]: string[]  // 1–2 substitute strings per ingredient
  }
}
```

Example response value: `{ "tamarind paste": ["2 tsp lemon juice per 1 tsp tamarind paste", "1 tbsp amchur"] }`.

---

## POST /api/check-instamart

Heuristic-only in v1 (Path B per spec §10). Classifies each ingredient as `pantry-staple`, `likely-available`, or `specialty`. The classification is already on the Recipe shape (see `Ingredient.instamart.classification`), so this endpoint exists mostly as a future hook.

### Request body

```ts
{ ingredients: string[] }
```

### Response

```ts
{
  availability: {
    [ingredientName: string]: {
      available: boolean,
      productId?: string,    // null in v1 heuristic mode
      price?: number          // null in v1 heuristic mode
    }
  }
}
```

---

## POST /api/add-to-instamart

Returns a deep-link URL that opens Instamart with the items pre-queued at the Royal Legend address. **Does not auto-checkout** — the user reviews and pays on Instamart.

### Request body

```ts
{ ingredients: string[] }
```

### Response

```ts
{ cartUrl: string, addedCount: number }
```

---

## POST /api/feedback

Fire-and-forget logging of the "Something looks wrong?" sheet selections. Used to seed the M5 source quality signal.

### Request body

```ts
{
  recipeId: string,
  reason: "steps-dont-match" | "ingredients-wrong" | "calories-off" | "time-off" | "not-what-i-want"
}
```

### Response

```ts
{ ok: true }
```

The accompanying recovery (refetch, recompute, etc.) is the client's responsibility — this endpoint only records the event.

---

## POST /api/csp-report

Infra endpoint — not called by app code. The browser POSTs here automatically when a Content-Security-Policy directive is violated (configured via `report-uri /api/csp-report` in the CSP header in `firebase.json`).

### Request body

Either of:

```jsonc
// Legacy `application/csp-report`
{ "csp-report": { "violated-directive": "...", "blocked-uri": "...", ... } }

// Modern `application/reports+json`
[ { "type": "csp-violation", "body": { ... } } ]
```

Both content-types are accepted by the JSON middleware.

### Response

`204 No Content`. Browsers ignore the body either way.

### Notes

- **App Check skipped** — browser-issued reports don't carry app tokens.
- **Read-limited** (30/min/IP) so a misconfigured policy on a single page-load can't cost-amplify on us.
- Reports surface in Cloud Logging as structured `csp_violation` log lines — search Cloud Logging for `type="csp_violation"` to triage real breakages.

---

## Models and limits

- Search + alternate-source: Claude Sonnet 4.6 with `web_search_20250305`.
- Recompute + substitutions: Claude Sonnet 4.6, no tools.
- Why Sonnet for both: Haiku hallucinated source URLs at ~30% in early testing — unacceptable when tapping the source link is a core feature. Cost difference at household scale is ~$2/month.

Anthropic tier-1 quota covers ~80 search calls/day. Combined with the per-IP rate limit above and the 7-day Firestore cache, we're nowhere close to that with one household — most repeat queries hit cache in single-digit ms and never reach Anthropic at all.
