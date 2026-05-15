// Single recipe card on the Results screen (spec §4).

import { Clock } from "lucide-react";
import { Link } from "react-router-dom";
import type { Recipe } from "../lib/types";

// Capitalize the first letter for display (spec sentence-case rule).
function sentence(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function availabilityPill(recipe: Recipe) {
  // M1: derived purely from mock data. M4 will replace with real
  // /api/check-instamart results.
  const missing = recipe.ingredients.filter(
    (i) => !i.instamart.available,
  ).length;
  if (missing === 0) {
    return (
      <span className="pill pill-success">All ingredients on Instamart</span>
    );
  }
  return (
    <span className="pill pill-warning">
      {missing} missing · tap to add
    </span>
  );
}

export function RecipeCard({ recipe }: { recipe: Recipe }) {
  return (
    <Link
      to={`/recipe/${recipe.id}`}
      state={{ recipe }}
      className="focus-ring card card-interactive block overflow-hidden"
    >
      {/* Image — neutral fallback when source has no image (spec §4) */}
      <div className="h-[140px] w-full bg-paper-soft">
        {recipe.source.imageUrl && (
          <img
            src={recipe.source.imageUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        )}
      </div>

      <div className="border-t-[2.5px] border-ink p-4">
        <h3 className="text-section font-bold leading-tight text-ink">
          {recipe.title}
        </h3>

        <div className="mt-2 flex items-center gap-1.5 text-caption text-ink-muted">
          <Clock size={13} aria-hidden />
          <span>
            {recipe.times.prepMinutes}m prep · {recipe.times.cookMinutes}m cook
          </span>
        </div>

        <div className="mt-1 text-caption text-ink-muted">
          {recipe.calories.perServing} kcal · {sentence(recipe.difficulty.label)}
        </div>

        <div className="mt-3">{availabilityPill(recipe)}</div>
      </div>
    </Link>
  );
}

export function RecipeCardSkeleton() {
  return (
    <div className="card overflow-hidden">
      <div className="h-[140px] w-full animate-pulse bg-paper-soft" />
      <div className="border-t-[2.5px] border-ink p-4">
        <div className="h-4 w-3/4 animate-pulse rounded bg-paper-soft" />
        <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-paper-soft" />
        <div className="mt-1 h-3 w-2/5 animate-pulse rounded bg-paper-soft" />
        <div className="mt-3 h-6 w-32 animate-pulse rounded-full bg-paper-soft" />
      </div>
    </div>
  );
}
