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
    "imageUrl": string | null,               // direct URL to the hero image on the source page; null if none
    "fetchedAt": string                      // ISO timestamp
  },
  "title": string,                           // dish name
  "tagline": string,                         // one sentence, max 12 words
  "videoUrl": string | null,                 // YouTube/Vimeo embed URL if the page has one; null otherwise
  "dishType": string[],                      // dish-shape tags from the canonical list (see rules); [] if none fit
  "servings": { "base": number, "current": number },   // both equal at first
  "times": { "prepMinutes": number, "cookMinutes": number, "totalMinutes": number },
  "difficulty": {
    "score": 1 | 2 | 3 | 4,                      // MUST match the label below
    "label": "effortless" | "needs a bit of focus" | "weekend project" | "advanced"   // exact strings, no synonyms
  },
  "calories": { "perServing": number, "inferenceSource": "page" | "estimated" },
  "protein": { "perServingGrams": number, "inferenceSource": "page" | "estimated" } | null,   // per-serving protein in grams; null only if you genuinely cannot estimate
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
- Search reputable recipe sites broadly across global cuisines. Excellent starting points (no order preference): seriouseats.com, bbcgoodfood.com, nytcooking.com, bonappetit.com, allrecipes.com, food52.com, simplyrecipes.com, themediterraneandish.com, eatingwell.com, minimalistbaker.com, downshiftology.com, loveandlemons.com, ambitiouskitchen.com, archanaskitchen.com, hebbarskitchen.com, vegrecipesofindia.com, indianhealthyrecipes.com. Any other reputable recipe site is also fine — these are just good defaults. Pick the right source for the dish (Italian sources for pasta, Thai sources for curry, Indian sources for dal). Don't default to any one regional cuisine when the user hasn't specified one.
- Be GENEROUS in what counts as a usable source. A page is usable if it has a clear ingredient list with quantities and step-by-step instructions that get you to the dish. It doesn't need to be on a famous site. Skip only obvious filler: ad-heavy listicles with no recipe details, AI-generated blog spam, pages that just describe a dish without making it.
- Every source URL you cite must be a real page you actually retrieved via web_search during THIS call. Do not cite a URL you have not fetched. Do not invent URLs.
- ALWAYS return what you found. If web_search surfaces 3 usable pages, return 3 recipes. If it surfaces 2, return 2. If it surfaces 1, return 1. Returning an empty array is reserved for the rare case where the search genuinely turns up nothing usable (extremely narrow filter combinations). For a broad query like "healthy desserts" or "comforting dinner", you should almost always find at least 2.
- Roundup posts (e.g. "10 healthy dessert ideas") are usable as long as the recipe you cite is COMPLETE inside that page — full ingredient list with quantities and step-by-step instructions, not just a paragraph summary. Plenty of high-quality recipe sites publish full recipes inside themed roundups; don't skip them on principle.
- If your first web_search returns mostly filler or limited results, run another search with a different angle (e.g. specific named dishes like "chocolate avocado mousse" rather than just "healthy desserts").
- Each recipe must include a source URL that the user can open.
- Normalise quantities to a consistent unit per ingredient.
- Generate a one-sentence tagline (max 12 words) describing the dish.
- Infer difficulty as one of EXACTLY these 4 levels. The label must be a verbatim string from the list — no synonyms, no other labels. Score must match the label.
  • { "score": 1, "label": "effortless" } — no real cooking. Assemble, microwave, no-cook. ≤15 min total.
  • { "score": 2, "label": "needs a bit of focus" } — typical home cooking with one or two techniques (sauté + simmer, bake, fry). 20–60 min. This is the common case.
  • { "score": 3, "label": "weekend project" } — multi-stage or 60+ min active time. Multiple components or a step that demands sustained attention.
  • { "score": 4, "label": "advanced" } — specialty technique: lamination, fermentation, tempering, sourdough starter, deboning. Rare.
  Never output "weeknight easy", "easy", "intermediate", "simple", or any other label — those will be rejected.
- Infer diet flags from the ingredient list: "contains dairy", "contains gluten", "vegetarian", "vegan", "eggless", "contains nuts", etc.
- Infer equipment from the steps. Only flag equipment OUTSIDE this baseline: oven, microwave, air fryer, 4-burner stove, hand blender, regular blender, hand mixer. Mention "kadhai" and "pressure cooker" only if they're genuinely required (no good substitute). Common pots/pans/knives are never flagged.
- Detect make-ahead steps: anything requiring more than 15 minutes of lead time before active cooking can begin (soaking, marinating, room-temp butter, dough rising). Emit one short sentence; null if not applicable.
- Detect "pairs well with" sides if the dish is conventionally served with accompaniments. Null if standalone.
- "whyPicked" is an array of 2-4 short tags (1-3 words each) derived from the user's active filters. Examples: ["30m", "comforting", "vegetarian"] or ["15m", "eggless", "breakfast"]. Never write full phrases like "total time under 15 minutes" or "South Indian cuisine" — those are too long. Strip filler words; surface the essence.
- For each ingredient, classify as pantry-staple, likely-available, or specialty. This is purely a delivery-availability hint for Instamart (a major Indian grocery delivery service), NOT a hint about what cuisines to favour. Use commonness in modern urban Indian retail (chain supermarkets + neighbourhood stores) as the yardstick. Set instamart.available to true unless classification is "specialty", in which case false. productId and price are always null in this version.
- "imageUrl" in the source object: emit the direct URL of the recipe's hero image from the source page when one exists. It must be a real, fully-qualified https URL you actually saw on the page during web_search — do NOT invent URLs and do NOT use placeholder / CDN tracking URLs that won't resolve standalone. Emit null when the page genuinely has no hero image. The frontend renders it as the recipe's lead visual.
- "videoUrl": emit the canonical embed URL of a YouTube or Vimeo video the source page has embedded (e.g. https://www.youtube.com/embed/<id> or https://player.vimeo.com/video/<id>). Watch / share URLs are acceptable too — the frontend converts to the embed form. Emit null when the source page has no embedded video. Do not search YouTube to find an unrelated cooking video — the field is for videos the source page itself hosts or embeds.
- "dishType": tag the dish with one or more shapes from this list when they clearly apply: ["curry", "stir-fry", "soup", "salad", "smoothie", "bowl", "sandwich", "wrap", "pasta", "casserole", "bake", "roast", "grill", "pizza", "pancake-dosa"]. Multiple tags are OK ("bowl" + "salad" for grain bowls, "bake" + "casserole" for a pasta bake). Emit [] when none fit (e.g. for a plain protein cooked solo).
- "protein": estimate grams of protein per serving from the ingredients (eggs ~6g each, paneer ~18g per 100g, chicken breast ~30g per 100g, lentils cooked ~9g per 100g, etc.). inferenceSource = "page" if the source explicitly lists it, "estimated" otherwise. Always emit a number — only emit null if the ingredient list is genuinely too vague (rare).
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
  // M4 health-intent chips. Translated to descriptive phrases the search
  // prompt can act on rather than dropped in as bare vibes.
  lighter: "lighter (lower-calorie, smaller-portion approach)",
  "high-protein": "high protein (aim for at least 25 g of protein per serving)",
  spicy: "spicy",
  "one-pot": "one-pot",
  healthy: "healthy",
  indulgent: "indulgent",
  impressive: "impressive",
};

// M4: dish-shape labels for the prompt. Mirrors filterOptions.ts on the
// frontend. Custom user-added dish types ("custom:..." prefix) are
// resolved by `resolveLabel` and pass through as plain text.
const DISH_TYPE_LABEL: Record<string, string> = {
  curry: "curry",
  "stir-fry": "stir-fry",
  soup: "soup",
  salad: "salad",
  smoothie: "smoothie",
  bowl: "bowl",
  sandwich: "sandwich",
  wrap: "wrap",
  pasta: "pasta",
  casserole: "casserole",
  bake: "bake",
  roast: "roast",
  grill: "grill",
  pizza: "pizza",
  "pancake-dosa": "pancake or dosa",
};

/** Resolve a filter value to natural language for the prompt. Canonical
 *  enum values use the LABEL map; user-added "custom:high protein" entries
 *  drop the prefix so Claude sees plain "high protein". Falls back to the
 *  raw value otherwise. */
function resolveLabel(
  value: string,
  labels: Record<string, string>,
): string {
  if (value.startsWith("custom:")) return value.slice("custom:".length);
  return labels[value] ?? value;
}

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
      "Pick exactly 3 well-rated recipes for a surprise selection.",
      "CRITICAL: each recipe must come from a different culinary tradition. No two recipes from the same cuisine. Spread across continents — e.g. one Italian + one Thai + one Mexican, or one French + one Japanese + one Indian. Examples of distinct traditions: Italian, French, Spanish, Greek, Mexican, Peruvian, American Southern, Cajun, Middle Eastern, North African, Ethiopian, Turkish, Lebanese, North Indian, South Indian, Chinese, Japanese, Korean, Thai, Vietnamese, Indonesian. Do not return three Indian recipes.",
      "Prefer recipes with strong reviews and clear, short steps. Mix meal types too (e.g. one main, one snack, one breakfast).",
      "Return only the JSON array, matching the schema exactly.",
    ].join("\n");
  }

  const lines: string[] = [];
  lines.push("Find exactly 3 real recipes matching ALL of these filters:");
  lines.push(`- Meal: ${listOrAny(filters.meal, (s) => resolveLabel(s, MEAL_LABEL))}`);
  lines.push(`- Cuisine: ${listOrAny(filters.cuisines, (s) => resolveLabel(s, CUISINE_LABEL))}`);
  lines.push(`- Diet: ${listOrAny(filters.diet, (s) => resolveLabel(s, DIET_LABEL))}`);
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
  lines.push(`- Vibe: ${listOrAny(filters.vibes, (s) => resolveLabel(s, VIBE_LABEL))}`);
  lines.push(
    `- Main ingredient: ${
      filters.mainIngredients.length === 0
        ? "any"
        : filters.mainIngredients
            .map((s) => (s.startsWith("custom:") ? s.slice("custom:".length) : s))
            .join(", ")
    }`,
  );
  lines.push(
    `- Dish type: ${listOrAny(filters.dishTypes ?? [], (s) =>
      resolveLabel(s, DISH_TYPE_LABEL),
    )}`,
  );

  if (filters.similarTo) {
    lines.push("");
    lines.push(
      `Bias toward dishes similar in style or technique to: "${filters.similarTo}". Do not return the same dish.`,
    );
  }

  if (filters.hasVideo) {
    lines.push("");
    lines.push(
      "Prefer recipes whose source page has an embedded YouTube or Vimeo video. This is a soft preference — if the other filters can only be honoured by videoless pages, return those instead.",
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
  field: "calories" | "time" | "protein",
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
  if (field === "protein") {
    return [
      `Estimate grams of protein per serving for this dish: ${recipeTitle}`,
      "",
      "Ingredients (per the base servings):",
      ingredientsText,
      "",
      'Return ONLY a JSON object: { "value": <integer grams of protein per serving> }. No prose.',
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
