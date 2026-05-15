// Screen 3 — Recipe detail — spec §5.
//
// Lookup chain (spec §7.9): router location.state.recipe (from card click)
// → active-recipe localStorage (if id matches) → recent-recipes by id
// → last-search by id → "not found" card with a way back.
//
// Lateral actions wired against /api/* in M2:
//   - More like this  → searchRecipes with similarTo flag, then navigate to /results
//   - Substitutions   → inline panel, getSubstitutions
//   - Different recipe → findAlternateSource, swap in place
//   - Feedback sheet  → recompute / re-fetch flows + feedback log

import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Clock,
  ExternalLink,
  Flame,
  Share2,
  ShoppingCart,
  Users,
} from "lucide-react";
import { IngredientRow } from "../components/IngredientRow";
import { ServingsAdjuster } from "../components/ServingsAdjuster";
import {
  FeedbackSheet,
  type FeedbackReason,
} from "../components/FeedbackSheet";
import {
  pushRecentRecipe,
  setActiveRecipe,
  getActiveRecipe,
  getRecentRecipes,
  getLastSearch,
  dismissMakeahead,
  getDismissedMakeahead,
} from "../lib/storage";
import { api, ApiError } from "../lib/api";
import { encodeFilters, decodeFilters } from "../lib/filterEncoding";
import { scaleAndFormat, scaleQuantity, formatQuantity } from "../lib/scaling";
import type { Recipe as RecipeT } from "../lib/types";

function sentence(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Find a recipe by id across all client-side caches. */
function lookupRecipe(id: string, fromState: RecipeT | null): RecipeT | null {
  if (fromState && fromState.id === id) return fromState;
  const active = getActiveRecipe();
  if (active?.recipe.id === id) return active.recipe;
  const recent = getRecentRecipes().find((r) => r.id === id);
  if (recent) return recent;
  const last = getLastSearch()?.recipes.find((r) => r.id === id);
  if (last) return last;
  // As a fallback, if state has any recipe (even mismatched id from a stale
  // link), prefer it over showing not-found — better UX during dev.
  return fromState;
}

export default function Recipe() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();

  // Initial lookup. We hold the recipe in state so "Different recipe" can
  // swap it in place without unmounting.
  const initialRecipe = useMemo(() => {
    const stateRecipe = (location.state as { recipe?: RecipeT } | null)?.recipe ?? null;
    return lookupRecipe(id, stateRecipe);
  }, [id, location.state]);

  const [recipe, setRecipe] = useState<RecipeT | null>(initialRecipe);
  const [servings, setServings] = useState<number>(
    initialRecipe?.servings.base ?? 2,
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const [makeAheadDismissed, setMakeAheadDismissed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [substitutions, setSubstitutions] = useState<Record<string, string[]> | null>(null);
  const [substitutionsLoading, setSubstitutionsLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState<null | "more" | "different">(null);

  // Persist as active recipe + push to recent (spec §7.9).
  useEffect(() => {
    if (!recipe) return;
    setActiveRecipe({
      recipe,
      source: "search",
      openedAt: new Date().toISOString(),
    });
    pushRecentRecipe(recipe);
    setMakeAheadDismissed(getDismissedMakeahead().includes(recipe.id));
    // Reset substitutions panel when recipe changes (e.g. "Different recipe" swap).
    setSubstitutions(null);
    // Reset servings to base when the recipe swaps to a different dish.
    setServings(recipe.servings.base);
  }, [recipe]);

  if (!recipe) {
    return (
      <main className="mx-auto max-w-md px-5 pt-8 pb-12 safe-pt safe-pb">
        <p className="text-strong text-ink-muted">
          We couldn't find that recipe.
        </p>
        <Link to="/" className="btn-primary mt-6 inline-flex">
          Back to filters
        </Link>
      </main>
    );
  }

  const missingIngredients = recipe.ingredients.filter(
    (i) => !i.instamart.available,
  );
  const missingCount = missingIngredients.length;

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2800);
  };

  // ---------- Lateral actions ----------

  const onMoreLikeThis = async () => {
    if (actionBusy) return;
    setActionBusy("more");
    try {
      const baseFilters = decodeFilters(params);
      const q = encodeFilters(baseFilters);
      q.set("similarTo", recipe.title);
      navigate({ pathname: "/results", search: q.toString() });
    } finally {
      setActionBusy(null);
    }
  };

  const onSubstitutions = async () => {
    if (substitutions) {
      // Toggle panel closed.
      setSubstitutions(null);
      return;
    }
    setSubstitutionsLoading(true);
    try {
      const { substitutions: subs } = await api.getSubstitutions(recipe.ingredients);
      setSubstitutions(subs);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Couldn't load substitutions.");
    } finally {
      setSubstitutionsLoading(false);
    }
  };

  const onDifferentRecipe = async () => {
    if (actionBusy) return;
    setActionBusy("different");
    try {
      const { recipe: alt } = await api.findAlternateSource(recipe.title, [
        recipe.source.url,
      ]);
      setRecipe(alt);
      showToast("Found another version of this dish.");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "No alternate source found.");
    } finally {
      setActionBusy(null);
    }
  };

  // ---------- Feedback sheet recovery flows (spec §5.2) ----------

  const onFeedbackSelect = async (reason: FeedbackReason) => {
    setSheetOpen(false);
    // Fire-and-forget log (spec §11.4).
    void api.feedback(recipe.id, reason).catch(() => undefined);

    switch (reason) {
      case "steps-dont-match":
      case "ingredients-wrong":
        await onDifferentRecipe();
        break;
      case "calories-off": {
        try {
          const { value } = await api.recomputeField(recipe, "calories");
          setRecipe({
            ...recipe,
            calories: { perServing: value, inferenceSource: "estimated" },
          });
          showToast(`Updated calories to ${value} kcal.`);
        } catch (err) {
          showToast(err instanceof ApiError ? err.message : "Recompute failed.");
        }
        break;
      }
      case "time-off": {
        try {
          const { value } = await api.recomputeField(recipe, "time");
          // Distribute updated total back into prep+cook proportionally.
          const prevTotal = recipe.times.totalMinutes || 1;
          const prepShare = recipe.times.prepMinutes / prevTotal;
          const newPrep = Math.max(0, Math.round(value * prepShare));
          const newCook = Math.max(0, value - newPrep);
          setRecipe({
            ...recipe,
            times: { prepMinutes: newPrep, cookMinutes: newCook, totalMinutes: value },
          });
          showToast(`Updated total time to ${value} min.`);
        } catch (err) {
          showToast(err instanceof ApiError ? err.message : "Recompute failed.");
        }
        break;
      }
      case "not-what-i-want":
        navigate({ pathname: "/results", search: params.toString() });
        break;
    }
  };

  const onAddIngredient = () => showToast("Instamart cart — wired in M4.");
  const onReviewInstamart = () => showToast("Instamart cart — wired in M4.");
  const onStartCooking = () => showToast("Cooking mode — built in M3.");

  const onDismissMakeAhead = () => {
    dismissMakeahead(recipe.id);
    setMakeAheadDismissed(true);
  };

  // Scaled total calories don't change (calories are per serving, spec §5.1).
  const back = () => navigate({ pathname: "/results", search: params.toString() });

  return (
    <main className="mx-auto max-w-md pb-24 safe-pt safe-pb">
      {/* 1. Header — back arrow + share */}
      <header className="flex items-center justify-between px-5 py-3">
        <button
          type="button"
          aria-label="Back to results"
          onClick={back}
          className="focus-ring -ml-2 inline-flex h-11 w-11 items-center justify-center text-ink"
        >
          <ArrowLeft size={20} />
        </button>
        <button
          type="button"
          aria-label="Share"
          onClick={() => showToast("Share — wired post-v1.")}
          className="focus-ring -mr-2 inline-flex h-11 w-11 items-center justify-center text-ink-muted"
        >
          <Share2 size={18} />
        </button>
      </header>

      <div className="px-5">
        {/* 2. Source attribution (mandatory per spec §5) */}
        <a
          href={recipe.source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="focus-ring inline-flex items-center gap-1.5 text-caption text-ink-muted underline underline-offset-2 decoration-ink-disabled"
        >
          <ExternalLink size={12} aria-hidden /> From {recipe.source.siteName}
        </a>

        {/* 3. Title */}
        <h1 className="mt-3 text-title font-bold tracking-tight leading-snug text-ink">
          {recipe.title}
        </h1>

        {/* 4. Tagline */}
        <p className="mt-1.5 text-body leading-snug text-ink-muted">
          {recipe.tagline}
        </p>

        {/* 5. Pill row — difficulty + why picked */}
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="pill pill-info">
            {sentence(recipe.difficulty.label)}
          </span>
          {recipe.whyPicked.length > 0 && (
            <span className="pill pill-secondary">
              Picked: {recipe.whyPicked.join(" · ")}
            </span>
          )}
        </div>

        {/* 6. Diet flags */}
        {recipe.dietFlags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {recipe.dietFlags.map((flag) => (
              <span
                key={flag}
                className="pill pill-secondary"
              >
                {flag}
              </span>
            ))}
          </div>
        )}

        {/* 7. Equipment row — only if non-baseline */}
        {recipe.equipment.length > 0 && (
          <p className="mt-4 text-body text-ink-muted">
            <span className="text-ink-muted">You'll also need:</span>{" "}
            {recipe.equipment.join(", ")}
          </p>
        )}

        {/* 8. Make-ahead nudge */}
        {recipe.makeAhead && !makeAheadDismissed && (
          <div className="card mt-5 bg-warning-50 p-3">
            <p className="text-body text-warning-800">{recipe.makeAhead}</p>
            <button
              type="button"
              onClick={onDismissMakeAhead}
              className="focus-ring mt-1 text-caption text-warning-700 underline underline-offset-2"
            >
              I've done this — dismiss
            </button>
          </div>
        )}

        {/* 9. Metrics row */}
        <dl className="card mt-6 grid grid-cols-4 gap-2 px-3 py-3 text-center">
          <Metric icon={<Clock size={14} />} label="Prep">
            {recipe.times.prepMinutes}m
          </Metric>
          <Metric icon={<Flame size={14} />} label="Cook">
            {recipe.times.cookMinutes}m
          </Metric>
          <Metric icon={<Users size={14} />} label="Serves">
            {servings}
          </Metric>
          <Metric label="kcal">{recipe.calories.perServing}</Metric>
        </dl>

        {/* 10. Ingredients section */}
        <section className="mt-7">
          <header className="flex items-center justify-between">
            <h2 className="text-section font-bold text-ink">
              Ingredients
            </h2>
            <ServingsAdjuster servings={servings} onChange={setServings} />
          </header>

          <IngredientList recipe={recipe} servings={servings} onAdd={onAddIngredient} />

          {missingCount > 0 && (
            <button
              type="button"
              onClick={onReviewInstamart}
              className="btn-outline focus-ring mt-3 w-full gap-2 bg-warning-50 text-warning-800"
            >
              <ShoppingCart size={14} aria-hidden />
              Review {missingCount} missing on Instamart
            </button>
          )}
        </section>

        {/* Substitutions panel (toggled from secondary actions row) */}
        {(substitutionsLoading || substitutions) && (
          <section className="card mt-5 bg-paper-soft p-4">
            <h3 className="text-section font-bold text-ink">Substitutions</h3>
            {substitutionsLoading ? (
              <p className="mt-2 text-body text-ink-muted">Asking Claude…</p>
            ) : substitutions && Object.keys(substitutions).length === 0 ? (
              <p className="mt-2 text-body text-ink-muted">
                No common substitutions came back.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {Object.entries(substitutions ?? {}).map(([name, options]) => (
                  <li key={name}>
                    <p className="text-strong font-medium text-ink">{name}</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-body text-ink-muted">
                      {options.map((opt, i) => (
                        <li key={i}>{opt}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* 11. Pairs well with */}
        {recipe.pairsWith && recipe.pairsWith.length > 0 && (
          <p className="mt-6 text-body text-ink-muted">
            <span className="text-ink-muted">Pairs well with:</span>{" "}
            {recipe.pairsWith.join(", ")}
          </p>
        )}

        {/* 12. Steps preview */}
        <section className="mt-7">
          <h2 className="text-section font-bold text-ink">
            Steps · {recipe.steps.length} in total
          </h2>
          <ol className="mt-3 space-y-3">
            {recipe.steps.slice(0, 2).map((step) => (
              <li key={step.number} className="flex gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-paper-soft text-meta font-medium text-ink-muted">
                  {step.number}
                </span>
                <p className="text-strong leading-snug text-ink">
                  {step.text}
                </p>
              </li>
            ))}
            {recipe.steps.length > 2 && (
              <li className="text-body text-ink-muted">
                + {recipe.steps.length - 2} more step
                {recipe.steps.length - 2 === 1 ? "" : "s"}
              </li>
            )}
          </ol>
        </section>

        {/* 13. Primary CTA — Start cooking */}
        <button
          type="button"
          onClick={onStartCooking}
          className="btn-primary focus-ring mt-8"
        >
          Start cooking →
        </button>

        {/* 14. Secondary actions row */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button
            type="button"
            className="btn-outline focus-ring text-caption disabled:opacity-50"
            onClick={onMoreLikeThis}
            disabled={actionBusy === "more"}
          >
            More like this
          </button>
          <button
            type="button"
            className="btn-outline focus-ring text-caption disabled:opacity-50"
            onClick={onSubstitutions}
            disabled={substitutionsLoading}
          >
            {substitutions ? "Hide subs" : "Substitutions"}
          </button>
          <button
            type="button"
            className="btn-outline focus-ring text-caption disabled:opacity-50"
            onClick={onDifferentRecipe}
            disabled={actionBusy === "different"}
          >
            {actionBusy === "different" ? "Searching…" : "Different recipe"}
          </button>
        </div>

        {/* 15. Something looks wrong link */}
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="focus-ring text-caption text-ink-faint underline underline-offset-2"
          >
            Something looks wrong?
          </button>
        </div>
      </div>

      <FeedbackSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSelect={onFeedbackSelect}
      />

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="safe-pb fixed inset-x-0 bottom-4 z-50 mx-auto max-w-md px-5"
        >
          <div className="mx-auto inline-block border-[2.5px] border-ink bg-ink px-3 py-2 text-center text-caption font-medium text-paper shadow-brutal-sm">
            {toast}
          </div>
        </div>
      )}
    </main>
  );
}

function Metric({
  icon,
  label,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="text-step font-medium text-ink">{children}</div>
      <div className="flex items-center gap-1 text-meta text-ink-muted">
        {icon}
        <span>{label}</span>
      </div>
    </div>
  );
}

function IngredientList({
  recipe,
  servings,
  onAdd,
}: {
  recipe: RecipeT;
  servings: number;
  onAdd: () => void;
}) {
  const base = recipe.servings.base;

  // Group ingredients by `group` field, preserving original order.
  const groups: Map<string | null, typeof recipe.ingredients> = new Map();
  for (const ing of recipe.ingredients) {
    const key = ing.group ?? null;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(ing);
  }

  return (
    <div className="mt-4">
      {[...groups.entries()].map(([groupName, items]) => (
        <div key={groupName ?? "default"} className="mt-3 first:mt-0">
          {groupName && (
            <h3 className="text-caption text-ink-muted">{groupName}</h3>
          )}
          <ul className="mt-1 divide-y divide-line-soft">
            {items.map((ing) => {
              const scaled = scaleQuantity(ing.quantity, base, servings);
              const display = formatQuantity(scaled, ing.unit);
              const _unitInQty = display === "a pinch";
              return (
                <IngredientRow
                  key={`${groupName ?? ""}-${ing.name}`}
                  ingredient={
                    _unitInQty
                      ? { ...ing, unit: null }
                      : ing
                  }
                  displayQuantity={display}
                  onAdd={onAdd}
                />
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

// scaleAndFormat is used in cooking mode (M3); keep the import live so the
// helper doesn't get tree-shaken in dev or marked unused.
void scaleAndFormat;
