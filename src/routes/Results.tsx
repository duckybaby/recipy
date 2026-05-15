// Screen 2 — Results list — spec §4.
//
// Reads filters from URL, streams /api/search-recipes (NDJSON), renders
// cards as each recipe arrives. Persists the result to `last-search`
// localStorage (spec §7.9) so a refresh inside 24h skips the network.

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

// We tell Claude to return exactly 3 recipes (see functions/src/prompts.ts).
const TARGET_RECIPE_COUNT = 3;

// Cycle through these while we wait for the first recipe to stream in.
// Hidden the moment any card lands.
const PROGRESS_MESSAGES = [
  "Reading a few recipe sites for you.",
  "Comparing options.",
  "Reading the cooking steps.",
  "Polishing the cards.",
  "Almost there.",
];

type State =
  | { kind: "loading"; recipes: Recipe[] } // recipes streaming in
  | { kind: "ok"; recipes: Recipe[] }
  | { kind: "error"; message: string };

export default function Results() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const filters = decodeFilters(params);
  const filtersKey = params.toString();

  const [state, setState] = useState<State>({ kind: "loading", recipes: [] });
  const [progressIndex, setProgressIndex] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    let cancelled = false;
    setState({ kind: "loading", recipes: [] });
    setProgressIndex(0);

    // 1) Try the localStorage cache first — instant render when she refreshes
    //    or navigates back within 24 hours.
    const cached = getLastSearch();
    if (cached && JSON.stringify(cached.filters) === JSON.stringify(filters)) {
      setState({ kind: "ok", recipes: cached.recipes });
      return; // don't re-fetch on identical filters within the TTL.
    }

    // 2) Streaming API call — each recipe pushes a state update.
    (async () => {
      try {
        const body = toApiBody(filters);
        const { recipes } = await api.searchRecipes(
          body,
          (recipe) => {
            if (cancelled) return;
            setState((prev) =>
              prev.kind === "loading"
                ? { kind: "loading", recipes: [...prev.recipes, recipe] }
                : prev,
            );
          },
          ctrl.signal,
        );
        if (cancelled) return;
        setLastSearch({
          filters,
          recipes,
          fetchedAt: new Date().toISOString(),
        });
        setState({ kind: "ok", recipes });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        const raw =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : null;
        const message =
          raw && raw.trim().length > 0
            ? raw
            : "The recipe service is misbehaving. Try again in a moment.";
        setState({ kind: "error", message });
      }
    })();

    return () => {
      cancelled = true;
      ctrl.abort();
    };
    // We use the URL string as the dep so identical filters don't re-fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  // Cycle progress copy while waiting for the first recipe.
  const showProgress = state.kind === "loading" && state.recipes.length === 0;
  useEffect(() => {
    if (!showProgress) return;
    const id = window.setInterval(() => {
      setProgressIndex((i) => (i + 1) % PROGRESS_MESSAGES.length);
    }, 3000);
    return () => window.clearInterval(id);
  }, [showProgress]);

  const back = () => navigate({ pathname: "/", search: params.toString() });
  const retry = () => {
    // Bumping a noop URL param doesn't help because filtersKey is the dep
    // — just re-run the effect by clearing the cache and forcing a fetch.
    setState({ kind: "loading", recipes: [] });
    const ctrl = new AbortController();
    (async () => {
      try {
        const body = toApiBody(filters);
        const { recipes } = await api.searchRecipes(
          body,
          (recipe) =>
            setState((prev) =>
              prev.kind === "loading"
                ? { kind: "loading", recipes: [...prev.recipes, recipe] }
                : prev,
            ),
          ctrl.signal,
        );
        setLastSearch({
          filters,
          recipes,
          fetchedAt: new Date().toISOString(),
        });
        setState({ kind: "ok", recipes });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
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

      {state.kind === "error" ? (
        <ErrorState message={state.message} onRetry={retry} onBack={back} />
      ) : state.kind === "loading" && state.recipes.length === 0 ? (
        <LoadingState progressIndex={progressIndex} />
      ) : state.kind === "ok" && state.recipes.length === 0 ? (
        <EmptyState onBack={back} />
      ) : (
        <StreamingList
          recipes={state.recipes}
          loading={state.kind === "loading"}
        />
      )}
    </main>
  );
}

function LoadingState({ progressIndex }: { progressIndex: number }) {
  return (
    <>
      <p
        className="mt-1 mb-4 text-caption text-ink-muted transition-opacity duration-300"
        aria-live="polite"
      >
        {PROGRESS_MESSAGES[progressIndex]}
      </p>
      <div className="flex flex-col gap-4">
        {Array.from({ length: TARGET_RECIPE_COUNT }).map((_, i) => (
          <RecipeCardSkeleton key={i} />
        ))}
      </div>
    </>
  );
}

function StreamingList({
  recipes,
  loading,
}: {
  recipes: Recipe[];
  loading: boolean;
}) {
  // Render real cards for each recipe we have, and skeletons for the
  // slots we're still waiting on (only while loading).
  const pending = loading
    ? Math.max(0, TARGET_RECIPE_COUNT - recipes.length)
    : 0;
  return (
    <div className="mt-4 flex flex-col gap-4">
      {recipes.map((r) => (
        <RecipeCard key={r.id} recipe={r} />
      ))}
      {Array.from({ length: pending }).map((_, i) => (
        <RecipeCardSkeleton key={`skeleton-${i}`} />
      ))}
    </div>
  );
}

function EmptyState({ onBack }: { onBack: () => void }) {
  return (
    <div className="mt-12 flex flex-col items-center text-center">
      <h2 className="text-section font-bold text-ink">
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
      <h2 className="text-section font-bold text-ink">
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
