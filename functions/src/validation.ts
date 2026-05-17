// Zod schemas mirroring the spec §9 data contract.
//
// Backend MUST validate every recipe against this shape before returning.
// Invalid recipes are dropped (not patched), and the response continues
// with whatever passed. If 0 pass, we return an empty array.

import { z } from "zod";

// ----- Filter payload (request body for /api/search-recipes) -----

// Each chip group also accepts user-added entries with a "custom:" prefix
// (e.g. "custom:high protein" for a vibe, "custom:korean" for a cuisine).
// We accept those alongside the canonical enums so the schema doesn't
// reject the user's own additions — the frontend strips the prefix for
// display, and the prompt builder feeds them to Claude as natural-language
// hints.
function enumOrCustom<T extends string>(canonical: readonly T[]) {
  const set = new Set<string>(canonical);
  return z.string().refine(
    (val) => set.has(val) || /^custom:.+/.test(val),
    (val) => ({
      message: `Expected one of [${canonical.join(", ")}] or "custom:<value>"; received "${val}"`,
    }),
  );
}

const MealField = enumOrCustom([
  "breakfast",
  "lunch",
  "dinner",
  "snack",
  "dessert",
] as const);
const CuisineField = enumOrCustom([
  "south-indian",
  "north-indian",
  "chinese",
  "italian",
  "continental",
  "thai",
  "mexican",
  "middle-eastern",
] as const);
const DietField = enumOrCustom([
  "vegetarian",
  "non-veg",
  "eggless",
  "vegan",
  "jain",
] as const);
const VibeField = enumOrCustom([
  "comforting",
  "light",
  "spicy",
  "one-pot",
  "healthy",
  "indulgent",
  "impressive",
] as const);
const MainIngredientField = enumOrCustom([
  "chicken",
  "paneer",
  "fish",
  "eggs",
  "vegetables",
  "pasta",
  "rice",
  "lentils",
  "tofu",
] as const);

// Single-select prep/cook max time. Frontend collapses "any" → null
// before sending (both mean "no constraint").
const PrepMaxSchema = z.union([
  z.literal(5),
  z.literal(15),
  z.literal(30),
  z.null(),
]);
const CookMaxSchema = z.union([
  z.literal(15),
  z.literal(30),
  z.literal(60),
  z.null(),
]);

export const SearchFiltersSchema = z.object({
  meal: z.array(MealField).default([]),
  cuisines: z.array(CuisineField).default([]),
  diet: z.array(DietField).default([]),
  prepMax: PrepMaxSchema.default(null),
  cookMax: CookMaxSchema.default(null),
  vibes: z.array(VibeField).default([]),
  mainIngredients: z.array(MainIngredientField).default([]),
  surprise: z.boolean().default(false),
  similarTo: z.string().optional(),
});

export type SearchFilters = z.infer<typeof SearchFiltersSchema>;

// ----- Recipe (spec §9) -----

export const IngredientSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().nonnegative(),
  unit: z.string().nullable(),
  group: z.string().nullable(),
  instamart: z.object({
    available: z.boolean(),
    productId: z.string().nullable(),
    price: z.number().nullable(),
    classification: z.enum(["pantry-staple", "likely-available", "specialty"]),
  }),
});

export const StepSchema = z.object({
  number: z.number().int().positive(),
  text: z.string().min(1),
  timerSeconds: z.number().int().nonnegative().nullable(),
});

export const RecipeSchema = z.object({
  id: z.string().min(1),
  source: z.object({
    url: z.string().url(),
    siteName: z.string().min(1),
    imageUrl: z.string().url().nullable(),
    fetchedAt: z.string().min(1),
  }),
  title: z.string().min(1),
  tagline: z.string().min(1),
  servings: z.object({
    base: z.number().int().positive(),
    current: z.number().int().positive(),
  }),
  times: z.object({
    prepMinutes: z.number().int().nonnegative(),
    cookMinutes: z.number().int().nonnegative(),
    totalMinutes: z.number().int().nonnegative(),
  }),
  // Difficulty: 4 levels in v1. We accept legacy values from Claude's
  // training (score 5, label "weeknight easy", etc.) and remap them on
  // ingest rather than dropping the whole recipe — the user doesn't care
  // about our enum war.
  difficulty: z.object({
    score: z.preprocess((val) => {
      // Clamp out-of-range integers to the nearest valid level. Anything
      // unparseable falls through and zod fails it.
      if (typeof val !== "number") return val;
      if (val <= 1) return 1;
      if (val >= 4) return 4;
      return Math.round(val);
    }, z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])),
    label: z.preprocess(
      (val) => {
        if (typeof val !== "string") return val;
        const key = val.toLowerCase().trim();
        // Remap retired labels + close synonyms to the v1 enum.
        const LEGACY: Record<string, string> = {
          easy: "needs a bit of focus",
          simple: "needs a bit of focus",
          "weeknight easy": "needs a bit of focus",
          intermediate: "needs a bit of focus",
          medium: "needs a bit of focus",
          moderate: "needs a bit of focus",
          challenging: "weekend project",
          difficult: "weekend project",
          hard: "weekend project",
          expert: "advanced",
        };
        return LEGACY[key] ?? key;
      },
      z.enum([
        "effortless",
        "needs a bit of focus",
        "weekend project",
        "advanced",
      ]),
    ),
  }),
  calories: z.object({
    perServing: z.number().int().nonnegative(),
    inferenceSource: z.enum(["page", "estimated"]),
  }),
  equipment: z.array(z.string()),
  makeAhead: z.string().nullable(),
  dietFlags: z.array(z.string()),
  pairsWith: z.array(z.string()).nullable(),
  whyPicked: z.array(z.string()),
  ingredients: z.array(IngredientSchema).min(1),
  steps: z.array(StepSchema).min(1),
});

export type Recipe = z.infer<typeof RecipeSchema>;
export type Ingredient = z.infer<typeof IngredientSchema>;
export type Step = z.infer<typeof StepSchema>;

// ----- Request bodies for other endpoints -----

export const AlternateSourceBodySchema = z.object({
  dish: z.string().min(1),
  excludeUrls: z.array(z.string().url()).default([]),
});

export const RecomputeFieldBodySchema = z.object({
  recipe: RecipeSchema,
  field: z.enum(["calories", "time"]),
});

export const SubstitutionsBodySchema = z.object({
  ingredients: z.array(IngredientSchema).min(1),
});

export const FeedbackBodySchema = z.object({
  recipeId: z.string().min(1),
  reason: z.string().min(1).max(200),
});

// ----- Helpers -----

/**
 * Try to parse a recipe; if parsing fails, return null (so callers can
 * drop invalid recipes from a batch without aborting the whole response).
 */
export function safeParseRecipe(raw: unknown): Recipe | null {
  const result = RecipeSchema.safeParse(raw);
  return result.success ? result.data : null;
}
