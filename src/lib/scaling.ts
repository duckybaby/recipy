// Quantity scaling + unit rounding (spec §5.1 + §10 unit display).
//
// When the servings adjuster changes, every ingredient quantity scales
// proportionally. Display rounds to human-friendly fractions.

import type { Ingredient } from "./types";

const COMMON_FRACTIONS = [
  { v: 0, label: "" },
  { v: 0.25, label: "¼" },
  { v: 0.333, label: "⅓" },
  { v: 0.5, label: "½" },
  { v: 0.667, label: "⅔" },
  { v: 0.75, label: "¾" },
];

/** Scale a base quantity from baseServings → currentServings. */
export function scaleQuantity(
  baseQuantity: number,
  baseServings: number,
  currentServings: number,
): number {
  if (baseServings <= 0) return baseQuantity;
  return (baseQuantity * currentServings) / baseServings;
}

/**
 * Format a quantity for display per spec §10:
 *  - Integer → "3"
 *  - Within 1/4 of a common fraction → "1½", "¾"
 *  - Volumes < 0.25 tsp → "a pinch"
 *  - Otherwise → one decimal "1.3"
 */
export function formatQuantity(quantity: number, unit: string | null): string {
  if (unit === "tsp" && quantity > 0 && quantity < 0.25) {
    return "a pinch";
  }

  const whole = Math.floor(quantity);
  const frac = quantity - whole;

  // Snap to common fraction if within 0.06 (≈1/16) — generous tolerance per spec
  const TOLERANCE = 0.06;
  let match: { v: number; label: string } | null = null;
  for (const f of COMMON_FRACTIONS) {
    if (Math.abs(frac - f.v) <= TOLERANCE) {
      match = f;
      break;
    }
  }

  if (match) {
    if (match.v === 0) {
      // Pure integer
      return `${whole}`;
    }
    if (whole === 0) {
      return match.label;
    }
    return `${whole}${match.label}`;
  }

  // Fallback: one decimal, trimmed
  return quantity.toFixed(1).replace(/\.0$/, "");
}

/** Convenience: scale + format in one pass. */
export function scaleAndFormat(
  ingredient: Ingredient,
  baseServings: number,
  currentServings: number,
): string {
  const scaled = scaleQuantity(
    ingredient.quantity,
    baseServings,
    currentServings,
  );
  const qty = formatQuantity(scaled, ingredient.unit);
  if (!qty) return ingredient.name;
  if (!ingredient.unit) return `${qty} ${ingredient.name}`;
  return `${qty} ${ingredient.unit} ${ingredient.name}`;
}

/** Round display values per "round numbers always" (spec §1 rule 4). */
export function roundForDisplay(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}
