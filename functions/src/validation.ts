// Zod schemas mirroring the spec §9 data contract.
//
// Backend MUST validate every recipe against this shape before returning.
// Invalid recipes are dropped (not patched), and the response continues
// with whatever passed. If 0 pass, we return an empty array.

import { z } from "zod";

// ----- Filter payload (request body for /api/search-recipes) -----

const MealEnum = z.enum(["breakfast", "lunch", "dinner", "snack", "dessert"]);
const CuisineEnum = z.enum([
  "south-indian",
  "north-indian",
  "chinese",
  "italian",
  "continental",
  "thai",
  "mexican",
  "middle-eastern",
]);
const DietEnum = z.enum(["vegetarian", "non-veg", "eggless", "vegan", "jain"]);
const VibeEnum = z.enum([
  "comforting",
  "light",
  "spicy",
  "one-pot",
  "healthy",
  "indulgent",
  "impressive",
]);
const MainIngredientEnum = z.enum([
  "chicken",
  "paneer",
  "fish",
  "eggs",
  "vegetables",
  "pasta",
  "rice",
  "lentils",
  "tofu",
]);

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
  meal: z.array(MealEnum).default([]),
  cuisines: z.array(CuisineEnum).default([]),
  diet: z.array(DietEnum).default([]),
  prepMax: PrepMaxSchema.default(null),
  cookMax: CookMaxSchema.default(null),
  vibes: z.array(VibeEnum).default([]),
  mainIngredients: z.array(MainIngredientEnum).default([]),
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
  difficulty: z.object({
    score: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
    ]),
    label: z.enum([
      "effortless",
      "weeknight easy",
      "needs a bit of focus",
      "weekend project",
      "advanced",
    ]),
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
