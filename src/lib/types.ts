// Mirror of spec §9 — the data contract between backend and frontend.
// Any backend response is validated against this shape before reaching components.

export type Recipe = {
  id: string;
  source: {
    url: string;
    siteName: string;
    imageUrl: string | null;            // M4: rendered as hero when non-null
    fetchedAt: string; // ISO
  };
  title: string;
  tagline: string;
  // M4: YouTube / Vimeo embed URL when the source page has one. Null hides
  // the entire video slot on the Recipe page.
  videoUrl: string | null;
  // M4: dish shape(s) — "salad", "smoothie", "bowl", etc. Free-form strings
  // so old data parses and Anthropic can return shapes outside our chip
  // presets. Empty array means "none specified."
  dishType: string[];
  servings: {
    base: number;
    current: number;
  };
  times: {
    prepMinutes: number;
    cookMinutes: number;
    totalMinutes: number;
  };
  difficulty: {
    score: 1 | 2 | 3 | 4;
    label:
      | "effortless"
      | "needs a bit of focus"
      | "weekend project"
      | "advanced";
  };
  calories: {
    perServing: number;
    inferenceSource: "page" | "estimated";
  };
  // M4: per-serving protein in grams. Null on pre-M4 cached / library data;
  // the Recipe page shows "—" in that cell.
  protein: {
    perServingGrams: number;
    inferenceSource: "page" | "estimated";
  } | null;
  equipment: string[];
  makeAhead: string | null;
  dietFlags: string[];
  pairsWith: string[] | null;
  whyPicked: string[];
  ingredients: Ingredient[];
  steps: Step[];
  // M4: stack of prior versions, most-recent first. Capped at 3 entries.
  // Each "Find different recipe" tap pushes the displaced recipe here.
  // Always omitted from API responses; populated client-side only.
  previousVersions?: Recipe[];
};

export type Ingredient = {
  name: string;
  quantity: number;
  unit: string | null;
  group: string | null;
  instamart: {
    available: boolean;
    productId: string | null;
    price: number | null;
    classification: "pantry-staple" | "likely-available" | "specialty";
  };
};

export type Step = {
  number: number;
  text: string;
  timerSeconds: number | null;
};

// ----- Persistence shapes (localStorage values, spec §7.9) -----

export type ActiveRecipe = {
  recipe: Recipe;
  source: "search" | "alternate" | "resumed";
  openedAt: string; // ISO
};

export type CookingState = {
  recipeId: string;
  currentStep: number; // 1-indexed
  totalSteps: number;
  timer: TimerState | null;
  startedAt: string; // ISO
  lastTouchedAt: string; // ISO
};

export type TimerState = {
  stepNumber: number;
  durationSeconds: number;
  startedAt: string; // ISO
  paused: boolean;
  pausedRemainingSeconds: number | null;
};

export type LastSearch = {
  filters: SearchFilters;
  recipes: Recipe[];
  fetchedAt: string; // ISO
};

export type NotificationsPrompt = {
  status: "allowed" | "denied" | "dismissed";
  promptedAt: string; // ISO
};

// ----- Form filter payload -----

export type Meal = "breakfast" | "lunch" | "dinner" | "snack" | "dessert";

export type Cuisine =
  | "south-indian"
  | "north-indian"
  | "chinese"
  | "italian"
  | "continental"
  | "thai"
  | "mexican"
  | "middle-eastern";

export type Diet =
  | "vegetarian"
  | "non-veg"
  | "eggless"
  | "vegan"
  | "jain";

// Two single-select time filters: prep (hands-on work) and cook (passive
// or active heat). "any" = user explicitly picked "No limit". null =
// user didn't touch the group. Backend treats "any" and null as the
// same (no constraint); the split is UI state so "No limit" can render
// as selected.
export type PrepMax = 5 | 15 | 30 | "any" | null;
export type CookMax = 15 | 30 | 60 | "any" | null;

export type Vibe =
  | "comforting"
  | "light"
  | "lighter"        // M4
  | "high-protein"   // M4
  | "spicy"
  | "one-pot"
  | "healthy"
  | "indulgent"
  | "impressive";

export type MainIngredient =
  | "chicken"
  | "paneer"
  | "fish"
  | "eggs"
  | "vegetables"
  | "pasta"
  | "rice"
  | "lentils"
  | "tofu";

// M4: dish-shape filter. Distinct from MainIngredient — "salad" + "chicken"
// surfaces chicken salads, "smoothie" + "fruit" surfaces fruit smoothies.
// Custom user-added entries get serialised as "custom:<value>" same as
// every other chip group.
export type DishType =
  | "curry"
  | "stir-fry"
  | "soup"
  | "salad"
  | "smoothie"
  | "bowl"
  | "sandwich"
  | "wrap"
  | "pasta"
  | "casserole"
  | "bake"
  | "roast"
  | "grill"
  | "pizza"
  | "pancake-dosa";

export type SearchFilters = {
  meal: Meal[];
  cuisines: Cuisine[];
  diet: Diet[];
  prepMax: PrepMax;
  cookMax: CookMax;
  vibes: Vibe[];
  mainIngredients: MainIngredient[];
  // M4: dish-shape multi-select.
  dishTypes: DishType[];
  // M4: soft "only recipes with a video" toggle.
  hasVideo: boolean;
  surprise?: boolean;
  // Set by "More like this" — biases the next search toward this dish.
  similarTo?: string;
};
