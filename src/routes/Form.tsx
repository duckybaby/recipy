// Screen 1 — Form ("What are we cooking?") — spec §3.
//
// Filters live in URL search params so back navigation from Results
// preserves selections without any local state.

import { useSearchParams, useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { ChipGroup } from "../components/ChipGroup";
import { decodeFilters, encodeFilters } from "../lib/filterEncoding";
import type {
  SearchFilters,
  Meal,
  Cuisine,
  Diet,
  Vibe,
  MainIngredient,
  TimeMax,
} from "../lib/types";

const MEAL_OPTIONS: { value: Meal; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
  { value: "dessert", label: "Dessert" },
];

const CUISINE_OPTIONS: { value: Cuisine; label: string }[] = [
  { value: "south-indian", label: "South Indian" },
  { value: "north-indian", label: "North Indian" },
  { value: "chinese", label: "Chinese" },
  { value: "italian", label: "Italian" },
  { value: "continental", label: "Continental" },
  { value: "thai", label: "Thai" },
  { value: "mexican", label: "Mexican" },
  { value: "middle-eastern", label: "Middle Eastern" },
];

const DIET_OPTIONS: { value: Diet; label: string }[] = [
  { value: "vegetarian", label: "Vegetarian" },
  { value: "non-veg", label: "Non-veg" },
  { value: "eggless", label: "Eggless" },
  { value: "vegan", label: "Vegan" },
  { value: "jain", label: "Jain" },
];

const TIME_OPTIONS: { value: string; label: string }[] = [
  { value: "15", label: "Under 15 min" },
  { value: "30", label: "Under 30 min" },
  { value: "60", label: "Under 60 min" },
  { value: "any", label: "No limit" },
];

const VIBE_OPTIONS: { value: Vibe; label: string }[] = [
  { value: "comforting", label: "Comforting" },
  { value: "light", label: "Light" },
  { value: "spicy", label: "Spicy" },
  { value: "one-pot", label: "One-pot" },
  { value: "healthy", label: "Healthy" },
  { value: "indulgent", label: "Indulgent" },
  { value: "impressive", label: "Impressive" },
];

const MAIN_OPTIONS: { value: MainIngredient; label: string }[] = [
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

export default function Form() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const filters = decodeFilters(params);

  // Update one slice of filters, persist to URL.
  const update = (patch: Partial<SearchFilters>) => {
    const next: SearchFilters = { ...filters, ...patch };
    setParams(encodeFilters(next), { replace: true });
  };

  const findRecipes = () => {
    // Pass the current filters through — Results reads from the URL.
    navigate({ pathname: "/results", search: encodeFilters(filters).toString() });
  };

  const surpriseMe = () => {
    // §3: submits with all groups empty + surprise flag.
    const p = new URLSearchParams({ surprise: "true" });
    navigate({ pathname: "/results", search: p.toString() });
  };

  // Time chip selected-value is a string array of length 0 or 1.
  const timeSelected: string[] =
    filters.timeMax === null ? [] : [String(filters.timeMax)];

  return (
    <main className="mx-auto max-w-md px-5 pt-8 pb-12 safe-pt safe-pb">
      <header className="mb-8">
        <h1 className="text-title font-bold tracking-tight">
          What are we cooking?
        </h1>
        <p className="mt-1.5 text-body text-ink-muted">
          Pick what you feel like — or skip everything and tap "Surprise me".
        </p>
      </header>

      <div className="flex flex-col gap-7">
        <ChipGroup
          label="Meal"
          options={MEAL_OPTIONS}
          selected={filters.meal}
          multi
          onChange={(next) => update({ meal: next as Meal[] })}
        />
        <ChipGroup
          label="Cuisine"
          options={CUISINE_OPTIONS}
          selected={filters.cuisines}
          multi
          onChange={(next) => update({ cuisines: next as Cuisine[] })}
        />
        <ChipGroup
          label="Diet"
          options={DIET_OPTIONS}
          selected={filters.diet}
          multi
          onChange={(next) => update({ diet: next as Diet[] })}
        />
        <ChipGroup
          label="Time available"
          options={TIME_OPTIONS}
          selected={timeSelected}
          multi={false}
          onChange={(next) => {
            const v = next[0];
            const timeMax: TimeMax =
              v === "any"
                ? "any"
                : v === "15" || v === "30" || v === "60"
                  ? Number(v) as 15 | 30 | 60
                  : null;
            update({ timeMax });
          }}
        />
        <ChipGroup
          label="Vibe"
          options={VIBE_OPTIONS}
          selected={filters.vibes}
          multi
          onChange={(next) => update({ vibes: next as Vibe[] })}
        />
        <ChipGroup
          label="Main ingredient (optional)"
          options={MAIN_OPTIONS}
          selected={filters.mainIngredients}
          multi
          onChange={(next) =>
            update({ mainIngredients: next as MainIngredient[] })
          }
        />
      </div>

      <div className="mt-10 flex flex-col items-center gap-4">
        <button
          type="button"
          className="btn-primary focus-ring"
          onClick={findRecipes}
        >
          Find recipes
        </button>
        <button
          type="button"
          className="focus-ring inline-flex items-center gap-1.5 text-strong text-ink-muted underline underline-offset-4 decoration-ink-disabled"
          onClick={surpriseMe}
        >
          <Sparkles size={14} aria-hidden /> Surprise me
        </button>
      </div>
    </main>
  );
}
