// Screen 3 — Recipe detail — spec §5.
//
// M1: loads from MOCK_RECIPES by URL param. Most sections are live (servings
// adjuster scales quantities; make-ahead nudge dismisses; feedback sheet
// opens). The recovery flows behind the sheet and the lateral actions
// ("More like this" / "Substitutions" / "Different recipe") are stubbed —
// they no-op visibly until M2 wires backend endpoints.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Clock,
  ExternalLink,
  Flame,
  Share2,
  ShoppingCart,
  Users,
} from "lucide-react";
import { findMockRecipe } from "../lib/mockRecipes";
import { IngredientRow } from "../components/IngredientRow";
import { ServingsAdjuster } from "../components/ServingsAdjuster";
import {
  FeedbackSheet,
  type FeedbackReason,
} from "../components/FeedbackSheet";
import {
  pushRecentRecipe,
  setActiveRecipe,
  dismissMakeahead,
  getDismissedMakeahead,
} from "../lib/storage";
import { scaleAndFormat, scaleQuantity, formatQuantity } from "../lib/scaling";
import type { Recipe as RecipeT } from "../lib/types";

function sentence(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function Recipe() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const recipe = useMemo(() => findMockRecipe(id), [id]);
  const [servings, setServings] = useState<number>(
    recipe?.servings.base ?? 2,
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const [makeAheadDismissed, setMakeAheadDismissed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Side effects on mount: persist as active recipe + push to recent
  // (spec §7.9). Also check dismissed-makeahead state.
  useEffect(() => {
    if (!recipe) return;
    setActiveRecipe({
      recipe,
      source: "search",
      openedAt: new Date().toISOString(),
    });
    pushRecentRecipe(recipe);
    setMakeAheadDismissed(getDismissedMakeahead().includes(recipe.id));
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

  const stubToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2500);
  };

  const onFeedbackSelect = (reason: FeedbackReason) => {
    setSheetOpen(false);
    // M1: recovery flows are M2 work.
    stubToast(`"${reason}" — recovery wired in M2.`);
  };

  const onAddIngredient = () => stubToast("Instamart cart — wired in M4.");

  const onReviewInstamart = () => stubToast("Instamart cart — wired in M4.");

  const onStartCooking = () => stubToast("Cooking mode — built in M3.");

  const onDismissMakeAhead = () => {
    dismissMakeahead(recipe.id);
    setMakeAheadDismissed(true);
  };

  // Scaled total calories don't change (calories are per serving, spec §5.1).
  // Times don't change either.
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
          onClick={() => stubToast("Share — wired post-v1.")}
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
        <h1 className="mt-3 text-title font-medium leading-snug text-ink">
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
          <div className="mt-5 rounded-button border border-warning-300 bg-warning-50 p-3">
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
        <dl className="mt-6 grid grid-cols-4 gap-2 rounded-xl border border-line bg-paper px-3 py-3 text-center">
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
            <h2 className="text-section font-medium text-ink">
              Ingredients
            </h2>
            <ServingsAdjuster servings={servings} onChange={setServings} />
          </header>

          <IngredientList recipe={recipe} servings={servings} onAdd={onAddIngredient} />

          {missingCount > 0 && (
            <button
              type="button"
              onClick={onReviewInstamart}
              className="focus-ring mt-3 inline-flex w-full items-center justify-center gap-2 rounded-button border border-warning-300 bg-warning-50 px-4 py-3 text-strong font-medium text-warning-800"
            >
              <ShoppingCart size={14} aria-hidden />
              Review {missingCount} missing on Instamart
            </button>
          )}
        </section>

        {/* 11. Pairs well with */}
        {recipe.pairsWith && recipe.pairsWith.length > 0 && (
          <p className="mt-6 text-body text-ink-muted">
            <span className="text-ink-muted">Pairs well with:</span>{" "}
            {recipe.pairsWith.join(", ")}
          </p>
        )}

        {/* 12. Steps preview */}
        <section className="mt-7">
          <h2 className="text-section font-medium text-ink">
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
            className="btn-outline focus-ring text-caption"
            onClick={() => stubToast("More like this — wired in M2.")}
          >
            More like this
          </button>
          <button
            type="button"
            className="btn-outline focus-ring text-caption"
            onClick={() => stubToast("Substitutions — wired in M2.")}
          >
            Substitutions
          </button>
          <button
            type="button"
            className="btn-outline focus-ring text-caption"
            onClick={() => stubToast("Different recipe — wired in M2.")}
          >
            Different recipe
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

      {/* Stub toast — replaces alert() during M1. */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="safe-pb fixed inset-x-0 bottom-4 z-50 mx-auto max-w-md px-5"
        >
          <div className="mx-auto rounded-button bg-ink px-3 py-2 text-center text-caption text-white shadow-lg">
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
              // formatQuantity returns "a pinch" for very small tsp values,
              // which already implies the unit. Suppress the unit in that case.
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
