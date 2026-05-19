// Chip-group options for every selectable filter. Single source of
// truth so Form and the Results "Edit choices" sheet stay in sync.
// Form was the original home of these arrays; extracted in M3 phase 3
// so the edit sheet doesn't have to duplicate them.

import type {
  Meal,
  Cuisine,
  Diet,
  Vibe,
  MainIngredient,
} from "./types";

export const MEAL_OPTIONS: { value: Meal; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
  { value: "dessert", label: "Dessert" },
];

export const CUISINE_OPTIONS: { value: Cuisine; label: string }[] = [
  { value: "south-indian", label: "South Indian" },
  { value: "north-indian", label: "North Indian" },
  { value: "chinese", label: "Chinese" },
  { value: "italian", label: "Italian" },
  { value: "continental", label: "Continental" },
  { value: "thai", label: "Thai" },
  { value: "mexican", label: "Mexican" },
  { value: "middle-eastern", label: "Middle Eastern" },
];

export const DIET_OPTIONS: { value: Diet; label: string }[] = [
  { value: "vegetarian", label: "Vegetarian" },
  { value: "non-veg", label: "Non-veg" },
  { value: "eggless", label: "Eggless" },
  { value: "vegan", label: "Vegan" },
  { value: "jain", label: "Jain" },
];

// Prep / cook time chips use string `value`s — "any" is a sentinel for
// "No limit" since the store can't distinguish null (unset) from "any".
// Caller maps the picked string back to PrepMax / CookMax in its onChange.
export const PREP_OPTIONS: { value: string; label: string }[] = [
  { value: "5", label: "Under 5 min" },
  { value: "15", label: "Under 15 min" },
  { value: "30", label: "Under 30 min" },
  { value: "any", label: "No limit" },
];

export const COOK_OPTIONS: { value: string; label: string }[] = [
  { value: "15", label: "Under 15 min" },
  { value: "30", label: "Under 30 min" },
  { value: "60", label: "Under 60 min" },
  { value: "any", label: "No limit" },
];

export const VIBE_OPTIONS: { value: Vibe; label: string }[] = [
  { value: "comforting", label: "Comforting" },
  { value: "light", label: "Light" },
  { value: "spicy", label: "Spicy" },
  { value: "one-pot", label: "One-pot" },
  { value: "healthy", label: "Healthy" },
  { value: "indulgent", label: "Indulgent" },
  { value: "impressive", label: "Impressive" },
];

export const MAIN_OPTIONS: { value: MainIngredient; label: string }[] = [
  { value: "chicken", label: "Chicken" },
  { value: "paneer", label: "Paneer" },
  { value: "fish", label: "Fish" },
  { value: "eggs", label: "Eggs" },
  { value: "vegetables", label: "Vegetables" },
  { value: "pasta", label: "Pasta" },
  { value: "rice", label: "Rice" },
  { value: "lentils", label: "Lentils" },
  { value: "tofu", label: "Tofu" },
];
