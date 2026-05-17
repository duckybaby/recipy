// Screen 2 — Results list — spec §4.
//
// Reads filters from URL, streams /api/search-recipes (NDJSON), renders
// cards as each recipe arrives. Persists the result to `last-search`
// localStorage (spec §7.9) so a refresh inside 24h skips the network.
//
// Entrance choreography (Phase 4):
//   First search: loader is full-bleed (top bar hidden). When recipes
//     arrive, top bar fades in and cards stagger up from the bottom.
//   Regenerate: loader covers the existing card area as an opaque overlay
//     (top bar stays). New recipes ready → toast "New recipes found!" at
//     the top, then a fresh card stagger replaces the old set.
//
// Min loader display is 600ms so cache-hit-fast responses still play the
// intro animation rather than flicker.

import { useEffect, useRef, useState } from "react";
import {
  useSearchParams,
  useNavigate,
  useNavigationType,
} from "react-router-dom";
import { ArrowLeft, RotateCw } from "lucide-react";
import { RecipeCard, RecipeCardSkeleton } from "../components/RecipeCard";
import { Loader, useMinDisplay } from "../components/Loader";
import {
  decodeFilters,
  summarizeFilters,
  toApiBody,
} from "../lib/filterEncoding";
import { api, ApiError } from "../lib/api";
import { getLastSearch, setLastSearch } from "../lib/storage";
import type { Recipe, SearchFilters } from "../lib/types";

const TARGET_RECIPE_COUNT = 3;
const MIN_LOADER_MS = 600;
const TOAST_MS = 2500;

type Phase =
  | { kind: "initial" } // fresh load — loader full-bleed, no top bar yet
  | { kind: "regenerating" } // user tapped refresh — overlay over old cards
  | { kind: "ready" }
  | { kind: "error"; message: string };

/** Look up cached recipes for these filters, returning null if absent or
    stale. Used both in the useState initializer (to avoid a one-frame
    loader flash on back nav) and inside runSearch. */
function findCachedRecipes(filters: SearchFilters): Recipe[] | null {
  const cached = getLastSearch();
  if (!cached) return null;
  if (JSON.stringify(cached.filters) !== JSON.stringify(filters)) return null;
  return cached.recipes;
}

export default function Results() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const navType = useNavigationType();
  const filters = decodeFilters(params);
  const filtersKey = params.toString();

  // Loader policy is action-based, not cache-based:
  //   • PUSH navigation (Form → "Find recipes") with no cache → full loader.
  //   • Regenerate button tap → overlay loader.
  //   • Anything else (POP back from Recipe, hard refresh, deep link) →
  //     no loader, ever. Skeletons render inline while the fetch runs
  //     quietly in the background. The user only sees a loader for
  //     actions they explicitly initiated.
  const [phase, setPhase] = useState<Phase>(() => {
    if (findCachedRecipes(filters)) return { kind: "ready" };
    if (navType === "PUSH") return { kind: "initial" };
    return { kind: "ready" };
  });
  const [recipes, setRecipes] = useState<Recipe[]>(
    () => findCachedRecipes(filters) ?? [],
  );
  const [streamed, setStreamed] = useState(() => recipes.length);
  // `fetchSettled` is true once a fetch (or cache hit) has resolved. Used
  // to gate the EmptyState: without it, a POP mount with no cache would
  // flash "Nothing great came back" before the background fetch returns.
  const [fetchSettled, setFetchSettled] = useState(
    () => findCachedRecipes(filters) !== null,
  );
  // Rekeying the card list re-fires the stagger animation when the batch
  // swaps on regenerate.
  const [batchKey, setBatchKey] = useState(0);
  const [toastVisible, setToastVisible] = useState(false);

  const isLoading = phase.kind === "initial" || phase.kind === "regenerating";
  const heldLoading = useMinDisplay(isLoading, MIN_LOADER_MS);

  // ---------------------------------------------------------------- fetch
  // Common search routine. `mode` distinguishes the first mount (which uses
  // the localStorage cache) from a user-initiated regenerate (which skips
  // cache and shows the toast on success).
  const runSearch = (
    nextFilters: SearchFilters,
    mode: "initial" | "regenerate",
  ) => {
    const ctrl = new AbortController();
    let cancelled = false;

    // Cache check first for "initial" mode — fresh cache → straight to
    // ready, no fetch, no transition.
    if (mode === "initial") {
      const cached = findCachedRecipes(nextFilters);
      if (cached) {
        setRecipes(cached);
        setStreamed(cached.length);
        setBatchKey((k) => k + 1);
        setPhase({ kind: "ready" });
        setFetchSettled(true);
        return () => {
          cancelled = true;
          ctrl.abort();
        };
      }
    }

    // Cache miss / regenerate. Loader policy:
    //   • regenerate → always show overlay loader.
    //   • initial + PUSH → full-bleed loader (user just tapped Find recipes).
    //   • initial + POP / other → no loader (background fetch with
    //     skeletons rendered inline by CardList).
    if (mode === "regenerate") {
      setPhase({ kind: "regenerating" });
    } else if (navType === "PUSH") {
      setPhase({ kind: "initial" });
    } else {
      // Background fetch — phase stays "ready", recipes stays empty,
      // skeletons fill the slot until the API returns.
      setPhase({ kind: "ready" });
    }
    setStreamed(0);
    setFetchSettled(false);

    (async () => {
      try {
        const body = toApiBody(nextFilters);
        const { recipes: result } = await api.searchRecipes(
          body,
          () => {
            if (cancelled) return;
            setStreamed((n) => n + 1);
          },
          ctrl.signal,
        );
        if (cancelled) return;
        setLastSearch({
          filters: nextFilters,
          recipes: result,
          fetchedAt: new Date().toISOString(),
        });
        setRecipes(result);
        setStreamed(result.length);
        setBatchKey((k) => k + 1);
        setPhase({ kind: "ready" });
        setFetchSettled(true);
        if (mode === "regenerate") {
          setToastVisible(true);
          window.setTimeout(() => setToastVisible(false), TOAST_MS);
        }
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
        setPhase({ kind: "error", message });
        setFetchSettled(true);
      }
    })();

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  };

  // Kick off on mount + whenever URL filters change. Deps via URL string so
  // identical filters don't re-fetch.
  useEffect(() => {
    return runSearch(filters, "initial");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  // ---------------------------------------------------------------- ui
  const back = () => navigate({ pathname: "/", search: params.toString() });
  const retry = () => runSearch(filters, "regenerate");

  const showFullBleedLoader = phase.kind === "initial" && heldLoading;
  const showOverlayLoader =
    phase.kind === "regenerating" || (heldLoading && phase.kind === "ready" && recipes.length === 0);

  // First-load top bar is hidden until we land in ready/error.
  const topBarVisible = phase.kind !== "initial";

  if (phase.kind === "error") {
    return (
      <>
        <TopBar onBack={back} onRetry={retry} loading={false} filtersSummary={summarizeFilters(filters)} />
        <main
          className="mx-auto max-w-md px-5 pt-2"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}
        >
          <ErrorState message={phase.message} onRetry={retry} onBack={back} />
        </main>
      </>
    );
  }

  return (
    <>
      {/* Top bar — hidden during first load to give the loader a full-bleed
          stage. Once we have results (or are regenerating), the bar fades in. */}
      <div
        className={`transition-opacity duration-200 ease-out ${
          topBarVisible ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <TopBar
          onBack={back}
          onRetry={retry}
          loading={isLoading}
          filtersSummary={summarizeFilters(filters)}
        />
      </div>

      {/* Toast — sits below the top bar, slides down on success after a
          regenerate, auto-dismisses after 2.5s. */}
      <Toast message="New recipes found!" visible={toastVisible} />

      <main
        className="mx-auto max-w-md px-5 pt-2"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}
      >
        {showFullBleedLoader ? (
          <FullBleedLoader streamed={streamed} />
        ) : recipes.length === 0 && phase.kind === "ready" && fetchSettled ? (
          <EmptyState onBack={back} />
        ) : (
          <CardList recipes={recipes} batchKey={batchKey} />
        )}
      </main>

      {/* Regenerate overlay — opaque loader on top of the existing card area
          so the cards don't flicker mid-swap. Sits below the top bar so the
          user can still cancel/back. */}
      {showOverlayLoader && phase.kind !== "initial" && (
        <div
          className="fixed inset-x-0 bottom-0 z-10 bg-paper"
          style={{
            top: "calc(max(env(safe-area-inset-top), 8px) + 88px)",
          }}
        >
          <Loader streamed={streamed} target={TARGET_RECIPE_COUNT} />
        </div>
      )}
    </>
  );
}

// ============================================================ subcomponents

function TopBar({
  onBack,
  onRetry,
  loading,
  filtersSummary,
}: {
  onBack: () => void;
  onRetry: () => void;
  loading: boolean;
  filtersSummary: string;
}) {
  return (
    <div
      className="sticky top-0 z-20 bg-paper/60 backdrop-blur-lg"
      style={{ paddingTop: "max(env(safe-area-inset-top), 8px)" }}
    >
      <div className="mx-auto flex max-w-md items-center gap-1 px-3">
        <button
          type="button"
          aria-label="Back to filters"
          onClick={onBack}
          className="focus-ring inline-flex h-10 w-10 shrink-0 items-center justify-center text-ink"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-strong font-semibold text-ink">Recipes</h1>
        <button
          type="button"
          aria-label="Regenerate results"
          onClick={onRetry}
          disabled={loading}
          className="focus-ring ml-auto inline-flex h-10 w-10 shrink-0 items-center justify-center text-ink disabled:opacity-40"
        >
          <RotateCw size={18} className={loading ? "animate-spin" : ""} />
        </button>
      </div>
      <button
        type="button"
        onClick={onBack}
        className="focus-ring block w-full px-5 pt-1 pb-2 text-left"
      >
        <span className="block truncate text-caption text-ink-muted">
          {filtersSummary}
        </span>
      </button>
    </div>
  );
}

function FullBleedLoader({ streamed }: { streamed: number }) {
  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-paper">
      <div className="flex-1">
        <Loader streamed={streamed} target={TARGET_RECIPE_COUNT} />
      </div>
    </div>
  );
}

function CardList({
  recipes,
  batchKey,
}: {
  recipes: Recipe[];
  batchKey: number;
}) {
  return (
    <div key={batchKey} className="mt-4 flex flex-col gap-4">
      {recipes.map((r, i) => (
        <div
          key={r.id}
          className="card-rise"
          style={{ animationDelay: `${i * 90}ms` }}
        >
          <RecipeCard recipe={r} />
        </div>
      ))}
      {Array.from({ length: Math.max(0, TARGET_RECIPE_COUNT - recipes.length) }).map(
        (_, i) => (
          <RecipeCardSkeleton key={`skeleton-${i}`} />
        ),
      )}
    </div>
  );
}

function Toast({ message, visible }: { message: string; visible: boolean }) {
  // Track mount lifecycle so the toast can animate both in and out cleanly.
  const [mounted, setMounted] = useState(visible);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      return;
    }
    timeoutRef.current = window.setTimeout(() => setMounted(false), 220);
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, [visible]);

  if (!mounted) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-x-0 z-30 mx-auto max-w-md px-5 transition-all duration-200 ease-out ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-3 opacity-0"
      }`}
      style={{ top: "calc(max(env(safe-area-inset-top), 8px) + 88px)" }}
    >
      <div
        className="rounded-button px-4 py-3 text-center text-strong font-medium text-paper shadow-soft backdrop-blur-lg"
        style={{ background: "rgba(45, 106, 79, 0.55)" }}
      >
        {message}
      </div>
    </div>
  );
}

function EmptyState({ onBack }: { onBack: () => void }) {
  return (
    <div className="mt-12 flex flex-col items-center text-center">
      <h2 className="text-section text-ink">Nothing great came back</h2>
      <p className="mt-2 text-body text-ink-muted">Try different filters?</p>
      <button
        type="button"
        className="btn-primary focus-ring mt-6"
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
      <h2 className="text-section text-ink">Couldn't load recipes</h2>
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
