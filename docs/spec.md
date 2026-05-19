# recipy — v1 product spec

A web app that helps one person — the owner's wife — decide what to cook tonight, pulls a real recipe from the web, and walks her through cooking it. Mobile-first, no keyboard, no accounts.

The owner is in Bengaluru. Delivery integrations target Swiggy Instamart at the "Royal Legend" address.

For the technical architecture (stack, state, routing, deployment) see [`architecture.md`](./architecture.md). For endpoint contracts see [`api.md`](./api.md). For what's shipped when see [`../CHANGELOG.md`](../CHANGELOG.md).

---

## 1. Prime directives

Rules that beat any other instinct. If a later section seems to contradict one of these, the directive wins.

1. **The keyboard never opens.** No free-text inputs in v1. Every choice is a tap on a chip, button, or stepper. Custom chips on Form are the one exception — users can add their own option (e.g. "Korean") via a small `+` affordance, and a single text field opens just long enough to capture it.
2. **Mobile-first, but real on bigger screens.** Design the phone view first — she'll be using this on her phone in the kitchen. Tablet and desktop reflow the same components via Tailwind responsive prefixes (no separate component trees): Form's chip grid goes 1-up → 2-up at `md` → 3-up at `lg`; Results' card list does the same; Recipe restructures into a 1:3 sticky-left grid at `lg+`. Stay typographic — no imagery is added at any breakpoint. See §5.4 for the layout details.
3. **One screen, one job.** Form picks filters. Results picks a recipe. Recipe commits. Cooking cooks. Never blend them.
4. **Round numbers always.** Anything displayed (servings, calories, times, prices) rounds for human reading. No `0.30000000000000004` artifacts.
5. **Single account, hard-gated.** v1 requires Google sign-in (M3). Persistent session via Firebase Auth's default `browserLocalPersistence` — once she signs in, she stays signed in across reboots, browser updates, and schema migrations. Local persistence (active recipe, cooking progress, recent recipes, filter selections) survives tab kills, browser closes, refreshes, and OS-level memory pressure. Account-level data (preferences, saved recipes, custom chips) syncs to Firestore so it follows the user across devices. See [`architecture.md`](./architecture.md) for the state model and the three-database split.
6. **The recipe is found, not invented.** Every recipe originates from a real recipe website, fetched by Claude via web search, and links back with attribution. Hallucinated URLs are unacceptable.
7. **Cooking mode is offline-capable.** Once she enters cooking mode, the recipe lives in localStorage. She can lose internet, swap to YouTube, take a call, even reboot — the steps and timer still work when she returns. (M4 scope.)

---

## 2. User flow

```
                                ┌── Resume banner (if a cook is in progress) ──┐
                                ↓                                                │
[Splash] → [Form] → [Results] → [Recipe] → [Cooking mode] ──────────────────────┘
            ↑          ↑           ↓             ↑
            │          │   (Start cooking) ──────┘
            │          │
            │          └── [Saved] ←─┐    via hamburger drawer
            └──────────── [Preferences] ←┘
```

Splash gates everything — see §3.5. Past the gate, the linear cook-flow is Form → Results → Recipe → Cooking. The drawer (§3.6) provides lateral access to Saved and Preferences from any screen except Cooking. Back navigation always returns to the previous screen with state preserved (selected chips on Form, scroll position and same recipes on Results).

The Recipe page exposes lateral actions: **More like this** (push to Results with a `similarTo` bias), **Find different recipe** (alternate source for the same dish, swapped in place), inline **Substitutions**, **Save** (heart button — M3), and a kebab-only **Something looks wrong?** sheet.

**Resume flow** (M4): when the app loads, it checks for an in-progress cook in localStorage. If one exists and is less than 7 days old, a banner renders at the top of whatever screen is loading: "Resume your tomato rasam? Step 4 of 9 · [Resume] [Start fresh]". The banner does not block — she can ignore it and use the form normally. Tapping Resume goes straight to cooking mode at the right step.

---

## 3. Screens

### 3.1 Form — "What are we cooking today?"

The home screen. A single column of chip groups. Multi-select within most groups; AND across groups (picking Dinner AND South Indian narrows to the intersection).

**Chip groups, in order:**

| Group | Multi | Options | Add own? |
|---|---|---|---|
| Meal | yes | Breakfast · Lunch · Dinner · Snack · Dessert | yes |
| Cuisine | yes | South Indian · North Indian · Chinese · Italian · Continental · Thai · Mexican · Middle Eastern | yes |
| Diet | yes | Vegetarian · Non-veg · Eggless · Vegan · Jain | yes |
| Prep time | single | Under 5 min · Under 15 min · Under 30 min · No limit | no |
| Cook time | single | Under 15 min · Under 30 min · Under 60 min · No limit | no |
| Vibe | yes | Comforting · Light · Spicy · One-pot · Healthy · Indulgent · Impressive | yes |
| Main ingredient | yes | Chicken · Paneer · Fish · Eggs · Vegetables · Pasta · Rice · Lentils · Tofu | yes |

**No group is required.** She can submit with nothing selected; the form treats that as "anything goes."

**Custom chips** persist per-group in localStorage (`recipe-app:custom-chips`). Tapping the `+` affordance opens a single text field that closes on submit. Stored lower-cased and trimmed.

**Actions:**

- **Find recipes** (primary button, sticky bottom) — pushes `/results` with `state.intent = "fresh"`. The store-held filters travel with the navigation; the URL stays clean.
- **Surprise me** (text link in the intro paragraph) — resets every chip to empty + sets `surprise: true` and pushes the same way. Surprise is a one-shot mood; tapping a chip after returning to Form clears the flag.

**Behaviour notes:**

- Selected chips: filled accent background. Unselected: paper with a hairline border.
- Tapping a selected chip de-selects it.
- Filters live in the Zustand store, not the URL. Back from Results restores them automatically.
- Prep and Cook are separate single-select groups (was one combined "Time available" group in earlier specs — split during M1 because "Prep under 5 min, cook under 60 min" is a real combination users wanted).

### 3.2 Results — three recipe cards

Vertically scrolling list of three (M1 settled on 3 after cost analysis — 5 was double the API spend with marginal user benefit).

**Top bar:**

- Sticky, frosted (`bg-paper/60 backdrop-blur-lg`).
- Back arrow → returns to Form (browser back when possible, hard nav to `/` as fallback for deep links).
- "Recipes" title.
- Regenerate icon (top right) → fires the regenerate intent, replacing the current batch with a fresh fetch.
- One-line filter summary below the bar: "Dinner · South Indian · 30m". Tappable; same destination as the back arrow.

**Card structure (stripped on purpose):**

1. **Title** — full size, `text-title` typography. The card is essentially a typographic block.
2. **Meta line** — `{prep}m prep · {cook}m cook · {kcal} kcal`.

No image, no pills, no availability state on the card itself. Images were dropped in M1 because (a) source pages don't always have hero images, (b) loading them was the slowest part of the cards, and (c) the typographic morph to the Recipe page H1 only has to translate, not scale, when the card is just text.

The card title carries a `layoutId` matching the Recipe page's H1, so Framer Motion animates the title from card position to header position when the user taps in. POP-driven mounts (back from Recipe) drop the `layoutId` so Framer doesn't fight the slide-off-right exit.

**Loader (full-bleed):**

When `intent === "fresh"` is active, Results renders a cooking-themed loader instead of the top bar and cards. Three rotating SVG illustrations (stirring pot, knife chopping, whisk in bowl) on a ~4.5 s rotation; a rotating one-liner ("Finding veggies", "Making tomatoes redder", "Asking the chefs") on a ~3.5 s rotation; a deterministic progress bar that fills as recipes stream in (capped at 95% until the loader unmounts). A constant sub-line reads "Usually takes 1–3 minutes, depending on how many filters you picked."

`MIN_LOADER_MS = 600` keeps the loader visible long enough to register, even on cache-hit responses.

**Regenerate** shows the same loader as an overlay on top of the existing cards (so they don't flicker mid-swap) and posts a top-of-screen "New recipes found!" toast on success.

**Empty state:**

If the API returns an empty array (no matches): "Nothing great came back · Try different filters?" with a Back-to-filters button.

**Error state:**

"Couldn't load recipes" with the actual error message and Try again / Back buttons.

### 3.3 Recipe — the commitment screen

The most-changed screen during M2 polish. Long, scrollable, tab-organised.

**Section order, top to bottom:**

1. **Top bar (sticky, frosted, single blur region).** Back arrow · empty centre · Share icon · kebab (More actions). When the in-page H1 scrolls out of view, a compact title fades into the centre. When the in-page tab strip scrolls under the bar, a second copy of the tab strip fades in inside the bar (same blur, no seam).
2. **Identity block (paper background).** Big H1 (the dish title), source attribution line ("Source: archanaskitchen.com" — opens in new tab), two pill rows (difficulty + diet flags), pairs-well-with line if applicable, "Alternate recipe · compare with previous recipe" link if a previousVersion exists (M2-only UI; the comparison view itself is M4).
3. **Stats row** — four equal cells with hairline borders top + bottom and vertical dividers: Prep · Cook · Serves · kcal. The Serves cell mirrors the servings adjuster on the Ingredients tab.
4. **Make-ahead nudge** — yellow card with the make-ahead text, shown only if `recipe.makeAhead` is non-null and the user hasn't dismissed it. "I've done this · dismiss" closes it for the session (persisted to `recipe-app:dismissed-makeahead`).
5. **Tab strip (in-flow).** Recipe · Equipment · Ingredients. Active tab gets a tinted background; the strip has a continuous hairline underline through all three.
6. **Tab content.** Slides directionally based on tab order (Recipe → Equipment slides one way, Ingredients → Recipe the other). The content area has `min-h-[100dvh]` so switching to a short tab doesn't collapse the page and bounce the scroll position. `overflow-x-hidden` clips the slide-out animation.
7. **Sticky bottom CTA.** Full pill when scrolling up; shrinks to a circular ChefHat FAB when scrolling down past 200 px (collapses on 40 px+ of downward delta, expands on 30 % of viewport height of upward delta). Anchored above iOS home indicator.

**Tabs:**

- **Recipe** — Steps section (`Steps · N in total`), optional inline substitutions section underneath ("If you don't have paneer, swap with: tofu · halloumi"). Step text live-rewrites via `applySubstitutions` when the user picks a substitute on the Ingredients tab.
- **Equipment** — HugeIcons grid of every non-baseline item the recipe needs (pressure cooker, kadhai, etc.). Baseline kitchen items (oven, microwave, blender, knives) are never listed — Claude is told to omit them.
- **Ingredients** — header with the servings adjuster (`Serves − 2 +`, range 1–12). Below: full-row tappable ingredient list. Each row is a checkbox (whole row is the touch target). Substitutes show in an accordion below the row, expanded by an explicit `Substitutes ▾` link to keep the tap target unambiguous. Servings changes scale quantities live via `scaleAndFormat` (`scaling.ts` handles fraction rounding: 0.33 → ⅓ if within 0.04 of a common fraction).

**Sticky CTA variants (driven by Ingredients tab state):**

| Selected ingredients | Last action | CTA |
|---|---|---|
| Zero | — | Solid accent: "Start cooking →" |
| Any | Not yet checked | White tinted-accent: "Check Instamart" with cart icon |
| Any | Just ran the check | White tinted-accent: "Add to cart" with cart icon |

Tapping `Check Instamart` runs the heuristic classification (every ingredient already carries `instamart.classification` from the initial API response) and jumps the user to the Ingredients tab so they see the result panel. Tapping `Add to cart` opens Instamart in a new tab with the items pre-queued at Royal Legend (M5).

**Kebab menu (More actions):**

- **More like this** — sets `filters.similarTo = recipe.title` in the store and pushes `/results` with `intent: "fresh"`.
- **Something looks wrong?** — opens the feedback sheet (see §4).

The "Find different recipe" action is no longer in the kebab — it's an inline link inside the Recipe tab next to the source attribution. Found surprise-easier there during M2 testing.

### 3.4 Cooking mode — M4 placeholder

The current `Cooking.tsx` is a stub. M4 ships the real screen. The design intent below stands.

**Layout:**

1. Header — back arrow + "`<recipe title>` · Step N of M" in caption text.
2. **Step text** — the current step, large body type, top-aligned in the visible area, generous vertical breathing room.
3. **Timer block** — only when the step has an explicit duration. Big mono digits, centered. Below: "Tap when done" or active countdown. Tapping starts/pauses.
4. **Previous step affordance** — small left-chevron in the step text area, separate from the back arrow. Disabled on step 1.
5. **Primary button** — "Next step →", full-width. On the last step: "Done — well cooked." which clears the cooking-state and returns to Recipe.

**Critical behaviour:**

- **Screen Wake Lock with auto-recovery.** Request a wake lock on mount via `navigator.wakeLock.request("screen")`. The browser releases it when the tab backgrounds. Attach a `visibilitychange` listener that re-requests on `document.visibilityState === "visible"`. Without this, the screen sleeps the moment she comes back from YouTube.
- **Swipe gestures (optional).** Swipe-left advances, swipe-right goes back. Buttons remain primary affordances.
- **State persistence on every step change.** Each tap writes the new step number and a `lastTouchedAt` ISO timestamp to `recipe-app:cooking-state`. Mid-cook tab kill → re-open → resume banner appears.
- **No back-button trap.** Browser back from cooking mode returns to Recipe, not Results. Cooking state persists so re-entering offers Resume.

**Timer-end multi-channel alert:**

When a step's timer hits 0:00, four signals fire together (layered, not alternatives — each has different reliability on different phones):

1. **Visual flash** — full-screen colour pulse on our tab, ~600 ms CSS animation.
2. **Vibration** — `navigator.vibrate([200, 100, 200, 100, 400])`. Reliable through silent mode and over other apps' audio.
3. **Audio chime** — a short, distinct sound. Sub-2-second wav, played via `HTMLAudioElement`.
4. **System notification** — if `Notification.permission === "granted"`. The only thing that surfaces above YouTube reliably.

**Notifications permission card:**

On the first cooking-mode mount in a session, after the wake lock is established, show an inline card (not the browser-native permission popup):

> "Allow notifications so we can tell you when your timer's up — even if you've switched to YouTube? [Allow] [Not now]"

Tapping Allow calls `Notification.requestPermission()` and persists the choice in `recipe-app:notifications-prompt`. Tapping Not now suppresses the prompt for 30 days. The card auto-dismisses after a tap or 8 s of no interaction. Cooking mode works fully without notifications — they're one of four alert layers.

### 3.5 Splash / sign-in — M3

Before any other screen renders, recipy checks Firebase Auth. If a user is signed in (persistent session via the SDK's default `browserLocalPersistence` — IndexedDB-backed), they land directly on Form. If not, the splash takes the full viewport. This is a **hard gate** — the app does not work without an account.

**Layout:**

- Centred column, same `max-w-md` cap as Form.
- App name "recipy" in Fraunces serif at `text-title` scale.
- One-line tagline ("What are we cooking today?").
- Two-line value prop: "Find a real recipe, scale it for your household, walk through it step by step."
- **Sign in with Google** button — uses Google's branded button per their identity guidelines (white background, Google G mark, "Sign in with Google" label).
- Reassurance line at the bottom: "Your saved recipes and preferences live on your account."

**Behaviour:**

- The button calls `signInWithPopup(auth, googleProvider)`. On mobile where popups are blocked, falls back to `signInWithRedirect`.
- On first successful sign-in, a `users/{uid}` document is created in `recipy-users` with the Google profile defaults (`displayName`, `email`, `photoURL`, `createdAt`) and an empty `preferences` object. Subsequent sign-ins skip the bootstrap.
- The splash unmounts; the user lands on Form.
- Auth persistence is the SDK default. No explicit `setPersistence` call needed.
- On sign-out (drawer button) the auth state clears and the splash re-mounts.

**Auth resolution timing:**

`onAuthStateChanged` resolves from the IndexedDB cache in ~100 ms. During that resolve window, render a neutral loading state — *not* the splash. Showing the splash for a signed-in user who's about to be recognised would be a regression.

**Offline:**

- A user who's signed in once stays signed in across reboots, browser updates, schema migrations.
- A first-time sign-in requires internet.

### 3.6 Hamburger drawer — M3

Global navigation that lives only on **core pages** — the top-level destinations the user can jump between via the drawer:

| Type | Pages | Top-left affordance |
|---|---|---|
| **Core** | Find recipes (Form), Saved recipes, Preferences, future top-level destinations | Hamburger (opens drawer) |
| **Inner** | Results, Recipe, Cooking | Back arrow only — these are drill-downs from a core page, not destinations themselves |

The mental model: hamburger means "I want to jump to a different part of the app." Back arrow means "I want to retreat within the flow I'm in." A screen having both dilutes the model and adds visual noise. Inner pages keep the existing back arrow without picking up a hamburger.

**Drawer content (top to bottom):**

| Item | Notes |
|---|---|
| Profile photo + display name + email | Pulled from `auth.currentUser`. Header section. |
| Find recipes | Active when on `/`. |
| Saved recipes | → `/saved` |
| Preferences | → `/preferences` |
| (gap) | Pushes sign-out to the bottom. |
| Sign out | Divider above. Confirmation dialog ("Sign out?") before `auth.signOut()`. |

**Behaviour:**

- Slides in from the left, takes 75–80% of viewport width on mobile.
- Tap-outside or swipe-left closes.
- Active nav item highlights subtly (accent-soft background).
- Drawer state is not persisted — closes on navigation.

**Desktop (`lg+`):**

The drawer becomes a **permanent left rail** at ~280 px wide. The hamburger button hides. Form / Results / Recipe content shifts right to accommodate. Recipe's existing 1:3 grid becomes (rail · 1:3 content grid) inside the 1280 px cap.

### 3.7 Preferences — M3

A dedicated route at `/preferences` reachable via the drawer. Auto-saves on every change; small "Saved" toast on success, revert + error toast on Firestore write failure.

**Sections, in order:**

1. **Diet defaults** — same chip group as Form's Diet selector (multi-select; Vegetarian · Non-veg · Eggless · Vegan · Jain · + custom). The chips selected here become the default on Form. The user can override per-search.
2. **Allergies** — custom chip group only (no presets). Each tag becomes a soft constraint in the search prompt: "avoid ingredients containing X".
3. **Spice tolerance** — single-select chip group: Mild · Medium · Hot. Maps to a prompt hint.
4. **Default time limits** — optional Prep / Cook ceilings. If set, Form pre-selects these.
5. **Custom chips** — read-only display of every custom chip the user has added across Meal / Cuisine / Diet / Vibe / Main ingredient groups, with a small ⨯ to remove. Adding chips still happens on the Form via the existing `+` affordance.

**Custom chip sync mechanism:**

- Local cache stays in `recipe-app:custom-chips` (fast read, offline-safe).
- Every chip add writes to BOTH localStorage AND `users/{uid}.preferences.customChips` in Firestore.
- On first sign-in on a new device, Firestore custom chips merge into the local cache (union, no data loss).
- On every app load post-sign-in, Firestore pulls into the local cache. Conflict resolution is set-union — chips are append-only and rarely conflict at our scale.

**Data shape on the user doc:**

```ts
users/{uid}.preferences: {
  diet: string[];                         // default for Form Diet chips
  allergies: string[];                    // custom strings, e.g. ["peanuts"]
  spiceTolerance: "mild" | "medium" | "hot" | null;
  defaultPrepMaxMin: number | null;
  defaultCookMaxMin: number | null;
  customChips: {
    meal: string[];
    cuisines: string[];
    diet: string[];
    vibes: string[];
    mainIngredients: string[];
  };
}
```

### 3.8 Saved recipes + the `recipy-list` library — M3

Two surfaces plus the backend library.

**Heart button** on the Recipe page (top-right of the top bar, next to the kebab):

- Outlined heart when not saved. Filled heart (accent colour) when saved.
- Tap: writes `users/{uid}/saved/{recipeId}` with denormalised fields (`title`, `siteName`, `savedAt`) so the list view doesn't need to fetch each full recipe.
- Tap-again unsaves — deletes the doc. The underlying `recipy-list` document stays (other users may have saved it).

**Saved route** at `/saved`:

- Reverse-chronological list of the user's saved recipes (most recent first).
- Each row: title (`text-card-title`), site name, saved date (relative — "saved Tuesday", "saved 3 weeks ago").
- Tap a row → opens the recipe at `/recipe/:id`. The page first checks the Zustand store (in case of recent activity); if not found, reads from `recipy-list/recipes/{id}`.
- Empty state: "Nothing saved yet. Tap the heart on any recipe."
- Pull-to-refresh re-queries Firestore.

**The `recipy-list` library:**

Every recipe Anthropic returns gets upserted into `recipy-list/recipes/{normalizedUrlHash}` by the Cloud Function on every successful search. The upsert happens after `res.end()` (same pattern as the existing cache write) so it doesn't slow the response.

Document shape mirrors the `Recipe` type plus:

- `schemaVersion: number` — currently 1.
- `addedAt: Timestamp`
- `lastSeenAt: Timestamp` — updated on every upsert.
- `deletedAt: Timestamp | null` — soft delete. Clients treat a deleted recipe as "this recipe is no longer available" with a graceful fallback.
- `firstSeenIn: { filters: SearchFilters }` — debugging aid; not used for lookup.

**Access:**

- Authenticated users can `read` any `recipy-list` document (so Saved list view + Recipe page can resolve a recipe by ID across users).
- Writes are admin-SDK only — clients never write directly. Same pattern as `recipy-cache`.

**Why this enables the future search path:**

Once `recipy-list` has a meaningful corpus (a few hundred recipes across common filter combinations), the search path can prefer library hits over Anthropic calls. Spec §7.2 will gain a third cache layer between `recipy-cache` (filter-keyed) and Anthropic (fresh fetch): `recipy-list` query by tags. Not in M3 scope — deferred. M3 only writes the library; reading from it for search comes later.

---

## 4. Recovery flows

The "Something looks wrong?" sheet is a bottom-sheet modal with five preset rows, each with a chevron. No free-text field. Cancel returns to Recipe unchanged.

| Reason | Recovery |
|---|---|
| Steps don't match this dish | Calls `/api/find-alternate-source` to refetch the dish from a different URL. Swaps the recipe in place. |
| Ingredients look wrong | Same as above. |
| Calorie count is off | Calls `/api/recompute-field` with `field: "calories"`. Updates the kcal cell in place; shows a toast. |
| Time is way off | Calls `/api/recompute-field` with `field: "time"`. Re-splits the new total proportionally into prep + cook. |
| Just not what I want | Returns to Results so she can pick a different card. No fetch — uses the cached batch. |

All five also fire a fire-and-forget `/api/feedback` event for the M6 source quality signal.

The inline **Find different recipe** link on the Recipe tab is the same flow as the first two reasons, fired explicitly rather than via the kebab. Calls `/api/find-alternate-source` excluding the current URL, holds onto the prior recipe as `previousVersion` (cap of one level deep), and replaces the slot in `lastSearch.recipes` so back nav reflects the swap.

---

## 5. Design language

Warm, clean, kitchen-friendly. The vibe is "trusted home recipe book" not "tech startup."

### Tokens

Tailwind v4 `@theme` block in `src/styles/index.css`:

| Token | Purpose | Example |
|---|---|---|
| `paper` / `paper-soft` | Backgrounds | The main canvas. Subtle warm white. |
| `ink` / `ink-muted` / `ink-disabled` | Text | Body, secondary, disabled. |
| `accent` | Brand orange | Primary buttons, active chips, progress fills, regenerate icon. |
| `success` | Green | Reserved for "available on Instamart" rows (M5). |
| `warning` | Amber | Make-ahead nudges, missing-ingredient state. |
| `line` | Hairlines | 1px borders, dividers, top-bar hairline. |

### Typography

| Size class | Use |
|---|---|
| `text-title` | Page titles (H1 on Recipe, card titles). |
| `text-section` | Section headers. |
| `text-strong` | Emphasised labels (in-bar title, button text). |
| `text-body` | Body copy. |
| `text-caption` | Meta lines, secondary text. |

`Inter` for sans-serif; system fallback. Headings in 500 weight, body in 400. Sentence case everywhere — never ALL CAPS, never Title Case. Tone: friendly without being twee.

- "What are we cooking today?" not "Welcome back, chef!"
- "Find recipes" not "Discover deliciousness."
- "Something looks wrong?" not "Help us improve."

### Layout

Breakpoints are Tailwind defaults: `md` 768 / `lg` 1024 / `xl` 1280. Apply via responsive prefixes inside existing components — no parallel desktop tree.

| Breakpoint | Form | Results | Recipe |
|---|---|---|---|
| `< md` (phone) | `max-w-md`, 1-up chips, sticky bottom CTA | `max-w-md`, 1-up cards | Single column, sticky bottom CTA, in-bar tab swap |
| `md` (tablet) | `max-w-[1100px]`, 2-up chips, CTA moves into header | `max-w-[1100px]`, 2-up cards | Same as phone, wider margins, larger loader/illustrations |
| `lg` (desktop) | 3-up chips | 3-up cards | 1:3 sticky-left grid at `max-w-[1280px]`: aside (action row · identity · stats · make-ahead · inline CTA) + right column (sticky frosted tabs · tab content). Stats reflow 4×1 → 2×2 |

Other constants:

- Safe-area aware: every sticky top bar uses `paddingTop: max(env(safe-area-inset-top), 8px)`; sticky bottom CTAs use `paddingBottom: max(env(safe-area-inset-bottom), 16px)`.
- Tap targets: minimum 44 × 44 px (Apple HIG). Chips that fall short get extra padding.
- Border radius: 8 px standard (`rounded-card`), 999 px for pills (`rounded-button`).
- PWA `display_override: ["window-controls-overlay", "standalone"]` so the installed app on desktop opens chromeless.

### Unit display rounding

`scaling.ts` handles the rendering:

| Quantity | Display |
|---|---|
| Integer | `3 tomatoes` |
| Within 0.04 of a common fraction (¼, ⅓, ½, ⅔, ¾) | `1½ tsp` |
| Otherwise | One decimal: `1.3 tsp` |
| Volumes under 0.25 tsp | `a pinch` |

### Icons

- `lucide-react` for general UI (ArrowLeft, Share2, MoreVertical, ChefHat, Clock, Flame, Users, Zap, CheckCircle2, ShoppingCart).
- `@hugeicons/react` (free icons set) for equipment — wider coverage of kitchen-specific items than Lucide.
- Outline style only. 14–20 px sizes; never larger than 24 px outside the loader illustrations.

---

## 6. Data model

The canonical `Recipe` shape. Source of truth lives in `src/lib/types.ts` (frontend) and `functions/src/validation.ts` (backend zod). Both must agree. Validation happens server-side before any response leaves the function.

```ts
type Recipe = {
  id: string;                               // backend-assigned per response
  source: {
    url: string;
    siteName: string;                       // "archanaskitchen.com"
    imageUrl: string | null;                // null in v1 (frontend doesn't display)
    fetchedAt: string;                      // ISO
  };
  title: string;
  tagline: string;                          // one sentence, max 12 words
  servings: { base: number; current: number };
  times: { prepMinutes: number; cookMinutes: number; totalMinutes: number };
  difficulty: {
    score: 1 | 2 | 3 | 4;
    label: "effortless"
         | "needs a bit of focus"
         | "weekend project"
         | "advanced";
  };
  calories: { perServing: number; inferenceSource: "page" | "estimated" };
  equipment: string[];                      // only NON-baseline items
  makeAhead: string | null;
  dietFlags: string[];                      // ["contains dairy", "vegetarian"]
  pairsWith: string[] | null;
  whyPicked: string[];                      // ["30m", "comforting", "vegetarian"] — short tags
  ingredients: Ingredient[];
  steps: Step[];
  previousVersion?: Recipe;                 // client-side only; set by Find alternate
                                            // capped at one level deep
};

type Ingredient = {
  name: string;
  quantity: number;
  unit: string | null;                      // "tsp" | "cup" | "g" | "ml" | "tbsp" | null
  group: string | null;                     // "For the tempering" — sub-section header if any
  instamart: {
    available: boolean;                     // true unless classification === "specialty"
    productId: string | null;               // null in v1 heuristic mode
    price: number | null;                   // null in v1 heuristic mode
    classification: "pantry-staple" | "likely-available" | "specialty";
  };
};

type Step = {
  number: number;                           // 1-indexed
  text: string;
  timerSeconds: number | null;              // parsed duration if step has explicit time
};
```

### Difficulty levels — what each one means

Tightened during the M2.1 refactor when Claude was over-using the middle level. The prompt now requires honest picks:

| Score | Label | When to use |
|---|---|---|
| 1 | `effortless` | No real cooking — assemble, microwave, no-cook. Total time ≤ 15 min, single technique or none. |
| 2 | `needs a bit of focus` | Typical home cooking — sauté + simmer, bake. One or two techniques. 20–60 min total. The common case, but should NOT be the default. |
| 3 | `weekend project` | Multi-stage or 60+ min active time. Multiple components, requires planning. |
| 4 | `advanced` | Real technique — lamination, fermentation, tempering chocolate, sourdough, deboning. Rare. |

---

## 7. Performance & reliability

- **Time-to-first-recipe-card** under 4 s on a typical 4G connection. The NDJSON stream emits the first recipe as soon as its closing brace lands; subsequent recipes trickle in over the next ~5 s.
- **Aggressive frontend caching.** Vite hashes assets; `Cache-Control: immutable` on `/assets/**` (see `firebase.json`).
- **Backend cache.** Two-layer: in-memory Map inside the function instance + Firestore in the `recipy-cache` named DB. TTL is 7 days. Identical filter combos hit memory in single-digit ms; Firestore hit on cold-start in ~20 ms. Cache misses go to Anthropic.
- **Per-IP rate limit on Cloud Functions.** `express-rate-limit` v8 with `app.set("trust proxy", 1)`. 10 req/min on every POST endpoint, 30 req/min on `/api/health`. Per-route — each endpoint has its own bucket so a search doesn't compete with a feedback submit. Returns `429` with `RateLimit-*` headers (IETF draft-7) when exceeded.
- **Error boundaries** on every screen — never show a white screen of death. Render a friendly recovery card with a "Try again" button that retriggers the last request.
- **iOS Safari private mode degrades gracefully.** `localStorage.setItem` throwing does not crash the app; an in-memory Map fallback covers the session.

See [`architecture.md`](./architecture.md) for the full performance picture and per-call costs.

---

## 8. M3 hooks already in place + V2 backlog

V1 ships through M2.6.1 with device-local persistence and the auth/account layer arriving in M3. Several seams already exist so M3 is filling stubs, not architecting from scratch:

1. **`useUserContext()` hook** (`src/hooks/useUserContext.tsx`) — returns an empty context today. **M3 wires this to `auth.currentUser` + `users/{uid}` doc.** Components already read from this hook.
2. **`<UserContextProvider>`** — wraps the app in `App.tsx`. No-op today; **M3 populates** with the live user object.
3. **`/api/feedback`** — already in v1. Every event is logged today, even though v1 doesn't read them back. M6's source quality signal will train on this stream.
4. **Storage adapter** — `src/lib/storage.ts` is the single entry point for non-store persistence. **M3 layers Firestore on top** for the slices that should sync (preferences, custom chips, saved recipes); cooking-state / recents stay local-only.
5. **Recipe-detail action slots** — header has room for the heart "Save" button. **M3 unhides it** alongside Firebase Auth being live.
6. **Cooking-mode `onCookComplete(recipe)` hook** — M4 wires the no-op; V2 connects it to a "how did it turn out?" prompt.

### V2 backlog (do not build before V2)

- Memory deepening beyond M3 prefs: cooked-before flag, dislikes, pantry memory, personal notes per recipe.
- "How did it turn out?" feedback prompt after a completed cook.
- Voice cooking mode: reads steps aloud, advances on "next" or tap-anywhere.
- Active vs passive time distinction in metrics.
- Combined-cart weekly meal planning.
- Inline tips per step in cooking mode.
- Service-worker offline cache for the app shell (broader than M4's `localStorage`-only offline cooking).
- Source quality signal — Claude tags trusted sources, learned from v1's feedback stream.
- Regional variation toggle — same dish, different regional style.
- Recipe comparison view — uses the `previousVersion` data v1 is already collecting.
- Multi-user / sharing: invite household members to share saved recipes + history.

---

## 9. Things explicitly NOT in v1

So nobody adds them by accident:

- User accounts, login, or any form of identity
- Saved favourites, cooking history, dislikes, or notes (state is persisted for resilience, not personalisation)
- Allergy/diet memory (no settings page exists)
- Cross-device sync (single device only)
- Voice mode in cooking
- Step images
- Step tips inline
- Active vs passive time labels
- Meal planning across multiple recipes
- Service-worker offline mode for cold loads
- Multi-user / sharing
- The "authentic vs accessible" axis
- Regional variation toggle
- Saved recipes / Library

These belong to v2 or v3. V1 ships fast and simple.

---

## 10. Instamart integration

Two paths. Path B (heuristic) ships in v1 because the MCP server's auth model isn't yet portable to a server-to-server API call.

**Path A (preferred, when authentication is resolved):** the Cloud Function calls Anthropic with the Instamart MCP server attached via `mcp_servers`, scoped to the Royal Legend address. The model uses Instamart tools to check availability per ingredient and add to cart.

**Path B (fallback, v1):** the search prompt already instructs Claude to classify each ingredient as `pantry-staple` / `likely-available` / `specialty` based on commonness in Indian kirana + supermarket retail. The Ingredients tab uses these classifications to drive the Check Instamart panel. The Add-to-cart CTA opens a search URL on instamart.com prefilled with the items rather than auto-adding to cart (M5).

The frontend never branches on which path is active — both return the same response shape from `/api/check-instamart` and `/api/add-to-instamart`. The backend has an `INSTAMART_MODE` env var (`"mcp" | "heuristic"`); ship in `heuristic`, flip to `mcp` once auth is sorted (post-v1).

---

## 11. Acceptance criteria for v1 sign-off

The build is done when every one of these is true in production:

### Form

1. Loading `/` opens Form. No keyboard appears (custom-chip text field only opens on explicit tap of the `+` affordance).
2. Tapping any chip selects it visually. Tapping again deselects.
3. Filter selections survive back-from-Results without re-entering them.
4. **Find recipes** with no chips returns three results. With any combination, results visibly match the filters.

### Results

5. Loader shows for at least 600 ms on Find Recipes, regardless of cache state.
6. Cache hit on identical filters shows the loader briefly, then renders cards instantly — no API call (verify in network tab).
7. Each card shows: title, prep + cook in minutes, kcal per serving.
8. Back from Recipe to Results shows the same cards — no re-fetch, no "anything goes" empty state.
9. Regenerate icon swaps the batch with a new fetch and shows a "New recipes found!" toast.
10. Empty state ("Nothing great came back") renders only when the API legitimately returns zero results.

### Recipe

11. Tapping a card opens the Recipe page with every section from §3.3 rendered (or correctly omitted per the rules).
12. Source attribution opens the original recipe URL in a new tab.
13. **Find alternate recipe** swaps the page content with a new recipe from a different source. URL rewrites to the new id. Back to Results shows the alternate in the card.
14. The alternate carries a "compare with previous recipe" link (M2-only UI; comparison view itself is M4).
15. Tab switches slide directionally and never collapse the page or bounce scroll.
16. Sticky CTA shrinks to a ChefHat FAB on scroll-down past 200 px and expands back on 30% viewport-height of scroll-up.
17. Servings adjuster scales ingredient quantities live. Calories and times do not change.
18. Substitute on an ingredient rewrites the corresponding step text via word-boundary regex with case preserved.
19. Check Instamart panel surfaces correctly with the heuristic classification.
20. **Add to cart** opens Instamart in a new tab with the missing items pre-queued at Royal Legend.
21. All of the "Something looks wrong?" reasons fire their recovery flow and a feedback event.

### Accounts & saving (M3)

22. **Splash gates the app.** A user with no auth state lands on the splash. Form / Results / Recipe / Cooking are all unreachable until Google sign-in completes.
23. **Persistent session.** Sign in once. Close the tab. Reopen the site. No re-prompt. Quit the browser, reboot the phone. Still no re-prompt.
24. **First-time bootstrap.** On a brand-new sign-in, a `users/{uid}` document appears in `recipy-users` with `displayName`, `email`, `photoURL`, `createdAt`, and an empty `preferences` object. Visible in Firestore console.
25. **Drawer opens on every screen except Cooking.** Hamburger top-left, tap → drawer slides in. Profile photo + name at top, sign-out at bottom.
26. **Sign-out returns to splash.** Tap Sign out in the drawer, confirm. Auth state clears, splash re-mounts.
27. **Heart saves a recipe.** Tap the outlined heart on the Recipe page. It fills (accent colour). A doc appears at `users/{uid}/saved/{recipeId}` with title + siteName + savedAt.
28. **Saved list survives reload.** Reload the app. Saved page shows the recipe in reverse-chronological order.
29. **Cross-device sync.** Save a recipe on device A. Sign in on device B. The Saved list shows the same recipe within seconds.
30. **Preference auto-save.** Toggle a diet chip on Preferences. The change writes to Firestore immediately (network tab confirms). No explicit Save button.
31. **Custom chips sync.** Add "Korean" to Cuisines on Form (device A). Sign in on device B. The Cuisines group shows "Korean" as a custom chip.
32. **Allergies bias the search.** Add "peanuts" to Preferences → Allergies. Run a search. The system prompt includes "avoid ingredients containing peanuts" (verify in Cloud Run logs).
33. **`recipy-list` populates.** After one successful search, the recipes returned appear as documents in `recipy-list/recipes/` keyed by URL hash, with `addedAt` and `schemaVersion: 1`. Same search from a different account: existing docs get their `lastSeenAt` updated (no duplicates).
34. **Firestore rules enforce ownership.** Attempt to read `users/<other-uid>/saved` from your own account in DevTools console. Result: `permission-denied`.
35. **Offline read.** Sign in once. Go offline. Reload the app. Splash skips (cached auth), saved recipes list renders from Firestore's offline cache.

### Cooking (M4)

36. Start cooking enters cooking mode. The screen does not sleep while open (verify on a real phone).
37. **Wake lock recovers after backgrounding.** Switch to YouTube for ≥30 s, return. Screen stays awake again.
38. **Tab-kill resilience.** Force-close at step 4. Reopen the site. Resume banner shows "Step 4 of N"; Resume jumps back to step 4 in cooking mode.
39. **Cooking mode works offline.** With cooking open, turn off wifi and mobile data. Every step (next, previous, timer) still works. No spinner, no error.
40. **Timer alert is multi-channel.** Timer hits 0:00 with app backgrounded: phone vibrates AND system notification fires (if permission granted). Visual flash and audio chime fire when foregrounded.
41. **Notifications permission asked once.** Inline card on first cook. Allow stores the result; Not now suppresses for 30 days. No native popup before the inline card.
42. Done — well cooked clears the cooking state and returns to Recipe.
43. **In-progress state expires after 7 days.** A cook started >7 days ago doesn't show a resume banner.

### Cross-cutting

44. All numbers shown are integers or sensibly rounded — no float artifacts.
45. Site loads under 3 s on a Pixel-class phone over 4G.
46. The Anthropic API key is not in the client bundle (`grep -r "sk-ant" dist/` returns nothing).
47. Cloud Function rejects requests without a valid App Check token (`401`/`403` as appropriate).
48. CORS allowlist enforced — random origins return `403 Origin not allowed`.
49. Works on a 380 px-wide viewport in portrait, landscape, and desktop.
50. iOS Safari private mode degrades gracefully (in-memory fallback for storage).

---

**End of v1 spec.** This document is the product contract. If a decision is unclear, default to the prime directives in §1. If a section feels stale, fix it in the same PR as the code change — don't let docs drift.
