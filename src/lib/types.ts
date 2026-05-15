// Mirror of spec §9 — the data contract between backend and frontend.
// Any backend response is validated against this shape before reaching components.

export type Recipe = {
  id: string;
  source: {
    url: string;
    siteName: string;
    imageUrl: string | null;
    fetchedAt: string; // ISO
  };
  title: string;
  tagline: string;
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
    score: 1 | 2 | 3 | 4 | 5;
    label:
      | "effortless"
      | "weeknight easy"
      | "needs a bit of focus"
      | "weekend project"
      | "advanced";
  };
  calories: {
    perServing: number;
    inferenceSource: "page" | "estimated";
  };
  equipment: string[];
  makeAhead: string | null;
  dietFlags: string[];
  pairsWith: string[] | null;
  whyPicked: string[];
  ingredients: Ingredient[];
  steps: Step[];
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

// 15/30/60 = explicit cap. "any" = user explicitly picked "No limit".
// null = user didn't touch the chip group. Backend treats "any" and null
// the same way (no time constraint); the distinction is purely UI state
// so the "No limit" chip can render as selected.
export type TimeMax = 15 | 30 | 60 | "any" | null;

export type Vibe =
  | "comforting"
  | "light"
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

export type SearchFilters = {
  meal: Meal[];
  cuisines: Cuisine[];
  diet: Diet[];
  timeMax: TimeMax;
  vibes: Vibe[];
  mainIngredients: MainIngredient[];
  surprise?: boolean;
  // Set by "More like this" — biases the next search toward this dish.
  similarTo?: string;
};
