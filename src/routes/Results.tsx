// Screen 2 — Results list — spec §4 (rewritten M2.1).
//
// Reads filters from the Zustand store. Reads the most recent batch of
// recipes from `store.lastSearch`. Whether to fetch or show the loader
// depends on the navigation INTENT, not on cache presence:
//
//   • intent === "fresh"       — user tapped Find recipes / More like this.
//                                Full-bleed loader. If lastSearch matches
//                                filters and is within TTL, hold loader for
//                                MIN_LOADER_MS then reveal cached. Otherwise
//                                fetch.
//   • intent === "regenerate"  — regenerate button on this page. Overlay
//                                loader, ALWAYS fetches (skips cache).
//   • no intent                — back from Recipe (POP), deep link, refresh.
//                                Render whatever's in store. No fetch.
//
// Intent is read from `location.state.intent` on mount, then consumed via
// `navigate(..., { replace: true, state: null })`. Wiping the state from
// the current history entry is what prevents refresh and POP-back from
// re-firing the fetch — both would otherwise see the same state.intent
// the original PUSH carried.
//
// One AbortController per in-flight fetch, scoped to the module so a
// regenerate or a new search from any mount aborts the previous one.
// Unmount does NOT abort — Strict Mode's double-invoke would otherwise
// kill the fetch we just started. Stale results are guarded by checking
// the controller's `aborted` flag before writing to the store.

import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, RotateCw } from "lucide-react";
import { RecipeCard, RecipeCardSkeleton } from "../components/RecipeCard";
import { Loader } from "../components/Loader";
import { summarizeFilters, toApiBody } from "../lib/filters";
import { api, ApiError } from "../lib/api";
import {
  filtersEqual,
  getFreshLastSearch,
  useStore,
} from "../lib/store";
import type { Recipe } from "../lib/types";

const TARGET_RECIPE_COUNT = 3;
const MIN_LOADER_MS = 600;
const TOAST_MS = 2500;

type Intent = "fresh" | "regenerate";

type Phase =
  | { kind: "initial" } // fresh load — loader full-bleed, no top bar yet
  | { kind: "regenerating" } // user tapped refresh — overlay over old cards
  | { kind: "ready" }
  | { kind: "error"; message: string };

/** Promise-style sleep that wakes early when the signal aborts. The caller
 *  must check `signal.aborted` after awaiting — we resolve either way so the
 *  await never throws. */
function sleepAbortable(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const t = window.setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });
}

// Single in-flight controller, scoped to the module rather than the
// component instance. Cross-mount aborts work even if the user navigates
// away mid-fetch and a new Results instance starts a different search —
// the second runSearch aborts the first without needing a cleanup function
// that React Strict Mode would also trip (dev's double-invoke would
// otherwise abort the fetch we just started).
let inFlightCtrl: AbortController | null = null;

export default function Results() {
  const navigate = useNavigate();
  const location = useLocation();

  const filters = useStore((s) => s.filters);
  const lastSearch = useStore((s) => s.lastSearch);

  // Read intent from location state at mount time. We consume it via
  // `navigate(..., { replace: true, state: null })` once we've kicked off
  // the search — that wipes the state from this history entry so refresh
  // and back-nav both stop seeing it. This replaces an earlier `navType`
  // gate that became unreliable with AnimatePresence + Routes location.
  const initialIntent: Intent | null =
    (location.state as { intent?: Intent } | null)?.intent ?? null;


  // Initial phase reflects what's about to happen, so the very first render
  // already shows the right surface (loader vs cards). No one-frame flash.
  const [phase, setPhase] = useState<Phase>(() => {
    if (initialIntent === "fresh") return { kind: "initial" };
    if (initialIntent === "regenerate") return { kind: "regenerating" };
    return { kind: "ready" };
  });
  const [streamed, setStreamed] = useState(0);
  // batchKey rotates whenever a new batch is committed — used as the key on
  // CardList so the stagger entry animation replays for fresh cards but
  // stays stable for back-nav.
  const [batchKey, setBatchKey] = useState(0);
  // Toast carries both message and tone so we can use the same component for
  // success ("New recipes found!") and failure ("Couldn't find anything else").
  const [toast, setToast] = useState<{
    message: string;
    variant: "success" | "info";
  } | null>(null);

  // Strict Mode runs the mount effect twice in dev — this ref keeps the
  // intent consumption (and the fetch) idempotent.
  const consumedRef = useRef(false);

  const runSearch = async (mode: Intent) => {
    // Abort any in-flight request — yours or someone else's — before
    // starting another. Lives at module scope on purpose: see comment above.
    inFlightCtrl?.abort();
    const ctrl = new AbortController();
    inFlightCtrl = ctrl;
    const startedAt = Date.now();

    setPhase(
      mode === "fresh" ? { kind: "initial" } : { kind: "regenerating" },
    );
    setStreamed(0);

    // Snapshot filters at call time. Reading from `filters` directly via
    // closure would be fine too, but `getState()` is robust against state
    // changing between scheduling and execution.
    const currentFilters = useStore.getState().filters;

    try {
      let recipes: Recipe[] | null = null;

      // Fresh-intent honours the cache when filters match. Regenerate is
      // an explicit "give me something new", so we skip the cache.
      if (mode === "fresh") {
        const cached = getFreshLastSearch();
        if (cached && filtersEqual(cached.filters, currentFilters)) {
          recipes = cached.recipes;
          setStreamed(cached.recipes.length);
        }
      }

      if (recipes === null) {
        const body = toApiBody(currentFilters);
        const { recipes: fetched } = await api.searchRecipes(
          body,
          () => {
            if (!ctrl.signal.aborted) setStreamed((n) => n + 1);
          },
          ctrl.signal,
          // Regenerate bypasses the backend cache so the user actually
          // gets different recipes, not the same batch we cached last time.
          { skipCache: mode === "regenerate" },
        );
        if (ctrl.signal.aborted) return;
        recipes = fetched;
        useStore.getState().setLastSearch({
          filters: currentFilters,
          recipes: fetched,
          fetchedAt: new Date().toISOString(),
        });
      }

      // Hold the loader so super-fast responses (cache hits, repeat queries)
      // still register as a deliberate state change rather than a flicker.
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, MIN_LOADER_MS - elapsed);
      if (remaining > 0) await sleepAbortable(remaining, ctrl.signal);
      if (ctrl.signal.aborted) return;

      setBatchKey((k) => k + 1);
      setPhase({ kind: "ready" });
      if (mode === "regenerate") {
        // Distinguish "found new recipes" from "ran but came up empty" —
        // both used to share the green success toast.
        const message =
          recipes.length > 0
            ? "New recipes found!"
            : "Couldn't find anything new — try different filters?";
        const variant: "success" | "info" =
          recipes.length > 0 ? "success" : "info";
        setToast({ message, variant });
        window.setTimeout(() => setToast(null), TOAST_MS);
      }
    } catch (err) {
      if (ctrl.signal.aborted) return;
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
    }
  };

  // Consume the navigation intent once on mount. We clear it from history
  // via replaceState so refresh and POP-back don't re-fire the fetch. The
  // ref guard prevents Strict Mode's dev-only double-invoke from firing
  // the fetch twice. No cleanup function on purpose — Strict Mode would
  // run it between the two effect calls and abort the fetch we just
  // started. The module-scoped `inFlightCtrl` handles cross-mount aborts.
  useEffect(() => {
    if (consumedRef.current) return;
    consumedRef.current = true;
    if (!initialIntent) return;
    // Clear the intent from the current history entry. Use the current path
    // (no search params; the store owns filters now) and null out state.
    navigate(location.pathname, { replace: true, state: null });
    void runSearch(initialIntent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------- ui
  const back = () => {
    // Prefer browser-back so Form's scroll/state restore naturally. Falls
    // back to a hard navigate when we landed here via deep link / refresh
    // (location.key === "default" indicates an initial entry with no prior).
    if (location.key === "default") navigate("/");
    else navigate(-1);
  };
  const retry = () => void runSearch("regenerate");

  const recipes = lastSearch?.recipes ?? [];
  const showFullBleedLoader = phase.kind === "initial";
  const showOverlayLoader = phase.kind === "regenerating";
  const topBarVisible = phase.kind !== "initial";

  if (phase.kind === "error") {
    return (
      <>
        <TopBar
          onBack={back}
          onRetry={retry}
          loading={false}
          filtersSummary={summarizeFilters(filters)}
        />
        <main
          className="mx-auto max-w-md px-5 pt-2"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}
        >
          <ErrorState message={phase.message} onRetry={retry} onBack={back} />
        </main>
      </>
    );
  }

  // Full-bleed loader: returned as a standalone block so the parent
  // motion.div's transform doesn't trap fixed-positioned children on Safari.
  if (showFullBleedLoader) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-paper">
        <div className="flex-1">
          <Loader streamed={streamed} target={TARGET_RECIPE_COUNT} />
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Top bar — hidden during first load so the loader has a full-bleed
          stage. After load, fades in along with the cards. */}
      <div
        className={`transition-opacity duration-200 ease-out ${
          topBarVisible ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <TopBar
          onBack={back}
          onRetry={retry}
          loading={phase.kind === "regenerating"}
          filtersSummary={summarizeFilters(
            lastSearch?.filters ?? filters,
          )}
        />
      </div>

      <Toast
        message={toast?.message ?? ""}
        variant={toast?.variant ?? "success"}
        visible={toast !== null}
      />

      <main
        className="mx-auto max-w-md px-5 pt-2"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}
      >
        {recipes.length === 0 && phase.kind === "ready" ? (
          <EmptyState onBack={back} />
        ) : (
          <CardList recipes={recipes} batchKey={batchKey} />
        )}
      </main>

      {/* Regenerate overlay — opaque cover over the existing cards so the
          old set doesn't flicker mid-swap. Sits below the top bar so the
          user can still cancel/back. */}
      {showOverlayLoader && (
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
      {Array.from({
        length: Math.max(0, TARGET_RECIPE_COUNT - recipes.length),
      }).map((_, i) => (
        <RecipeCardSkeleton key={`skeleton-${i}`} />
      ))}
    </div>
  );
}

function Toast({
  message,
  variant,
  visible,
}: {
  message: string;
  variant: "success" | "info";
  visible: boolean;
}) {
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

  // Green frosted for success, dark ink for "tried and didn't find anything".
  // Same shape; the colour swap is the only signal we use to differentiate.
  const background =
    variant === "success"
      ? "rgba(45, 106, 79, 0.55)"
      : "rgba(28, 28, 28, 0.75)";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-x-0 z-30 mx-auto max-w-md px-5 transition-all duration-200 ease-out ${
        visible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none -translate-y-3 opacity-0"
      }`}
      style={{ top: "calc(max(env(safe-area-inset-top), 8px) + 88px)" }}
    >
      <div
        className="rounded-button px-4 py-3 text-center text-strong font-medium text-paper shadow-soft backdrop-blur-lg"
        style={{ background }}
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
        <button type="button" className="btn-outline focus-ring" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}
