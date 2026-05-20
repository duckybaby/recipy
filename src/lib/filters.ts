// Filter utilities — display summary + API-body normaliser.
//
// Filters live in the Zustand store (lib/store.ts) not the URL. The old
// encode/decode pair got removed when state moved off URLSearchParams in
// the M2.1 refactor. Two helpers remain here:
//
//   • summarizeFilters — the comma-separated label shown on the Results
//                        top bar ("Dinner · South Indian · 30m").
//   • toApiBody        — coerces "any" sentinels back to null before the
//                        request hits the backend. Pure shape transform.

import type { SearchFilters } from "./types";

function prettify(s: string): string {
  // User-added custom chips arrive as "custom:high protein" — drop the
  // prefix before the dash-split / title-case so the strip reads cleanly
  // as "High protein" rather than "Custom:high Protein".
  const stripped = s.startsWith("custom:") ? s.slice("custom:".length) : s;
  return stripped
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Short summary of active filters, shown on the Results header strip
 * (spec §4 — "Dinner · South Indian · 30m"). Returns "Anything goes"
 * for an empty filter set so the strip always has something to render.
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
  if (filters.dishTypes?.length)
    parts.push(...filters.dishTypes.map(prettify));

  if (parts.length === 0) return "Anything goes";
  return parts.join(" · ");
}

/**
 * Convert the in-app filter shape to the API request body. The only
 * non-trivial bit is collapsing the UI's "any" sentinel into null for the
 * time fields, since the backend treats them as the same constraint.
 */
export function toApiBody(filters: SearchFilters): SearchFilters {
  return {
    meal: filters.meal,
    cuisines: filters.cuisines,
    diet: filters.diet,
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
    dishTypes: filters.dishTypes ?? [],
    hasVideo: filters.hasVideo ?? false,
    surprise: filters.surprise ?? false,
    ...(filters.similarTo ? { similarTo: filters.similarTo } : {}),
  };
}
