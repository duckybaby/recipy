// Screen 1 — Form ("What are we cooking?") — spec §3.
//
// Filters live in the Zustand store (lib/store.ts). Form reads them on
// mount and writes back through patchFilters. Custom chips per section
// still persist in localStorage (see lib/storage.ts).
//
// Two ways out of this screen:
//   • "Find recipes" → navigate("/results", { state: { intent: "fresh" } })
//     The intent tells Results to show the loader and fetch even if the
//     filters happen to match a recent cached result.
//   • "Surprise me" → resets filters to { surprise: true } first so the
//     resulting search doesn't carry stale chip selections. Same intent.

import { useNavigate } from "react-router-dom";
import { ChipGroup } from "../components/ChipGroup";
import { ThemeToggle } from "../components/ThemeToggle";
import { EMPTY_FILTERS, useStore } from "../lib/store";
import type {
  SearchFilters,
  Meal,
  Cuisine,
  Diet,
  Vibe,
  MainIngredient,
  PrepMax,
  CookMax,
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

const PREP_OPTIONS: { value: string; label: string }[] = [
  { value: "5", label: "Under 5 min" },
  { value: "15", label: "Under 15 min" },
  { value: "30", label: "Under 30 min" },
  { value: "any", label: "No limit" },
];

const COOK_OPTIONS: { value: string; label: string }[] = [
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
  const navigate = useNavigate();
  const filters = useStore((s) => s.filters);
  const patchFilters = useStore((s) => s.patchFilters);
  const setFilters = useStore((s) => s.setFilters);

  // Update one slice of filters in the store. Any chip change also clears
  // the surprise flag — once the user starts picking chips, they aren't in
  // "surprise me" mode any more, so an accidental Find Recipes shouldn't
  // come back as a surprise search.
  const update = (patch: Partial<SearchFilters>) => {
    patchFilters({ ...patch, surprise: false });
  };

  const findRecipes = () => {
    // Force surprise off — see above. If the user previously tapped
    // surprise-me and then changed chips, we want a regular search now.
    if (filters.surprise) {
      setFilters({ ...filters, surprise: false });
    }
    navigate("/results", { state: { intent: "fresh" } });
  };

  const surpriseMe = () => {
    // Surprise resets every chip so the API call doesn't accidentally
    // narrow the search. The Form chips clear on next visit too — that's
    // intentional, surprise is a one-shot mood.
    setFilters({ ...EMPTY_FILTERS, surprise: true });
    navigate("/results", { state: { intent: "fresh" } });
  };

  // Each single-select group's currently-selected value (length 0 or 1).
  const prepSelected: string[] =
    filters.prepMax === null ? [] : [String(filters.prepMax)];
  const cookSelected: string[] =
    filters.cookMax === null ? [] : [String(filters.cookMax)];

  return (
    <>
      {/* Sticky top header — pins the title + "surprise me" link as you scroll.
          Tighter top inset than other pages since the header now stays in view.
          On md+ the primary CTA also lives here (right cluster, inline-left of
          the theme toggle) and the mobile sticky-bottom CTA is hidden. */}
      <div
        className="sticky top-0 z-20 bg-paper/60 backdrop-blur-lg"
        style={{ paddingTop: "max(env(safe-area-inset-top), 20px)" }}
      >
        <header className="mx-auto max-w-md px-5 pb-2 md:max-w-[1100px] md:px-8 lg:px-10">
          {/* Title + right-cluster. Right-cluster on md+ is [CTA · toggle];
              on phone it's just the toggle. */}
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-title">What are we cooking?</h1>
            <div className="mt-1 flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={findRecipes}
                className="btn-primary btn-primary-compact focus-ring hidden md:inline-flex"
              >
                Find recipes
              </button>
              <div className="-mr-2">
                <ThemeToggle />
              </div>
            </div>
          </div>
          <p className="mt-2 text-body text-ink-muted">
            Tap a few things to find recipes, or{" "}
            <button
              type="button"
              onClick={surpriseMe}
              className="focus-ring rounded text-ink underline decoration-accent decoration-2 underline-offset-4 hover:text-accent"
            >
              surprise me
            </button>
            .
          </p>
        </header>
      </div>

      <main className="mx-auto max-w-md px-5 pt-6 pb-32 md:max-w-[1100px] md:px-8 md:pt-10 md:pb-16 lg:px-10">
        {/* Chip-group container: stacked column on phone, 2-up tablet,
            3-up desktop. Vertical gap a touch larger than horizontal so
            section titles still read as anchors when wrapping. */}
        <div className="chip-stagger flex flex-col gap-10 md:grid md:grid-cols-2 md:gap-x-10 md:gap-y-12 lg:grid-cols-3">
          <ChipGroup
            id="meal"
            label="Meal"
            options={MEAL_OPTIONS}
            selected={filters.meal}
            multi
            allowAdd
            onChange={(next) => update({ meal: next as Meal[] })}
          />
          <ChipGroup
            id="cuisine"
            label="Cuisine"
            options={CUISINE_OPTIONS}
            selected={filters.cuisines}
            multi
            allowAdd
            onChange={(next) => update({ cuisines: next as Cuisine[] })}
          />
          <ChipGroup
            id="diet"
            label="Diet"
            options={DIET_OPTIONS}
            selected={filters.diet}
            multi
            allowAdd
            onChange={(next) => update({ diet: next as Diet[] })}
          />
          <ChipGroup
            id="prep"
            label="Prep time"
            options={PREP_OPTIONS}
            selected={prepSelected}
            multi={false}
            onChange={(next) => {
              const v = next[0];
              const prepMax: PrepMax =
                v === "any"
                  ? "any"
                  : v === "5" || v === "15" || v === "30"
                    ? (Number(v) as 5 | 15 | 30)
                    : null;
              update({ prepMax });
            }}
          />
          <ChipGroup
            id="cook"
            label="Cook time"
            options={COOK_OPTIONS}
            selected={cookSelected}
            multi={false}
            onChange={(next) => {
              const v = next[0];
              const cookMax: CookMax =
                v === "any"
                  ? "any"
                  : v === "15" || v === "30" || v === "60"
                    ? (Number(v) as 15 | 30 | 60)
                    : null;
              update({ cookMax });
            }}
          />
          <ChipGroup
            id="vibe"
            label="Vibe"
            options={VIBE_OPTIONS}
            selected={filters.vibes}
            multi
            allowAdd
            onChange={(next) => update({ vibes: next as Vibe[] })}
          />
          <ChipGroup
            id="main"
            label="Main ingredient"
            options={MAIN_OPTIONS}
            selected={filters.mainIngredients}
            multi
            allowAdd
            onChange={(next) =>
              update({ mainIngredients: next as MainIngredient[] })
            }
          />
        </div>
      </main>

      {/* Sticky bottom CTA — phone only (md:hidden). Anchored above iOS home
          indicator. Translucent + blurred to match the top header, with a
          generous bottom buffer so the orange CTA shadow has room to render
          without getting clipped by Safari's URL chrome. On md+ the CTA
          lives in the header right-cluster instead. */}
      <div
        className="pointer-events-none fixed inset-x-0 z-20 md:hidden"
        style={{ bottom: 0 }}
      >
        {/* Soft fade so scrolling content doesn't cut sharply */}
        <div className="h-8 bg-gradient-to-t from-paper/60 to-transparent" />
        <div
          className="pointer-events-auto bg-paper/60 backdrop-blur-lg"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom), 16px)" }}
        >
          <div className="mx-auto max-w-md px-5 pt-2 pb-2">
            <button
              type="button"
              onClick={findRecipes}
              className="btn-primary focus-ring"
            >
              Find recipes
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
