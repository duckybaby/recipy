// Single recipe card on the Results screen (spec §4).
//
// Stripped to title / time / calories so the card is essentially a
// typographic block. This sets up Phase 3 — the title's `text-title` size
// matches the Recipe page's H1, so the shared-element morph from card to
// page header only has to translate, not scale. No image, no pills, no
// availability state on the card itself (those live on the Recipe page).

import { motion } from "framer-motion";
import { Link, useNavigationType } from "react-router-dom";
import { useStore } from "../lib/store";
import type { Recipe } from "../lib/types";

// The h3 title carries a `layoutId` matching the Recipe page's H1, so
// Framer Motion animates the title's position and width when the user
// taps in (forward direction). The card and the Recipe H1 use the same
// type token at each breakpoint so the morph is translate-only:
//   • phone (<md): both at `text-title` (~28–36px)
//   • md+:        both at `text-card-title` (~18–22px)
//
// On POP-driven mounts (user just hit back from Recipe → Results), we drop
// the layoutId so Framer doesn't run a competing reverse-morph while
// Recipe's wrapper is sliding off to the right. The card just appears.
//
// Tapping the card seeds the active recipe in the store so Recipe.tsx can
// read it synchronously on mount — avoids a one-frame "We couldn't find
// that recipe" flash if the lookup-by-id helper races with rehydration.
export function RecipeCard({ recipe }: { recipe: Recipe }) {
  const navType = useNavigationType();
  const enableMorph = navType !== "POP";
  const setActiveRecipe = useStore((s) => s.setActiveRecipe);

  return (
    <Link
      to={`/recipe/${recipe.id}`}
      state={{ recipe }}
      onClick={() => setActiveRecipe(recipe, "search")}
      className="focus-ring card card-interactive block rounded-card p-5"
    >
      <motion.h3
        layoutId={enableMorph ? `recipe-title-${recipe.id}` : undefined}
        // md:min-h-[2lh] floors the title at 2 line-heights so a 1-line title
        // ("Pho") reserves the same vertical space as a 2-line title. Without
        // it, the md 2-col layout (3 recipes → 2+1) leaves the lone row-2 card
        // visibly shorter than the two row-1 cards. Using `lh` (line-height
        // unit) so it tracks the type scale — no px to drift.
        className="line-clamp-2 text-title leading-tight text-ink md:line-clamp-3 md:min-h-[2lh] md:text-card-title"
      >
        {recipe.title}
      </motion.h3>

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-ink-muted">
        <span>
          {recipe.times.prepMinutes}m prep · {recipe.times.cookMinutes}m cook
        </span>
        <span aria-hidden>·</span>
        <span>{recipe.calories.perServing} kcal</span>
      </div>
    </Link>
  );
}

export function RecipeCardSkeleton() {
  return (
    <div className="card rounded-card p-5">
      <div className="h-8 w-5/6 animate-pulse rounded bg-paper-soft" />
      <div className="mt-2 h-8 w-3/5 animate-pulse rounded bg-paper-soft" />
      <div className="mt-4 h-3.5 w-2/3 animate-pulse rounded bg-paper-soft" />
    </div>
  );
}
