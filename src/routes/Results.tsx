// Screen 2 — Results list — spec §4.
//
// M1: reads filters from URL, briefly shows a skeleton state, then renders
// hand-crafted mock recipes. M2 will swap mock data for the real
// /api/search-recipes response.

import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { RecipeCard, RecipeCardSkeleton } from "../components/RecipeCard";
import { decodeFilters, summarizeFilters } from "../lib/filterEncoding";
import { MOCK_RECIPES } from "../lib/mockRecipes";
import type { Recipe } from "../lib/types";

// Simulate the network-bound search delay so we exercise the skeleton state
// before the real Anthropic call is wired up. ~600ms feels like fast 4G.
const MOCK_SEARCH_DELAY_MS = 600;

export default function Results() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const filters = decodeFilters(params);

  const [recipes, setRecipes] = useState<Recipe[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRecipes(null);
    const t = window.setTimeout(() => {
      if (cancelled) return;
      // M1 mock: always return the same set. M2 will pass filters to the API.
      setRecipes(MOCK_RECIPES);
    }, MOCK_SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
    // Re-fetch on filter changes — same dependency the real call will have.
  }, [params]);

  const back = () => navigate({ pathname: "/", search: params.toString() });

  return (
    <main className="mx-auto max-w-md px-5 pt-4 pb-12 safe-pt safe-pb">
      {/* Header strip: back arrow + filter summary (spec §4) */}
      <header className="flex items-center gap-2 py-2">
        <button
          type="button"
          aria-label="Back to form"
          onClick={back}
          className="focus-ring -ml-2 inline-flex h-11 w-11 items-center justify-center text-ink"
        >
          <ArrowLeft size={20} />
        </button>
        <button
          type="button"
          onClick={back}
          className="focus-ring flex-1 truncate text-left text-strong text-ink-muted"
        >
          {summarizeFilters(filters)}
        </button>
      </header>

      {recipes === null ? (
        <>
          <p className="mt-1 mb-4 text-caption text-ink-muted">
            Reading a few recipe sites for you.
          </p>
          <div className="flex flex-col gap-4">
            <RecipeCardSkeleton />
            <RecipeCardSkeleton />
            <RecipeCardSkeleton />
          </div>
        </>
      ) : recipes.length === 0 ? (
        <EmptyState onBack={back} />
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {recipes.map((r) => (
            <RecipeCard key={r.id} recipe={r} />
          ))}
        </div>
      )}
    </main>
  );
}

function EmptyState({ onBack }: { onBack: () => void }) {
  return (
    <div className="mt-12 flex flex-col items-center text-center">
      <h2 className="text-section font-medium text-ink">
        Nothing great came back
      </h2>
      <p className="mt-2 text-body text-ink-muted">
        Try different filters?
      </p>
      <button
        type="button"
        className="btn-primary mt-6 focus-ring"
        onClick={onBack}
      >
        Back to filters
      </button>
    </div>
  );
}
