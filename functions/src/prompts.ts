// System and user prompts for Anthropic recipe search calls (spec §7.4).
//
// The system prompt instructs Claude to use web search, normalise results
// to our schema, and emit ONLY the JSON array — no markdown, no preamble.

import type { SearchFilters } from "./validation";

/** Spec §9 schema inlined into the system prompt so Claude knows the exact shape. */
const RECIPE_SCHEMA_DESCRIPTION = `
Each Recipe object MUST have these fields and types:
{
  "id": string,                              // any unique id; we'll re-id on the server
  "source": {
    "url": string,                           // canonical recipe page URL
    "siteName": string,                      // e.g. "archanaskitchen.com"
    "imageUrl": string | null,               // hero image from the source if available
    "fetchedAt": string                      // ISO timestamp
  },
  "title": string,                           // dish name
  "tagline": string,                         // one sentence, max 12 words
  "servings": { "base": number, "current": number },   // both equal at first
  "times": { "prepMinutes": number, "cookMinutes": number, "totalMinutes": number },
  "difficulty": {
    "score": 1 | 2 | 3 | 4 | 5,
    "label": "effortless" | "weeknight easy" | "needs a bit of focus" | "weekend project" | "advanced"
  },
  "calories": { "perServing": number, "inferenceSource": "page" | "estimated" },
  "equipment": string[],                     // only NON-baseline items; [] if all baseline
  "makeAhead": string | null,                // null if no lead time required
  "dietFlags": string[],                     // e.g. ["vegetarian", "contains dairy"]
  "pairsWith": string[] | null,              // null if standalone dish
  "whyPicked": string[],                     // short reasons matching the filters
  "ingredients": [
    {
      "name": string,
      "quantity": number,
      "unit": string | null,                 // "tsp", "cup", "g", "ml", "tbsp", null
      "group": string | null,                // sub-heading like "For the tempering"
      "instamart": {
        "available": boolean,                // true unless classification is "specialty"
        "productId": null,
        "price": null,
        "classification": "pantry-staple" | "likely-available" | "specialty"
      }
    }
  ],
  "steps": [
    { "number": number, "text": string, "timerSeconds": number | null }
  ]
}
`.trim();

export const SEARCH_SYSTEM_PROMPT = `
You are a recipe-finding assistant. Given filters, you search the web for exactly 3 real recipes that match, then normalise each into a strict JSON schema.

Rules:
- Search reputable recipe sites: archanaskitchen.com, hebbarskitchen.com, vegrecipesofindia.com, indianhealthyrecipes.com, seriouseats.com, bbcgoodfood.com, nytcooking.com, bonappetit.com, allrecipes.com.
- Every source URL you cite must be a real page you actually retrieved via web_search during THIS call. Do not cite a URL you have not fetched. If web_search returns fewer than 3 usable sources, return fewer than 3 recipes — never invent a URL to fill the array.
- Prefer dedicated single-recipe pages over roundup posts (e.g. "10 vegetarian breakfast ideas"). A roundup is only acceptable if it contains FULL ingredient quantities AND complete step-by-step instructions for the specific dish you're citing. If a roundup only has a paragraph summary, skip it.
- Do NOT invent recipes. If web search returns nothing matching, return an empty array.
- Each recipe must include a source URL that the user can open.
- Normalise quantities to a consistent unit per ingredient.
- Generate a one-sentence tagline (max 12 words) describing the dish.
- Infer a difficulty score (1–5) and a friendly label ("effortless", "weeknight easy", "needs a bit of focus", "weekend project", "advanced") from step count, technique vocabulary, and total time.
- Infer diet flags from the ingredient list: "contains dairy", "contains gluten", "vegetarian", "vegan", "eggless", "contains nuts", etc.
- Infer equipment from the steps. Only flag equipment OUTSIDE this baseline: oven, microwave, air fryer, 4-burner stove, hand blender, regular blender, hand mixer. Mention "kadhai" and "pressure cooker" only if they're genuinely required (no good substitute). Common pots/pans/knives are never flagged.
- Detect make-ahead steps: anything requiring more than 15 minutes of lead time before active cooking can begin (soaking, marinating, room-temp butter, dough rising). Emit one short sentence; null if not applicable.
- Detect "pairs well with" sides if the dish is conventionally served with accompaniments. Null if standalone.
- "whyPicked" is an array of 2-4 short tags (1-3 words each) derived from the user's active filters. Examples: ["30m", "comforting", "vegetarian"] or ["15m", "eggless", "breakfast"]. Never write full phrases like "total time under 15 minutes" or "South Indian cuisine" — those are too long. Strip filler words; surface the essence.
- For each ingredient, classify as pantry-staple, likely-available, or specialty based on commonness in Indian kirana/supermarket retail. Set instamart.available to true unless classification is "specialty", in which case false. productId and price are always null in this version.
- "imageUrl" in the source object MUST always be null. The frontend does not display images in v1. Do not waste effort finding image URLs and do not invent any — just emit null.
- For each step, parse any explicit duration (e.g. "simmer for 8 minutes") into timerSeconds; otherwise null. Round to nearest 30 seconds.
- Output ONLY the JSON array — no preamble, no explanation, no markdown fences, no commentary.
- Output COMPACT JSON (no extra whitespace, no pretty-printing). Keep step text under 200 characters each. Tagline under 12 words. Dietary flag list under 5 items.

Schema:
${RECIPE_SCHEMA_DESCRIPTION}
`.trim();

const MEAL_LABEL: Record<string, string> = {
  breakfast: "breakfast",
  lunch: "lunch",
  dinner: "dinner",
  snack: "snack",
  dessert: "dessert",
};

const CUISINE_LABEL: Record<string, string> = {
  "south-indian": "South Indian",
  "north-indian": "North Indian",
  chinese: "Chinese",
  italian: "Italian",
  continental: "Continental",
  thai: "Thai",
  mexican: "Mexican",
  "middle-eastern": "Middle Eastern",
};

const DIET_LABEL: Record<string, string> = {
  vegetarian: "vegetarian",
  "non-veg": "non-vegetarian",
  eggless: "eggless",
  vegan: "vegan",
  jain: "Jain (no onion/garlic)",
};

const VIBE_LABEL: Record<string, string> = {
  comforting: "comforting",
  light: "light",
  spicy: "spicy",
  "one-pot": "one-pot",
  healthy: "healthy",
  indulgent: "indulgent",
  impressive: "impressive",
};

function listOrAny(items: string[], label: (s: string) => string): string {
  if (items.length === 0) return "any";
  return items.map(label).join(", ");
}

/**
 * Build the user prompt for the recipe-search call. We translate the
 * compact filter payload into natural English Claude can search against.
 */
export function buildSearchUserPrompt(filters: SearchFilters): string {
  if (filters.surprise) {
    return [
      "Surprise me with exactly 3 well-rated, seasonal recipes from the reputable sites listed in the system prompt.",
      "Mix cuisines and meal types. Prefer recipes with strong reviews and clear, short steps.",
      "Return only the JSON array, matching the schema exactly.",
    ].join("\n");
  }

  const lines: string[] = [];
  lines.push("Find exactly 3 real recipes matching ALL of these filters:");
  lines.push(`- Meal: ${listOrAny(filters.meal, (s) => MEAL_LABEL[s] ?? s)}`);
  lines.push(`- Cuisine: ${listOrAny(filters.cuisines, (s) => CUISINE_LABEL[s] ?? s)}`);
  lines.push(`- Diet: ${listOrAny(filters.diet, (s) => DIET_LABEL[s] ?? s)}`);
  lines.push(
    `- Prep time: ${
      filters.prepMax === null
        ? "no constraint"
        : `under ${filters.prepMax} minutes`
    }`,
  );
  lines.push(
    `- Cook time: ${
      filters.cookMax === null
        ? "no constraint"
        : `under ${filters.cookMax} minutes`
    }`,
  );
  lines.push(`- Vibe: ${listOrAny(filters.vibes, (s) => VIBE_LABEL[s] ?? s)}`);
  lines.push(
    `- Main ingredient: ${
      filters.mainIngredients.length === 0
        ? "any"
        : filters.mainIngredients.join(", ")
    }`,
  );

  if (filters.similarTo) {
    lines.push("");
    lines.push(
      `Bias toward dishes similar in style or technique to: "${filters.similarTo}". Do not return the same dish.`,
    );
  }

  lines.push("");
  lines.push("Return only the JSON array, matching the schema exactly.");
  return lines.join("\n");
}

/** Build the user prompt for /api/find-alternate-source. */
export function buildAlternateSourcePrompt(
  dish: string,
  excludeUrls: string[],
): string {
  const exclusion =
    excludeUrls.length > 0
      ? `\n\nDo NOT use any of these URLs (we've already shown them):\n${excludeUrls.map((u) => `- ${u}`).join("\n")}`
      : "";
  return [
    `Find ONE real recipe for "${dish}" from a reputable site (system prompt lists the allowed domains).`,
    `Return a JSON array with exactly one Recipe in the schema — even though only one item, still an array.${exclusion}`,
  ].join("\n");
}

/** Build the user prompt for /api/recompute-field. */
export function buildRecomputePrompt(
  field: "calories" | "time",
  recipeTitle: string,
  ingredientsText: string,
  stepsText: string,
): string {
  if (field === "calories") {
    return [
      `Estimate kcal per serving for this dish: ${recipeTitle}`,
      "",
      "Ingredients (per the base servings):",
      ingredientsText,
      "",
      'Return ONLY a JSON object: { "value": <integer kcal per serving> }. No prose.',
    ].join("\n");
  }
  return [
    `Estimate the total time in minutes (prep + cook) for this dish: ${recipeTitle}`,
    "",
    "Steps:",
    stepsText,
    "",
    'Return ONLY a JSON object: { "value": <integer total minutes> }. No prose.',
  ].join("\n");
}

/** Build the user prompt for /api/get-substitutions. */
export function buildSubstitutionsPrompt(ingredientNames: string[]): string {
  return [
    "For each ingredient below, suggest 1–2 common substitutes with quantity equivalents.",
    "",
    ingredientNames.map((n) => `- ${n}`).join("\n"),
    "",
    "Return ONLY a JSON object mapping each ingredient name to an array of 1–2 short strings:",
    '{ "tamarind paste": ["2 tsp lemon juice per 1 tsp tamarind paste", "1 tbsp amchur"] }',
    "No prose, no markdown.",
  ].join("\n");
}
