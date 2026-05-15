// Screen 2 — Results list — spec §4.
//
// Reads filters from URL, fetches /api/search-recipes, renders the cards.
// Persists the result to `last-search` localStorage (spec §7.9) so a
// refresh inside 24h doesn't re-hit the API.

import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { RecipeCard, RecipeCardSkeleton } from "../components/RecipeCard";
import {
  decodeFilters,
  summarizeFilters,
  toApiBody,
} from "../lib/filterEncoding";
import { api, ApiError } from "../lib/api";
import { getLastSearch, setLastSearch } from "../lib/storage";
import type { Recipe } from "../lib/types";

type State =
  | { kind: "loading" }
  | { kind: "ok"; recipes: Recipe[] }
  | { kind: "error"; message: string };

export default function Results() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const filters = decodeFilters(params);
  const filtersKey = params.toString();

  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });

    // 1) Try the localStorage cache first — instant render when she refreshes
    //    or navigates back within 24 hours.
    const cached = getLastSearch();
    if (cached && JSON.stringify(cached.filters) === JSON.stringify(filters)) {
      setState({ kind: "ok", recipes: cached.recipes });
      return; // don't re-fetch on identical filters within the TTL.
    }

    // 2) Real API call.
    (async () => {
      try {
        const body = toApiBody(filters);
        const { recipes } = await api.searchRecipes(body);
        if (cancelled) return;
        setLastSearch({
          filters,
          recipes,
          fetchedAt: new Date().toISOString(),
        });
        setState({ kind: "ok", recipes });
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Something went wrong";
        setState({ kind: "error", message });
      }
    })();

    return () => {
      cancelled = true;
    };
    // We use the URL string as the dep so identical filters don't re-fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  const back = () => navigate({ pathname: "/", search: params.toString() });
  const retry = () => {
    // Force a fresh fetch by clearing the cached filters check.
    setState({ kind: "loading" });
    // Re-trigger effect by toggling a noop param (or just call directly).
    (async () => {
      try {
        const body = toApiBody(filters);
        const { recipes } = await api.searchRecipes(body);
        setLastSearch({
          filters,
          recipes,
          fetchedAt: new Date().toISOString(),
        });
        setState({ kind: "ok", recipes });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Something went wrong";
        setState({ kind: "error", message });
      }
    })();
  };

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

      {state.kind === "loading" ? (
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
      ) : state.kind === "error" ? (
        <ErrorState message={state.message} onRetry={retry} onBack={back} />
      ) : state.recipes.length === 0 ? (
        <EmptyState onBack={back} />
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {state.recipes.map((r) => (
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

function ErrorState({
  message,
  onRetry,
  onBack,
}: {
  message: string;
  onRetry: () => void;
  onBack: () => void;
}) {
  return (
    <div className="mt-12 flex flex-col items-center text-center">
      <h2 className="text-section font-medium text-ink">
        Couldn't load recipes
      </h2>
      <p className="mt-2 text-body text-ink-muted">{message}</p>
      <div className="mt-6 flex gap-2">
        <button
          type="button"
          className="btn-primary focus-ring"
          onClick={onRetry}
        >
          Try again
        </button>
        <button
          type="button"
          className="btn-outline focus-ring"
          onClick={onBack}
        >
          Back
        </button>
      </div>
    </div>
  );
}
