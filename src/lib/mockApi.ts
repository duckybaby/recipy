// Local-dev mock API.
//
// When VITE_USE_MOCKS=true (set in .env.local), src/lib/api.ts dispatches
// to this module instead of calling fetch. Lets us iterate on UI work
// without burning Anthropic credits.
//
// The shape MUST match the real api object in api.ts. If you add a new
// endpoint there, mirror it here too — typescript will catch the gap.

import { MOCK_RECIPES } from "./mockRecipes";
import type { Recipe, SearchFilters, Ingredient } from "./types";

// Simulated network/streaming delays so the loading state still triggers
// and progress copy still cycles a bit — keeps the dev experience
// faithful to production behaviour.
const FIRST_RECIPE_DELAY_MS = 600;
const BETWEEN_RECIPE_DELAY_MS = 400;
const RECOMPUTE_DELAY_MS = 800;
const SUBSTITUTIONS_DELAY_MS = 1000;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Return a fresh copy of the mock recipes with new IDs each call. */
function freshMockRecipes(): Recipe[] {
  return MOCK_RECIPES.map((r, i) => ({
    ...r,
    id: `${r.id}-${Date.now()}-${i}`,
  }));
}

async function searchRecipesStream(
  _filters: SearchFilters,
  onRecipe: (recipe: Recipe) => void,
  signal?: AbortSignal,
): Promise<{ recipes: Recipe[]; cached: boolean }> {
  const recipes = freshMockRecipes();
  const out: Recipe[] = [];

  // Stream them in, one at a time, with cancellation respected.
  for (let i = 0; i < recipes.length; i++) {
    const delay = i === 0 ? FIRST_RECIPE_DELAY_MS : BETWEEN_RECIPE_DELAY_MS;
    await wait(delay);
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    out.push(recipes[i]);
    onRecipe(recipes[i]);
  }
  return { recipes: out, cached: false };
}

async function findAlternateSource(
  dish: string,
  excludeUrls: string[],
): Promise<{ recipe: Recipe }> {
  await wait(800);
  // Pick a mock different from the excluded URLs (best effort).
  const candidates = freshMockRecipes().filter(
    (r) => !excludeUrls.includes(r.source.url),
  );
  const pick = candidates[0] ?? freshMockRecipes()[0];
  return {
    recipe: {
      ...pick,
      title: `${pick.title} (alternate version) — ${dish}`,
      source: {
        ...pick.source,
        siteName: "hebbarskitchen.com",
        url: "https://www.hebbarskitchen.com/alternate-mock",
      },
    },
  };
}

async function recomputeField(
  _recipe: Recipe,
  field: "calories" | "time",
): Promise<{ value: number }> {
  await wait(RECOMPUTE_DELAY_MS);
  return { value: field === "calories" ? 310 : 35 };
}

async function getSubstitutions(
  ingredients: Ingredient[],
): Promise<{ substitutions: Record<string, string[]> }> {
  await wait(SUBSTITUTIONS_DELAY_MS);
  const subs: Record<string, string[]> = {};
  for (const ing of ingredients.slice(0, 5)) {
    // Canned but plausible substitutions.
    if (/tamarind/i.test(ing.name)) {
      subs[ing.name] = ["2 tsp lemon juice per 1 tsp tamarind paste", "1 tbsp amchur powder"];
    } else if (/tomato/i.test(ing.name)) {
      subs[ing.name] = ["1 tbsp tomato paste + 2 tbsp water per medium tomato"];
    } else if (/paneer/i.test(ing.name)) {
      subs[ing.name] = ["Firm tofu, pressed, same weight", "Halloumi for grilled dishes"];
    } else if (/curry leaves/i.test(ing.name)) {
      subs[ing.name] = ["Skip — no good substitute. Bay leaf adds different note."];
    } else {
      subs[ing.name] = [`Use any neutral substitute appropriate for ${ing.name}.`];
    }
  }
  return { substitutions: subs };
}

async function feedback(
  _recipeId: string,
  _reason: string,
): Promise<{ ok: true }> {
  await wait(150);
  return { ok: true };
}

async function checkInstamart(): Promise<{
  availability: Record<
    string,
    { available: boolean; productId?: string; price?: number }
  >;
}> {
  await wait(200);
  return { availability: {} };
}

async function addToInstamart(): Promise<{
  cartUrl: string;
  addedCount: number;
}> {
  await wait(200);
  return {
    cartUrl: "https://www.swiggy.com/instamart",
    addedCount: 0,
  };
}

export const mockApi = {
  searchRecipes: searchRecipesStream,
  findAlternateSource,
  recomputeField,
  getSubstitutions,
  checkInstamart,
  addToInstamart,
  feedback,
};
