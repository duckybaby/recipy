// URLSearchParams <-> SearchFilters codec.
//
// The form persists state in the URL (spec §3) so back-navigation
// restores selections without storage. Results screen reads filters
// from the same params on mount.

import type {
  SearchFilters,
  Meal,
  Cuisine,
  Diet,
  Vibe,
  MainIngredient,
  PrepMax,
  CookMax,
} from "./types";

const MEALS = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
  "dessert",
] as const satisfies readonly Meal[];

const CUISINES = [
  "south-indian",
  "north-indian",
  "chinese",
  "italian",
  "continental",
  "thai",
  "mexican",
  "middle-eastern",
] as const satisfies readonly Cuisine[];

const DIETS = [
  "vegetarian",
  "non-veg",
  "eggless",
  "vegan",
  "jain",
] as const satisfies readonly Diet[];

const VIBES = [
  "comforting",
  "light",
  "spicy",
  "one-pot",
  "healthy",
  "indulgent",
  "impressive",
] as const satisfies readonly Vibe[];

const MAIN_INGREDIENTS = [
  "chicken",
  "paneer",
  "fish",
  "eggs",
  "vegetables",
  "pasta",
  "rice",
  "lentils",
  "tofu",
] as const satisfies readonly MainIngredient[];

function parseList<T extends string>(
  raw: string | null,
  valid: readonly T[],
): T[] {
  if (!raw) return [];
  const set = new Set<string>(valid);
  // Pass through user-added values (prefixed with "custom:") even though
  // they aren't in the enum. They get cast to T at the type boundary.
  return raw
    .split(",")
    .filter((v): v is T => set.has(v) || v.startsWith("custom:"));
}

function parsePrepMax(raw: string | null): PrepMax {
  if (raw === null) return null;
  if (raw === "any") return "any";
  const n = Number(raw);
  if (n === 5 || n === 15 || n === 30) return n;
  return null;
}

function parseCookMax(raw: string | null): CookMax {
  if (raw === null) return null;
  if (raw === "any") return "any";
  const n = Number(raw);
  if (n === 15 || n === 30 || n === 60) return n;
  return null;
}

export function decodeFilters(params: URLSearchParams): SearchFilters {
  const similarTo = params.get("similarTo");
  return {
    meal: parseList(params.get("meal"), MEALS),
    cuisines: parseList(params.get("cuisines"), CUISINES),
    diet: parseList(params.get("diet"), DIETS),
    prepMax: parsePrepMax(params.get("prep")),
    cookMax: parseCookMax(params.get("cook")),
    vibes: parseList(params.get("vibes"), VIBES),
    mainIngredients: parseList(params.get("main"), MAIN_INGREDIENTS),
    surprise: params.get("surprise") === "true",
    ...(similarTo ? { similarTo } : {}),
  };
}

export function encodeFilters(filters: SearchFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (filters.meal.length) p.set("meal", filters.meal.join(","));
  if (filters.cuisines.length) p.set("cuisines", filters.cuisines.join(","));
  if (filters.diet.length) p.set("diet", filters.diet.join(","));
  if (filters.prepMax !== null) p.set("prep", String(filters.prepMax));
  if (filters.cookMax !== null) p.set("cook", String(filters.cookMax));
  if (filters.vibes.length) p.set("vibes", filters.vibes.join(","));
  if (filters.mainIngredients.length)
    p.set("main", filters.mainIngredients.join(","));
  if (filters.surprise) p.set("surprise", "true");
  if (filters.similarTo) p.set("similarTo", filters.similarTo);
  return p;
}

// ---- Display helpers ----

function prettify(s: string): string {
  return s
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Short summary of active filters, shown on the Results header strip
 * (spec §4 — "Dinner · South Indian · 30m"). Returns null if no filters.
 */
export function summarizeFilters(filters: SearchFilters): string {
  if (filters.surprise) return "Surprise pick";

  const parts: string[] = [];
  if (filters.meal.length) parts.push(...filters.meal.map(prettify));
  if (filters.cuisines.length) parts.push(...filters.cuisines.map(prettify));
  if (filters.prepMax !== null) {
    parts.push(
      filters.prepMax === "any" ? "Any prep" : `Prep ${filters.prepMax}m`,
    );
  }
  if (filters.cookMax !== null) {
    parts.push(
      filters.cookMax === "any" ? "Any cook" : `Cook ${filters.cookMax}m`,
    );
  }
  if (filters.diet.length) parts.push(...filters.diet.map(prettify));
  if (filters.vibes.length) parts.push(...filters.vibes.map(prettify));
  if (filters.mainIngredients.length)
    parts.push(...filters.mainIngredients.map(prettify));

  if (parts.length === 0) return "Anything goes";
  return parts.join(" · ");
}

/** Convert to the API request body shape. */
export function toApiBody(filters: SearchFilters): SearchFilters {
  return {
    meal: filters.meal,
    cuisines: filters.cuisines,
    diet: filters.diet,
    // "any" -> null for the backend; both mean "no constraint".
    prepMax:
      filters.prepMax === "any" || filters.prepMax === null
        ? null
        : filters.prepMax,
    cookMax:
      filters.cookMax === "any" || filters.cookMax === null
        ? null
        : filters.cookMax,
    vibes: filters.vibes,
    mainIngredients: filters.mainIngredients,
    surprise: filters.surprise ?? false,
    ...(filters.similarTo ? { similarTo: filters.similarTo } : {}),
  };
}
