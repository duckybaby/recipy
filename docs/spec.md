# Recipe App — V1 Spec

A web app that helps one person (the owner's wife) decide what to cook tonight, pulls a real recipe from the web, and walks her through cooking it. Optimised top to bottom for ease of use; she never opens a keyboard.

The owner is in Bengaluru. Delivery integrations use the Swiggy Instamart address "Royal Legend."

---

## 1. Prime directives

These rules win over any other instinct the implementing engineer might have.

1. **The keyboard never opens.** No free-text inputs anywhere in v1. All choices are taps on chips, buttons, or steppers.
2. **Mobile-first.** Design the phone view first, scale up to tablet/desktop only by widening margins. The owner's wife will use it on her phone in the kitchen.
3. **One screen, one job.** The form picks filters. Results pick a recipe. The detail page commits. Cooking mode cooks. Never blend them.
4. **Round numbers always.** Anything displayed (servings, calories, times, prices) is rounded for human reading. No `0.30000000000000004` artifacts.
5. **No accounts, but local persistence is mandatory.** V1 has no login, no user accounts, no cross-device sync. But the app MUST survive tab kills, browser closes, refreshes, and OS-level memory pressure on its own device. State that matters (current recipe, cooking progress, recent recipes) is persisted to `localStorage`. See §7.9 for the persistence model. The v2 layer adds cross-device sync via Firestore + accounts; v1 is single-device only.
6. **The recipe is found, not invented.** Every recipe in v1 originates from a real recipe website, fetched by Claude via web search, and links back with attribution.
7. **Cooking mode is offline-capable.** Once she enters cooking mode, the entire recipe is in `localStorage`. She can lose internet, swap to YouTube, take a call, even reboot the phone — the steps and timer still work when she returns.

---

## 2. User flow

```
                  ┌─ Resume banner (if in-progress recipe exists) ──┐
                  ↓                                                  │
[Form]  →  [Results list]  →  [Recipe detail]  →  [Cooking mode] ───┘
                                      ↓                  ↑
                              (Start cooking) ───────────┘
```

Four screens, linear flow. Back navigation always returns to the previous screen with state preserved (selected chips on the form, scroll position on results).

The detail page also exposes lateral actions: **More like this**, **Substitutions**, **Different recipe**, and the **Something looks wrong?** sheet. Each is described in §5.

**Resume flow:** When the app loads (any route), it checks `localStorage` for an in-progress cook. If one exists (less than 7 days old), a banner is rendered at the top of the current screen: "Resume your tomato rasam? Step 4 of 9 · [Resume] [Start fresh]". Tapping Resume goes straight to cooking mode at the correct step. Tapping Start fresh clears the cooking state and continues to whatever screen she was loading. The banner does not block the screen — she can ignore it and use the form normally. See §7.9 for the persistence rules.

---

## 3. Screen 1 — Form ("What are we cooking?")

The home screen. A single column of chip groups. Multi-select within each group; AND across groups (e.g. picking Dinner AND South Indian narrows to that intersection).

### Chip groups, in order

| Group | Multi | Options |
|---|---|---|
| Meal | yes | Breakfast · Lunch · Dinner · Snack · Dessert |
| Cuisine | yes | South Indian · North Indian · Chinese · Italian · Continental · Thai · Mexican · Middle Eastern |
| Diet | yes | Vegetarian · Non-veg · Eggless · Vegan · Jain |
| Time available | single | Under 15 min · Under 30 min · Under 60 min · No limit |
| Vibe | yes | Comforting · Light · Spicy · One-pot · Healthy · Indulgent · Impressive |
| Main ingredient (optional) | yes | Chicken · Paneer · Fish · Eggs · Vegetables · Pasta · Rice · Lentils · Tofu |

**No group is required.** She can submit with nothing selected; the form treats that as "anything goes."

### Actions

- **Primary button — "Find recipes":** triggers the recipe search (§6).
- **Secondary link — "Surprise me":** submits with all groups empty plus a hidden `surprise: true` flag so the backend picks something well-rated and seasonal.

### Behaviour notes

- Selected chips: pill background `bg-info`, border `border-info`, text `text-info`. Unselected: white bg, 0.5px `border-tertiary` border.
- Tapping a selected chip de-selects it.
- The form persists in URL search params (e.g. `?meal=dinner&cuisine=south-indian,italian&time=30`) so back-navigation restores selections without storage.
- "Time available" is single-select because picking both "Under 15 min" and "Under 60 min" is incoherent.

---

## 4. Screen 2 — Results list

A vertically scrolling list of 3–5 recipe cards.

### Card structure

Each card, top to bottom:

1. **Image** — fetched from the source recipe page. Most recipe sites have one. If absent, fall back to a neutral muted card colour, no stock photo. Image height: 140 px on phone, full card width.
2. **Title** — recipe name, 15 px, weight 500.
3. **Meta line 1** — `<icon-clock> 10m prep · 20m cook` in 12 px secondary text.
4. **Meta line 2** — `320 kcal · Weeknight easy` in 12 px secondary text.
5. **Availability pill** — one of:
   - `bg-success / text-success` "All ingredients on Instamart" (when 0 missing)
   - `bg-warning / text-warning` "2 missing · tap to add" (when ≥1 missing)
   - `bg-secondary / text-secondary` "Availability not checked" (Instamart fallback mode — see §8)
6. **Whole card is tappable** → recipe detail page.

### Header strip above cards

A back arrow + a single line summarising the active filters: "Dinner · South Indian · 30m". Tapping it returns to the form.

### Empty state

If web search returns 0 valid recipes after the dedupe + normalise pass: show a friendly message ("Nothing great came back — try different filters?") and a primary button back to the form. Do not invent recipes.

### Loading state

While the backend is fetching: skeleton cards (3 of them) with the same shape, animated subtle pulse. Show a hint line: "Reading a few recipe sites for you."

---

## 5. Screen 3 — Recipe detail

The commitment screen. Long, scrollable, dense with information but never busy.

### Section order, top to bottom

1. **Header** — back arrow (left) and share icon (right).
2. **Source attribution** — small line: `<icon-external-link> From archanaskitchen.com`. Tapping opens the source URL in a new tab. Mandatory; cannot be hidden.
3. **Title** — 17 px, weight 500.
4. **Tagline** — 12 px secondary, one line, generated by Claude when normalising the recipe (e.g. "Tangy, peppery, ready in under 30 minutes").
5. **Pill row** — difficulty label (info-coloured pill) and "why this was picked" pill (soft secondary background, e.g. "Picked: 30m · comforting · all on Instamart").
6. **Diet flags row** — small auto-detected pills, one per flag: "contains dairy", "contains gluten", "vegetarian", "eggless", etc. Inferred from the ingredient list. Skip the row entirely if no flags apply.
7. **Equipment row** — only if any ingredients require equipment **outside the decent-kitchen baseline**. Format: "You'll also need: waffle iron". Baseline equipment (oven, microwave, air fryer, 4-burner stove, hand blender, regular blender, hand mixer) is never mentioned. If no non-baseline equipment is needed, omit the row entirely.
8. **Make-ahead nudge** — a yellow `bg-warning / text-warning` banner above the metrics row when the recipe requires lead time: "Soak chickpeas 8 hours before starting" or "Bring butter to room temperature 30 min ahead." Includes an "I've done this — dismiss" link that hides the banner for the session. Inferred from the recipe steps. Omit entirely when no lead time is needed.
9. **Metrics row** — 4-column grid: Prep · Cook · Serves · kcal.
10. **Ingredients section:**
    - Header: "Ingredients" on the left; servings adjuster on the right (`Serves [−] 2 [+]`).
    - Ingredient list: each row has a left dot (green = available, orange = missing on Instamart, gray = not checked), the ingredient name + quantity, and an inline "add" link on missing items.
    - When servings change via the adjuster, all ingredient quantities scale proportionally. Display rounded (`1.33 tsp` → `1¼ tsp` or `1.5 tsp` — see §12 for unit rounding).
    - If ≥1 missing: a CTA button below the list: `<icon-shopping-cart> Review N missing on Instamart` (`bg-warning / text-warning` background). Tapping it opens Instamart in a new tab with the missing items pre-queued in her cart at the Royal Legend address — but it does NOT auto-checkout. She reviews variants, quantities, and totals on Instamart before paying. This guards against ordering the wrong variant (e.g. sugar-free coconut milk) when our matching is imperfect.
11. **"Pairs well with"** — single line, only if the recipe is the kind of thing that's typically served with sides (Claude infers this). Format: "Pairs well with: papad, coconut chutney." Omit if not applicable.
12. **Steps preview** — header "Steps · N in total." First 2 steps shown inline as numbered rows. "+ N more steps" at the bottom.
13. **Primary CTA — "Start cooking →"** — full-width, dark filled button, sticky-feeling at the bottom of the visible content.
14. **Secondary actions row** — three equal-width outline buttons: "More like this" · "Substitutions" · "Different recipe."
15. **Ghost link — "Something looks wrong?"** — small, centred, gray. Opens the feedback sheet (§5.2).

### 5.1 Servings adjuster behaviour

- Default: `serves` value from the recipe source, falling back to 2 if absent.
- Range: 1–12.
- Decrement `−` is disabled at 1. Increment `+` is disabled at 12.
- Quantity scaling: `newQuantity = baseQuantity × (currentServings / baseServings)`. Round per §12.
- Ingredient list re-renders quantities live on each tap. Calorie metric does **not** change (it's per-serving). Times don't change either.

### 5.2 "Something looks wrong?" sheet

Bottom-sheet modal. Five preset rows, each with a chevron:

| Reason | Recovery |
|---|---|
| Steps don't match this dish | Refetch the dish from a different source URL via Claude web search; replace the recipe in place. |
| Ingredients look wrong | Same as above. |
| Calorie count is off | Call the backend to recompute calories from the current ingredient list. Update the metric in place. |
| Time is way off | Call the backend to recompute total time from the steps + quantities. Update the metric in place. |
| Just not what I want | Pop back to the results list and replace this card with the next-best result from the original search. |

No free-text field. Cancel returns to the recipe page unchanged.

### 5.3 "More like this" / "Substitutions" / "Different recipe"

- **More like this** — re-runs the search with the same filters PLUS `similarTo: <current recipe title>`. Returns to results list.
- **Substitutions** — opens a small inline panel (no new screen). For each ingredient, Claude suggests 1–2 substitutes with quantity equivalents. E.g. "1 tsp tamarind paste → 2 tsp lemon juice." Generated on-demand.
- **Different recipe** — same dish, different source. Calls `/api/find-alternate-source` (§7.2) and swaps the recipe in place (preserving servings adjustment if possible).

---

## 6. Screen 4 — Cooking mode

The kitchen screen. Maximally stripped. **Fully offline-capable** — once she enters this screen, every render reads from the cached recipe in `localStorage`. No network requests fire while cooking.

### Layout

1. **Header strip** — back arrow + "`<recipe title>` · Step `N` of `M`" in 12 px secondary.
2. **Step text** — the current step, 14 px, line-height 1.45, top-aligned in the visible area, with generous vertical breathing room.
3. **Timer block** — only when the step has an explicit duration (e.g. "simmer for 8 min"). Big mono digits (26 px, weight 500), centered. Below: tiny "Tap when done" hint or active countdown. Tapping the timer starts/pauses it. When the timer hits 0:00, alert (see "Timer alert behaviour" below).
4. **Previous step affordance** — a small left-chevron icon button in the top-left of the step text area (separate from the back arrow). Goes back one step. Disabled on step 1.
5. **Primary button — "Next step →"** — full-width at the bottom. On the last step, this becomes "Done — well cooked." which returns to the detail page and clears the in-progress cooking state from `localStorage`.

### Critical behaviour

- **Screen Wake Lock with auto-recovery.** When cooking mode mounts, request a wake lock via the [Wake Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API). The wake lock is **automatically released by the browser when the tab loses visibility** (she switches to YouTube, takes a call, etc). Attach a `document.addEventListener("visibilitychange", ...)` handler that **re-requests the wake lock when the tab becomes visible again**. Without this listener, the screen will sleep the moment she comes back from YouTube. Show a tiny status line at the bottom: "Screen stays awake while you cook."
- **Swipe gestures.** Optional but encouraged: swipe-left advances to next step, swipe-right goes back. Buttons are still the primary affordances.
- **No back-button trap.** Hitting browser back from cooking mode returns to the recipe detail page, not the results list. Cooking state persists in `localStorage` (§7.9), so re-entering the recipe later offers to resume.
- **State persistence on every step change.** Each call to "Next step" / "Previous step" writes the new step number and a `lastTouchedAt` timestamp to `localStorage`. If the tab is killed mid-cook, the state is already saved.

### Timer alert behaviour

When a step's timer reaches 0:00, the app fires a layered alert because she may be in another app (YouTube, a call, the home screen):

1. **Visual flash** — a brief full-screen colour pulse on our tab. Useful when she has glanced at the phone.
2. **Vibration** — `navigator.vibrate([200, 100, 200, 100, 400])`. Most reliable signal across phones and most likely to break through other audio.
3. **Audio chime** — a short, distinct sound. Quieter than YouTube but layered with the vibration it still registers.
4. **System notification** — IF she has granted Notifications permission (asked once on her first cook; see "Notifications permission" below), a system-level notification fires with the recipe name and step title. This is the only thing that surfaces above YouTube reliably.

### Notifications permission

On the **first time** she enters cooking mode in a session, after she taps "Start cooking" and the wake lock is established, show a non-blocking inline card:

> "Allow notifications so we can tell you when your timer's up — even if you've switched to YouTube? [Allow] [Not now]"

If she allows: call `Notification.requestPermission()`, persist the choice in `localStorage` so we never ask again. If she taps "Not now," remember that for 30 days and don't re-prompt. The card auto-dismisses after a tap or after 8 seconds of no interaction.

The cooking mode works fully without notifications — they're just one of four layers of the timer alert. The card is suggestion, not a blocker.

---

## 7. Tech architecture

### 7.1 Stack

| Layer | Tech | Notes |
|---|---|---|
| Frontend | React 18 + Vite + Tailwind CSS | SPA, single bundle. |
| Routing | `react-router-dom` v6 | Four routes: `/`, `/results`, `/recipe/:id`, `/cook/:id`. |
| State | React state + URL search params + `localStorage` | No Redux. Filters live in URL; current recipe and cooking progress persist to `localStorage` per §7.9. |
| Hosting | Firebase Hosting | Static build output from `npm run build` deployed to Hosting. |
| Backend | Firebase Cloud Functions for Firebase (Node 20+, 2nd gen) | All Anthropic + Instamart calls happen here. |
| Secrets | Firebase Secret Manager | `ANTHROPIC_API_KEY` lives here, never in the client bundle. |
| API SDK | `@anthropic-ai/sdk` | Latest stable. |

### 7.2 Cloud Function endpoints

All endpoints are HTTPS, POST, JSON in/out, deployed under the `/api/*` path via Firebase Hosting rewrites.

| Endpoint | Body | Returns |
|---|---|---|
| `POST /api/search-recipes` | `{ meal, cuisines, diet, timeMax, vibes, mainIngredients, surprise }` | `{ recipes: Recipe[] }` (3–5 items) |
| `POST /api/find-alternate-source` | `{ dish: string, excludeUrls: string[] }` | `{ recipe: Recipe }` |
| `POST /api/recompute-field` | `{ recipe: Recipe, field: "calories" \| "time" }` | `{ value: number }` |
| `POST /api/get-substitutions` | `{ ingredients: Ingredient[] }` | `{ substitutions: { [ingredientName]: string[] } }` |
| `POST /api/check-instamart` | `{ ingredients: string[] }` | `{ availability: { [ingredientName]: { available: boolean, productId?: string, price?: number } } }` |
| `POST /api/add-to-instamart` | `{ ingredients: string[] }` | `{ cartUrl: string, addedCount: number }` |
| `POST /api/feedback` | `{ recipeId, reason }` | `{ ok: true }` — fire and forget, used by the wrong-recipe sheet (also triggers the appropriate recovery via one of the other endpoints). |

Each handler validates input, applies a per-IP rate limit (10 req/min is plenty for a household app), and returns JSON. All errors return `{ error: { code, message } }` with appropriate HTTP status codes.

### 7.3 Anthropic API call shape

For `/api/search-recipes`, the Cloud Function calls Claude with web search enabled. Use model `claude-sonnet-4-6` (cost-effective, capable, supports tool use and web search).

```javascript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const response = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 4096,
  tools: [{ type: "web_search_20250305", name: "web_search" }],
  system: SYSTEM_PROMPT,        // see §7.4
  messages: [
    { role: "user", content: buildUserPrompt(filters) }
  ]
});
```

The response will contain interleaved `text`, `tool_use`, and `tool_result` blocks. The final assistant text block contains the JSON array of normalised recipes (instructed by the system prompt). Parse it, validate, and return.

### 7.4 System prompt for the recipe search

```
You are a recipe-finding assistant. Given filters, you search the web for 3–5 real recipes that match, then normalise each into a strict JSON schema.

Rules:
- Search reputable recipe sites: archanaskitchen.com, hebbarskitchen.com, vegrecipesofindia.com, indianhealthyrecipes.com, seriouseats.com, bbcgoodfood.com, nytcooking.com, bonappetit.com, allrecipes.com.
- Do NOT invent recipes. If web search returns nothing matching, return an empty array.
- Each recipe must include a source URL that the user can open.
- Normalise quantities to a consistent unit per ingredient.
- Generate a one-sentence tagline (max 12 words) describing the dish.
- Infer a difficulty score (1–5) and a friendly label ("effortless", "weeknight easy", "needs a bit of focus", "weekend project", "advanced") from step count, technique vocabulary, and total time.
- Infer diet flags from the ingredient list: "contains dairy", "contains gluten", "vegetarian", "vegan", "eggless", "contains nuts", etc.
- Infer equipment from the steps. Only flag equipment OUTSIDE this baseline: oven, microwave, air fryer, 4-burner stove, hand blender, regular blender, hand mixer. Mention "kadhai" and "pressure cooker" only if they're genuinely required (no good substitute). Common pots/pans/knives are never flagged.
- Detect make-ahead steps: anything requiring more than 15 minutes of lead time before active cooking can begin (soaking, marinating, room-temp butter, dough rising). Emit one short sentence; null if not applicable.
- Detect "pairs well with" sides if the dish is conventionally served with accompaniments. Null if standalone.
- Compute the "whyPicked" array from the user's active filters.
- Output ONLY the JSON array — no preamble, no explanation, no markdown fences.

Schema: <inline JSON schema, see §9>
```

### 7.5 Swiggy Instamart integration

Two paths, with the fallback as the v1 starting state because the MCP server's auth model isn't yet portable to a server-to-server API call.

**Path A (preferred, when authentication is resolved):** The Cloud Function calls Anthropic with the Instamart MCP server attached via the `mcp_servers` request parameter, scoped to the Royal Legend address. The model uses Instamart tools to check availability per ingredient and to add to cart.

**Path B (fallback, ship in v1):** The Cloud Function asks Claude to classify each ingredient as `pantry-staple | likely-available | specialty` based on commonness in Indian kirana/supermarket retail. The availability pill then reads:
- 0 specialty items → "All ingredients on Instamart" (green)
- ≥1 specialty → "N specialty items — may not stock" (warning)
- The "Add to Instamart" CTA opens a search URL on instamart.com prefilled with the missing items, rather than directly adding to cart.

The frontend never needs to know which path is active — both paths return the same response shape from `/api/check-instamart` and `/api/add-to-instamart`. The backend has a feature flag `INSTAMART_MODE = "mcp" | "heuristic"` (env var) that switches between them. Ship in `heuristic` mode; flip to `mcp` once auth is sorted (post-v1).

### 7.6 Firebase setup — concrete commands

```bash
# One-time setup
npm install -g firebase-tools
firebase login
firebase init

# Choose: Hosting, Functions, Emulators
# Hosting: public dir = "dist", SPA rewrite = yes
# Functions: TypeScript or JavaScript, Node 20
# Install dependencies when prompted

# Set the API key secret (this prompts for the value)
firebase functions:secrets:set ANTHROPIC_API_KEY

# Local dev
npm run dev                # starts Vite at localhost:5173
firebase emulators:start   # starts functions + hosting emulators

# Deploy
npm run build              # builds the frontend to /dist
firebase deploy            # ships both hosting and functions
```

### 7.7 `firebase.json`

```json
{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      { "source": "/api/**", "function": "api" },
      { "source": "**", "destination": "/index.html" }
    ],
    "headers": [
      {
        "source": "/assets/**",
        "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
      }
    ]
  },
  "functions": [
    {
      "source": "functions",
      "codebase": "default",
      "runtime": "nodejs20",
      "predeploy": ["npm --prefix \"$RESOURCE_DIR\" run build"]
    }
  ]
}
```

### 7.8 Functions skeleton (`functions/src/index.ts`)

```typescript
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import express from "express";
import cors from "cors";
import Anthropic from "@anthropic-ai/sdk";

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));

app.post("/api/search-recipes", async (req, res) => {
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
  // ... build prompt, call client.messages.create, parse JSON, return
});

app.post("/api/find-alternate-source", async (req, res) => { /* ... */ });
app.post("/api/recompute-field", async (req, res) => { /* ... */ });
app.post("/api/get-substitutions", async (req, res) => { /* ... */ });
app.post("/api/check-instamart", async (req, res) => { /* ... */ });
app.post("/api/add-to-instamart", async (req, res) => { /* ... */ });
app.post("/api/feedback", async (req, res) => { /* ... */ });

export const api = onRequest({ secrets: [ANTHROPIC_API_KEY], region: "asia-south1" }, app);
```

Region `asia-south1` (Mumbai) — closest to the user.

### 7.9 State persistence (`localStorage`)

V1 has no accounts and no cloud sync, but the app must survive every realistic interruption: tab kills from OS memory pressure (especially while she's watching YouTube), refreshes, browser closes, phone reboots, and gaps of hours or days between starting and finishing a recipe with lead time (e.g. marinate 2 hours, soak overnight).

`localStorage` is the right tool: device-local, survives all of the above, requires no auth, has plenty of headroom for our data shapes.

**Keys and shapes:**

```typescript
// All keys prefixed `recipe-app:` to avoid collisions.

// The recipe she's currently looking at or cooking. Updated whenever
// she opens a recipe detail page or advances a step in cooking mode.
"recipe-app:active-recipe": {
  recipe: Recipe,                  // full normalised recipe per §9
  source: "search" | "alternate" | "resumed",
  openedAt: string,                // ISO timestamp
}

// Cooking-mode progress. Written on every step change.
// Absence of this key means no cook is in progress.
"recipe-app:cooking-state": {
  recipeId: string,                // matches active-recipe.recipe.id
  currentStep: number,             // 1-indexed
  totalSteps: number,
  timer: {                         // null when no timer is running
    stepNumber: number,
    durationSeconds: number,
    startedAt: string,             // ISO timestamp; remaining = duration - (now - startedAt)
    paused: boolean,
    pausedRemainingSeconds: number | null,
  } | null,
  startedAt: string,                // ISO timestamp when she first tapped "Start cooking"
  lastTouchedAt: string,            // ISO timestamp on every step change
}

// The last 10 recipes she's viewed. Used as fallback content for
// "More like this" / "Different recipe" when network is flaky.
"recipe-app:recent-recipes": Recipe[]   // most recent first, capped at 10

// The last successful search response, used to repopulate the
// results list if she refreshes or comes back within 24 hours.
"recipe-app:last-search": {
  filters: object,                  // the form payload that produced it
  recipes: Recipe[],
  fetchedAt: string,
}

// Notifications permission state — so we don't re-prompt.
"recipe-app:notifications-prompt": {
  status: "allowed" | "denied" | "dismissed",
  promptedAt: string,
}

// Dismissed make-ahead nudges (cleared each cook).
"recipe-app:dismissed-makeahead": string[]   // recipe IDs
```

**Lifecycle rules:**

| Key | Written when | Cleared when |
|---|---|---|
| `active-recipe` | Opening a recipe detail page | Opening a different recipe; clearing in-progress state from the resume banner |
| `cooking-state` | Tapping "Start cooking"; every step change; every timer state change | Tapping "Done — well cooked" on the last step; auto-expired after 7 days; explicitly cleared by "Start fresh" on the resume banner |
| `recent-recipes` | Opening any recipe detail page (prepend if not already present) | Auto-trimmed to last 10 |
| `last-search` | After a successful `/api/search-recipes` response | Auto-expired after 24 hours; overwritten by next search |
| `notifications-prompt` | After the user responds to the inline prompt | Never |
| `dismissed-makeahead` | Tapping "I've done this — dismiss" on a make-ahead nudge | Cleared when "Done — well cooked" fires |

**Read pattern for the resume banner:**

On app mount (at the React root), read `cooking-state`. If present AND `lastTouchedAt` is within 7 days, render the resume banner on whatever screen is loading. Pass `active-recipe.recipe` to it so it can show the title and step counter without a network call.

**Offline read pattern for cooking mode:**

Cooking mode component reads exclusively from `active-recipe` and `cooking-state` in `localStorage`. No network requests fire from cooking mode. If `localStorage` is empty (impossible normally, but defensive), render an error card: "We've lost track of this recipe — go back to start." with a button to the form.

**Storage size:** A typical normalised recipe is ~3–6 KB JSON. With 10 recent recipes + active + last-search results, we're well under 200 KB total — `localStorage` has a 5–10 MB quota per origin. Never close to the limit.

**Defensive coding required:** wrap every `localStorage` read/write in try/catch. Private browsing on iOS Safari throws on `localStorage.setItem`. If writes fail, the app must degrade gracefully (in-memory only) rather than crash.

### 7.10 Wake Lock and visibility handling

A dedicated `useWakeLock` hook (in `/src/hooks/useWakeLock.ts`) handles both initial request and re-acquisition after tab returns to visible. Pseudo-code:

```typescript
function useWakeLock(active: boolean) {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  const acquire = async () => {
    if (!active || !("wakeLock" in navigator)) return;
    try {
      lockRef.current = await navigator.wakeLock.request("screen");
    } catch (e) { /* ignore: user denied, low battery, etc */ }
  };

  const release = () => {
    lockRef.current?.release();
    lockRef.current = null;
  };

  useEffect(() => {
    if (active) acquire();
    else release();

    const onVisibilityChange = () => {
      if (active && document.visibilityState === "visible") {
        acquire();   // re-acquire after returning from YouTube etc.
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      release();
    };
  }, [active]);
}
```

The cooking-mode component calls `useWakeLock(true)`; everywhere else, the lock is released.

### 7.11 Timer-end multi-channel alert

When a step's timer hits 0:00:

```typescript
function fireTimerAlert(recipeTitle: string, stepTitle: string) {
  // 1. Visual flash on our tab (CSS animation, ~600ms)
  document.body.classList.add("timer-flash");
  setTimeout(() => document.body.classList.remove("timer-flash"), 600);

  // 2. Vibration (silent phones, busy phones — most reliable signal)
  navigator.vibrate?.([200, 100, 200, 100, 400]);

  // 3. Audio chime (short, sub-2-second wav, played via HTMLAudioElement)
  playChime();

  // 4. System notification if permission granted — surfaces above YouTube
  if (Notification.permission === "granted") {
    new Notification(`${recipeTitle}: ${stepTitle}`, {
      body: "Timer's up.",
      icon: "/icon-192.png",
      vibrate: [200, 100, 200],
    });
  }
}
```

All four fire together. They are layered, not alternatives — each has different reliability characteristics on different phones and contexts (silent mode, focus mode, other app in foreground).

---

## 8. Performance & reliability

- **Time-to-recipe-list under 8 seconds** on a typical 4G connection. Web search + normalisation is the bottleneck; budget Anthropic at ~5 seconds and add a Vite-bundled skeleton state for the rest.
- **Aggressive frontend caching:** Vite hashes assets; set `Cache-Control: immutable` on `/assets/**` (see firebase.json).
- **Response caching backend-side:** identical filter combos within 1 hour return the cached response. Use Firestore as a simple key-value cache, keyed by hashed filter object. (Firestore is the only state v1 carries, and only for caching — not for user data.)
- **Per-IP rate limit on Cloud Functions:** 10 requests/min for write endpoints, 30/min for reads. Reject with 429.
- **Error boundaries** on every screen — never show a white screen of death. Render a friendly recovery card with a "Try again" button that retriggers the last request.

---

## 9. Data model — the normalised `Recipe`

This shape is the contract between backend and frontend. Both must agree on it.

```typescript
type Recipe = {
  id: string;                              // backend-assigned UUID per response
  source: {
    url: string;                           // canonical recipe page URL
    siteName: string;                      // "archanaskitchen.com"
    imageUrl: string | null;               // hero image from the source if available
    fetchedAt: string;                     // ISO timestamp
  };
  title: string;                           // "Tomato rasam with steamed rice"
  tagline: string;                         // one sentence, max 12 words
  servings: {
    base: number;                          // as published on the source
    current: number;                       // mirrors base initially; mutable from adjuster
  };
  times: {
    prepMinutes: number;
    cookMinutes: number;
    totalMinutes: number;
  };
  difficulty: {
    score: 1 | 2 | 3 | 4 | 5;
    label: "effortless" | "weeknight easy" | "needs a bit of focus" | "weekend project" | "advanced";
  };
  calories: {
    perServing: number;
    inferenceSource: "page" | "estimated";  // "page" if pulled directly, "estimated" if Claude estimated
  };
  equipment: string[];                      // ONLY non-baseline items; empty array if all baseline
  makeAhead: string | null;                 // "Soak chickpeas 8 hours before starting"
  dietFlags: string[];                      // ["contains dairy", "vegetarian"]
  pairsWith: string[] | null;               // ["papad", "coconut chutney"] or null
  whyPicked: string[];                      // ["30m", "comforting", "all on Instamart"]
  ingredients: Ingredient[];
  steps: Step[];
};

type Ingredient = {
  name: string;                             // "tomatoes"
  quantity: number;                         // 3
  unit: string | null;                      // "tsp" | "cup" | "g" | "ml" | "tbsp" | null
  group: string | null;                     // "For the tempering" — sub-section header if any
  instamart: {
    available: boolean;
    productId: string | null;
    price: number | null;                   // in INR
    classification: "pantry-staple" | "likely-available" | "specialty";  // for the heuristic fallback
  };
};

type Step = {
  number: number;                           // 1-indexed
  text: string;                             // full step instruction
  timerSeconds: number | null;              // parsed duration if step has explicit time
};

// --- Persistence shapes (localStorage values, see §7.9) ---

type ActiveRecipe = {
  recipe: Recipe;
  source: "search" | "alternate" | "resumed";
  openedAt: string;                         // ISO timestamp
};

type CookingState = {
  recipeId: string;                         // matches active-recipe.recipe.id
  currentStep: number;                      // 1-indexed
  totalSteps: number;
  timer: TimerState | null;
  startedAt: string;                        // ISO when "Start cooking" was first tapped
  lastTouchedAt: string;                    // ISO updated on every step / timer change
};

type TimerState = {
  stepNumber: number;
  durationSeconds: number;
  startedAt: string;                        // ISO; remaining = duration - (now - startedAt)
  paused: boolean;
  pausedRemainingSeconds: number | null;
};
```

Backend MUST validate every recipe against this shape before returning. Invalid recipes are dropped, not patched.

---

## 10. Design language

Warm, clean, kitchen-friendly. The vibe is "trusted home recipe book" not "tech startup."

### Tokens

- **Font:** `Inter` for sans-serif; system fallback. No serif body. Headings in 500 weight, body in 400. Sentence case throughout. Never ALL CAPS, never Title Case.
- **Sizes:** 17 px page titles, 15 px section titles, 13 px button text, 12.5 px body, 11 px meta. Never below 11 px.
- **Colours:** mostly neutrals. Two semantic accents only — `success` (green, ingredient available) and `warning` (yellow/amber, ingredient missing / make-ahead nudge). One brand accent for primary buttons: solid near-black (`#1a1a1a`), white text. No gradients, no shadows except focus rings.
- **Spacing:** 1.5 rem between sections, 1 rem between rows within a section, 8 px inside chip pills.
- **Border radius:** 8 px standard, 22 px for the "phone screen" feel on outer cards, 999 px for pills.
- **Tap targets:** minimum 44 × 44 px for any tappable element (Apple HIG guideline). Chips that fall short get extra padding.
- **Icons:** Lucide React (already React-native). Outline style only.

### Tone

Friendly without being twee. "What are we cooking?" not "Welcome back, chef!" "Find recipes" not "Discover deliciousness." "Something looks wrong?" not "Help us improve." Sentence case in everything including buttons.

### Unit display rounding

| Quantity | Display |
|---|---|
| Integer | "3 tomatoes" |
| Fraction within 1/4 of common (¼, ⅓, ½, ⅔, ¾) | "1½ tsp" |
| Otherwise | round to one decimal, "1.3 tsp" |

Volumes under 1 tsp display as "a pinch" if very small (< 0.25 tsp).

---

## 11. V2 architecture hooks

V1 has device-local persistence (§7.9) but no accounts and no cross-device sync. V2 adds the memory layer — favourites, dislikes, diet/pantry/notes, source quality learning, and cross-device sync via Firestore + accounts. To avoid a rewrite, the v1 frontend should be built with these seams already in place — even if they're stubs.

### Stubs to include in v1

1. **`useUserContext()` hook** — returns `{ favourites: [], cookedBefore: [], allergies: [], pantry: [], notes: {}, diet: null }` in v1 (all empty). In v2, it reads from Firestore + auth. Wire components to read from this hook even in v1, so v2 is a hook-implementation swap, not a refactor.
2. **`<UserContextProvider>`** — wraps the app. Empty no-op in v1; populated in v2.
3. **Recipe-detail action slots** — leave room for a future "♡ Save" button on the detail page header, even if hidden in v1 via a feature flag.
4. **Feedback endpoint** — `/api/feedback` already in v1 (used by the wrong-recipe sheet), but log every event to Firestore now. In v2, these logs train the source quality signal.
5. **Cooking mode "How did it turn out?"** — leave a hook at the end of cooking that calls `onCookComplete(recipe)`. No-op in v1; v2 wires it to a feedback prompt.
6. **Storage adapter** — the `localStorage` access in v1 should go through a thin adapter (e.g. `/src/lib/storage.ts`) so that v2 can swap it for a Firestore-backed implementation without touching the call sites.

### V2 backlog (not in v1, but designed for)

For reference; do not build in v1.

- Memory / personalisation: favourites, cooked-before, dislikes, allergy + diet set-once, pantry memory, personal notes per recipe.
- Cross-device sync via Firestore + auth (so her phone and tablet stay in sync).
- Voice cooking mode: reads steps aloud, advances on "next" or tap-anywhere.
- Active vs passive time distinction in metrics.
- Combined-cart weekly meal planning.
- Inline tips per step in cooking mode.
- Service-worker offline cache (broader than v1's `localStorage` — caches the full app shell for first-load offline use).
- Source quality signal — Claude tags trusted sources, learned from v1's feedback events.
- Regional variation toggle — same dish, different regional style.

---

## 12. Acceptance criteria for v1 sign-off

The build is done when **every one of these is true** in production:

1. Loading `/` opens the form. No keyboard appears.
2. Tapping any chip selects it visually (filled background). Tapping again deselects.
3. Submitting the form with no chips returns 3–5 results.
4. Submitting with any combination of chips returns 3–5 results that visibly match the filters.
5. Each result card shows: image (or neutral fallback), title, prep + cook, kcal, difficulty label, availability pill.
6. Tapping a card opens the detail page with every section from §5 rendered (or correctly omitted per the rules).
7. The source attribution at the top opens the original recipe URL in a new tab.
8. The servings adjuster scales ingredient quantities. Calories and times do not change.
9. "Review N missing on Instamart" opens Instamart in a new tab with the items pre-queued at the Royal Legend address. The app does NOT auto-checkout.
10. "Start cooking" enters cooking mode. The screen does not sleep while cooking mode is open (verify on a real phone).
11. **Wake lock recovers after backgrounding.** With cooking mode open, switch to YouTube for ≥30 seconds, then return. The screen stays awake again automatically.
12. **Tab-kill resilience.** With cooking mode at step 4, force-close the tab. Reopen the site. The resume banner appears with "Step 4 of N" and Resume jumps straight back to cooking mode at step 4.
13. **Cooking mode works offline.** With cooking mode open, turn off wifi and mobile data. Every step (next, previous, timer) continues to function. No spinner, no error.
14. **Timer alert is multi-channel.** When a step timer hits 0:00 with the app in the background, the phone vibrates AND a system notification fires (if permission granted). Visual flash and audio chime also fire when the tab is foreground.
15. **Notifications permission is asked once.** The inline card appears on first cook. "Allow" stores the result; "Not now" suppresses the prompt for 30 days. No browser-native blocking permission popups before the inline card.
16. The "Next step" / "Previous step" buttons advance/reverse through every step, ending on a "Done — well cooked" final state that clears the in-progress cooking state.
17. **Resume banner clears correctly.** Tapping "Start fresh" on the resume banner deletes `cooking-state` from `localStorage` and lets her load whatever screen she was navigating to.
18. **In-progress state expires after 7 days.** A cook started >7 days ago does NOT show a resume banner; it shows up only under "recently viewed" if applicable.
19. Each of the five "Something looks wrong?" reasons triggers the correct recovery flow.
20. All numbers shown anywhere are integers or sensibly rounded (no float artifacts).
21. The site loads under 3 seconds on a Pixel-class phone over 4G.
22. The Anthropic API key is not present anywhere in the client bundle. (Verify via `grep -r "sk-ant" dist/` — should return nothing.)
23. The Cloud Function rejects unauthenticated requests from other origins (CORS allowlist = the production Hosting domain only).
24. The site works in portrait and landscape on a 380 px-wide viewport and on a desktop browser.
25. **iOS Safari private mode degrades gracefully.** `localStorage.setItem` throwing does not crash the app; she gets an in-memory-only session with a small warning toast.

---

## 13. File / repo layout

```
recipe-app/
├── firebase.json
├── .firebaserc
├── package.json                    # root scripts: dev, build, deploy
├── vite.config.ts
├── tailwind.config.js
├── index.html
├── src/                            # frontend
│   ├── main.tsx
│   ├── App.tsx
│   ├── routes/
│   │   ├── Form.tsx
│   │   ├── Results.tsx
│   │   ├── Recipe.tsx
│   │   └── Cooking.tsx
│   ├── components/
│   │   ├── ChipGroup.tsx
│   │   ├── RecipeCard.tsx
│   │   ├── IngredientRow.tsx
│   │   ├── ServingsAdjuster.tsx
│   │   ├── FeedbackSheet.tsx
│   │   ├── ResumeBanner.tsx           # global banner per §2, reads cooking-state
│   │   ├── Timer.tsx
│   │   ├── TimerAlert.tsx             # the flash + vibrate + chime + notification (§7.11)
│   │   └── ...
│   ├── hooks/
│   │   ├── useWakeLock.ts             # request + auto-recover on visibilitychange (§7.10)
│   │   ├── useCookingState.ts         # reads/writes localStorage cooking-state per §7.9
│   │   ├── useNotificationsPermission.ts
│   │   ├── useUserContext.ts          # v2 hook, stubbed in v1
│   │   └── useApi.ts
│   ├── lib/
│   │   ├── api.ts                     # frontend client for /api/*
│   │   ├── storage.ts                 # localStorage adapter per §7.9 (swap for Firestore in v2)
│   │   ├── scaling.ts                 # quantity scaling + unit rounding
│   │   └── types.ts                   # mirror of §9 data model
│   └── styles/
│       └── index.css
├── functions/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                # express app + handlers (§7.8)
│       ├── prompts.ts              # system prompts (§7.4)
│       ├── instamart.ts            # MCP vs heuristic switch (§7.5)
│       ├── validation.ts           # JSON schema validation against §9
│       └── cache.ts                # Firestore-based response cache
└── README.md                       # local dev + deploy quick start
```

---

## 14. Things explicitly NOT in v1

So nobody adds them by accident:

- User accounts, login, or any form of identity
- Saved favourites, cooking history, dislikes, or notes (state is in `localStorage` for resilience only, not for personalisation)
- Allergy/diet memory (no settings page exists)
- Cross-device sync (single device only — `localStorage` is per-browser)
- Voice mode in cooking
- Step images
- Step tips inline
- Active vs passive time labels
- Meal planning across multiple recipes
- Service-worker offline mode for cold loads (cooking mode is offline-capable per §7.9, but the initial app load still requires network)
- Anything multi-user (sharing recipes between people)
- The "authentic vs accessible" axis
- Regional variation toggle

These all belong to v2 or v3 (see §11 backlog). V1 ships fast and simple.

---

**End of v1 spec.** This document is sufficient for the implementing engineer to build the entire application without consulting the original author for product decisions. If a decision is unclear, default to the prime directives in §1.
