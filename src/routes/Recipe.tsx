// Screen 3 — Recipe detail (spec §5, v1.2).
//
// Layout
//   • Top bar (sticky): back · [compact title on scroll] · share · kebab.
//   • Cream "identity" block: title (large), source, pills, pairs, make-ahead.
//   • Stats row: inline on white below the cream.
//   • Tab strip (sticky, full-bleed frosted): Recipe · Equipment · Ingredients.
//   • Tab content: scrollable, no progressive disclosure on steps.
//   • Bottom CTA: full pill at rest, shrinks to a circular ChefHat FAB on
//     scroll-down, expands back when the user scrolls up ~10% of viewport.
//   • Kebab → ActionSheet with the four recovery actions.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  ArrowLeft,
  ChefHat,
  CheckCircle2,
  Clock,
  Flame,
  MoreVertical,
  Share2,
  ShoppingCart,
  Users,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { HugeiconsIcon } from "@hugeicons/react";
import { iconFor as equipmentIconFor } from "../lib/equipmentIcons";
import { Loader } from "../components/Loader";
import { IngredientRow } from "../components/IngredientRow";
import { ServingsAdjuster } from "../components/ServingsAdjuster";
import {
  FeedbackSheet,
  type FeedbackReason,
} from "../components/FeedbackSheet";
import {
  ActionSheet,
  type ActionSheetAction,
} from "../components/ActionSheet";
import {
  pushRecentRecipe,
  getRecentRecipes,
} from "../lib/storage";
import { findRecipeInStore, useStore } from "../lib/store";
import { api, ApiError } from "../lib/api";
import {
  scaleAndFormat,
  scaleQuantity,
  formatQuantity,
} from "../lib/scaling";
import { applySubstitutions } from "../lib/substitutions";
import type { Recipe as RecipeT } from "../lib/types";

function sentence(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

type TabKey = "recipe" | "equipment" | "ingredients";

const TABS: { key: TabKey; label: string }[] = [
  { key: "recipe", label: "Recipe" },
  { key: "equipment", label: "Equipment" },
  { key: "ingredients", label: "Ingredients" },
];
const TAB_ORDER = TABS.map((t) => t.key);

// Directional slide variants for the tab content area. `direction` is
// +1 when moving rightward in the tab order, -1 when moving leftward.
// New content enters from the matching direction; old content exits in
// the opposite direction so the two move together.
const TAB_SLIDE_VARIANTS: Variants = {
  enter: (dir: number) => ({ x: dir * 48, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir * -48, opacity: 0 }),
};

/** Find a recipe by id across all client-side caches. Checks the Zustand
 *  store first (activeRecipe + lastSearch.recipes) then falls back to the
 *  recent-recipes list in localStorage. Direct deep links land here too. */
function lookupRecipe(id: string, fromState: RecipeT | null): RecipeT | null {
  if (fromState && fromState.id === id) return fromState;
  const fromStore = findRecipeInStore(id);
  if (fromStore) return fromStore;
  const recent = getRecentRecipes().find((r) => r.id === id);
  if (recent) return recent;
  return fromState;
}

export default function Recipe() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // Pull store actions once at the top so the JSX handlers stay tight. The
  // `useStore.getState()` pattern works too — we use that for snapshot reads
  // (filters at click time), and the hook for subscribed setters.
  const setActiveRecipeInStore = useStore((s) => s.setActiveRecipe);

  const initialRecipe = useMemo(() => {
    const stateRecipe =
      (location.state as { recipe?: RecipeT } | null)?.recipe ?? null;
    return lookupRecipe(id, stateRecipe);
  }, [id, location.state]);

  const [recipe, setRecipe] = useState<RecipeT | null>(initialRecipe);
  // The immediately-prior version, if any, lives on `recipe.previousVersion`
  // (set by onDifferentRecipe). The Results card and Recipe header now show
  // the current version's title — back-navigating to Results reflects the
  // swap. The compare-with-previous link reads from `recipe.previousVersion`.
  const [servings, setServings] = useState<number>(
    initialRecipe?.servings.base ?? 2,
  );
  const [activeTab, setActiveTab] = useState<TabKey>("recipe");
  // Tab-switch direction for the slide animation: +1 when moving
  // right in tab order (Recipe → Equipment), -1 when moving left.
  // Read by AnimatePresence's `custom` prop on the content wrapper.
  const [tabDirection, setTabDirection] = useState<1 | -1>(1);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [kebabOpen, setKebabOpen] = useState(false);
  const [makeAheadDismissed, setMakeAheadDismissed] = useState(false);
  const [toast, setToast] = useState<{
    msg: string;
    variant: "info" | "success";
  } | null>(null);
  const [substitutions, setSubstitutions] = useState<
    Record<string, string[]> | null
  >(null);
  const [substitutionsLoading, setSubstitutionsLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState<null | "more" | "different">(
    null,
  );

  // Applied ingredient substitutions, keyed by original ingredient name.
  // When the user taps "Substitute with: tofu" on a paneer row, this map
  // gets `{ paneer: "tofu" }`. The Recipe-tab step text live-rewrites
  // accordingly via applySubstitutions(). M3 cooking mode will read the
  // same map. State resets when the underlying recipe swaps.
  const [appliedSubs, setAppliedSubs] = useState<Record<string, string>>({});
  // Names of ingredients the user has checked for the Instamart batch
  // push. Defaults to none — explicit opt-in. State lives on Recipe (not
  // IngredientsTab) so it survives tab switches.
  const [selectedForInstamart, setSelectedForInstamart] = useState<
    Set<string>
  >(new Set());
  // Whether the Instamart batch check has been run for the current selection.
  // Flipping to true reveals the "X of Y available · Add to cart" panel.
  const [instamartChecked, setInstamartChecked] = useState(false);

  // Tabs sit in their natural DOM spot (below stats). When they scroll past
  // the top bar, we render a second copy inside the top bar's blur region —
  // same backdrop, no seam. We track that with a sentinel + IO below.
  const topBarRef = useRef<HTMLDivElement>(null);
  const tabSentinelRef = useRef<HTMLDivElement>(null);
  const inFlowTabsRef = useRef<HTMLDivElement>(null);
  const [topBarH, setTopBarH] = useState(0);
  const [tabsInBar, setTabsInBar] = useState(false);

  // Measure the top bar so we can offset the sentinel's intersection root.
  useLayoutEffect(() => {
    const el = topBarRef.current;
    if (!el) return;
    const measure = () => setTopBarH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Watch the sentinel that sits just below the in-flow tab strip. Once it
  // crosses the top-bar edge (with a small overshoot buffer, so the strip
  // scrolls past visibly before the in-bar copy takes over), the in-bar copy
  // fades in.
  useEffect(() => {
    const el = tabSentinelRef.current;
    if (!el || topBarH === 0) return;
    const overshoot = 24; // px the tabs may scroll past before the swap
    const effectiveTop = Math.max(0, topBarH - overshoot);
    const obs = new IntersectionObserver(
      ([entry]) => {
        const above = entry.boundingClientRect.top < effectiveTop;
        setTabsInBar(!entry.isIntersecting && above);
      },
      { rootMargin: `-${effectiveTop}px 0px 0px 0px`, threshold: [0, 1] },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [topBarH]);

  // -------- Title-in-top-bar via IntersectionObserver --------
  const inPageTitleRef = useRef<HTMLHeadingElement>(null);
  const [titleInBar, setTitleInBar] = useState(false);
  useEffect(() => {
    if (!inPageTitleRef.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        // Title is "out" when ≤30% of it is visible. Hysteresis-free since
        // IntersectionObserver fires on threshold crossing.
        setTitleInBar(entry.intersectionRatio < 0.3);
      },
      { threshold: [0, 0.3, 1] },
    );
    obs.observe(inPageTitleRef.current);
    return () => obs.disconnect();
  }, [recipe?.id]);

  // -------- Scroll-direction CTA mode (full pill ↔ ChefHat FAB) --------
  // Cumulative up-scroll of 30% viewport-height re-expands the full pill.
  // Any meaningful down-scroll past 200px collapses it to a FAB.
  const [ctaMode, setCtaMode] = useState<"full" | "fab">("full");
  const lastYRef = useRef(0);
  const upAccumRef = useRef(0);
  const downAccumRef = useRef(0);
  useEffect(() => {
    lastYRef.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const dy = y - lastYRef.current;
      lastYRef.current = y;
      if (dy > 0) {
        upAccumRef.current = 0;
        downAccumRef.current += dy;
        if (y > 200 && downAccumRef.current > 40) {
          setCtaMode((m) => (m === "fab" ? m : "fab"));
        }
      } else if (dy < 0) {
        downAccumRef.current = 0;
        upAccumRef.current += -dy;
        const threshold = window.innerHeight * 0.3;
        if (upAccumRef.current > threshold) {
          setCtaMode((m) => (m === "full" ? m : "full"));
        }
      }
      // Near the top of the page → always show the full pill.
      if (y < 80) setCtaMode("full");
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Persist as active + push to recent. Reset session bits on recipe swap,
  // and kick off the substitutions fetch — that section now renders inline
  // under the steps so it needs to be ready before the user scrolls.
  useEffect(() => {
    if (!recipe) return;
    setActiveRecipeInStore(recipe, "search");
    pushRecentRecipe(recipe);
    setSubstitutions(null);
    setServings(recipe.servings.base);
    setMakeAheadDismissed(false);
    setAppliedSubs({});
    setSelectedForInstamart(new Set());
    setInstamartChecked(false);

    let cancelled = false;
    setSubstitutionsLoading(true);
    api
      .getSubstitutions(recipe.ingredients)
      .then(({ substitutions: subs }) => {
        if (cancelled) return;
        setSubstitutions(subs);
      })
      .catch(() => {
        // Silent — the section hides itself if subs never arrive.
      })
      .finally(() => {
        if (!cancelled) setSubstitutionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
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

  const showToast = (msg: string) => {
    setToast({ msg, variant: "info" });
    window.setTimeout(() => setToast(null), 2800);
  };
  const showSuccessToast = (msg: string) => {
    setToast({ msg, variant: "success" });
    window.setTimeout(() => setToast(null), 2500);
  };

  // Real browser-back so Results restores its scroll position and the
  // previous batch from the store without remounting fresh. Fallback to a
  // PUSH to /results only when there's no history (deep link / refresh).
  const back = () => {
    if (location.key === "default") navigate("/results");
    else navigate(-1);
  };

  // ---------- Substitution handlers ----------
  const applySubstitute = (name: string, sub: string) =>
    setAppliedSubs((prev) => ({ ...prev, [name]: sub }));
  const resetSubstitute = (name: string) =>
    setAppliedSubs((prev) => {
      const { [name]: _drop, ...rest } = prev;
      return rest;
    });

  // ---------- Instamart selection handlers ----------
  const toggleIngredientSelection = (name: string) => {
    setInstamartChecked(false); // selection change invalidates the last check
    setSelectedForInstamart((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };
  const runInstamartCheck = () => setInstamartChecked(true);
  const openInstamartCart = () =>
    showToast("Instamart cart — wired in M4.");

  // Switching tabs while the in-flow strip is already under the top bar means
  // the user is scrolled past it — short tabs (Equipment) could leave the
  // viewport showing empty space. Snap the page so the in-flow strip aligns
  // just under the top bar, so the new tab's content is at the top of view.
  // If the user is above that point, leave the scroll alone.
  //
  // We defer one frame so React renders the new tab content first. Switching
  // from a tall tab (Equipment with 26 cards) to a shorter one (Ingredients)
  // shrinks the page; the browser auto-clamps scrollY to the new max, which
  // would otherwise leave the user stuck at the bottom of the new tab.
  const handleTabChange = (next: TabKey) => {
    // Direction for the slide animation — derived from tab order so
    // Recipe → Equipment slides one way, Ingredients → Recipe the other.
    const fromIdx = TAB_ORDER.indexOf(activeTab);
    const toIdx = TAB_ORDER.indexOf(next);
    setTabDirection(toIdx >= fromIdx ? 1 : -1);
    setActiveTab(next);
    if (!tabsInBar) return;
    requestAnimationFrame(() => {
      if (!inFlowTabsRef.current) return;
      const targetY =
        inFlowTabsRef.current.getBoundingClientRect().top +
        window.scrollY -
        topBarH;
      window.scrollTo({ top: targetY, behavior: "smooth" });
    });
  };

  // ---------- Kebab actions ----------
  const onMoreLikeThis = async () => {
    if (actionBusy) return;
    setActionBusy("more");
    try {
      // Bias the next search by the current dish, then push to /results
      // with the fresh intent so the loader shows + fetch runs (or cache
      // hits if Results saw this similarTo recently).
      const base = useStore.getState().filters;
      useStore
        .getState()
        .setFilters({ ...base, similarTo: recipe.title, surprise: false });
      navigate("/results", { state: { intent: "fresh" } });
    } finally {
      setActionBusy(null);
    }
  };

  const onDifferentRecipe = async () => {
    if (actionBusy) return;
    setActionBusy("different");
    try {
      const currentRecipe = recipe;
      const { recipe: alt } = await api.findAlternateSource(recipe.title, [
        recipe.source.url,
      ]);
      // Cap stored history at 2 versions per slot — strip the alt's own
      // previousVersion (defensive; API never sets it) and strip the
      // current's so the new previous never carries a grand-previous.
      const merged: RecipeT = {
        ...alt,
        previousVersion: { ...currentRecipe, previousVersion: undefined },
      };
      setRecipe(merged);
      // Reflect the swap in the Results list so back-nav shows the alternate
      // in the card the user tapped from. Match by the recipe.id we were
      // viewing, which works whether this is the first alt or a subsequent one.
      const last = useStore.getState().lastSearch;
      if (last) {
        useStore.getState().setLastSearch({
          ...last,
          recipes: last.recipes.map((r) =>
            r.id === currentRecipe.id ? merged : r,
          ),
        });
      }
      // Rewrite the URL to the alt's id (replace, not push) so refresh /
      // share resolves to the new recipe and back-nav goes straight to
      // Results, not to a /recipe/<old-id> that no longer matches the card.
      navigate(`/recipe/${alt.id}`, { replace: true });
      window.scrollTo({ top: 0, behavior: "auto" });
      showSuccessToast("New recipe found!");
    } catch (err) {
      showToast(
        err instanceof ApiError ? err.message : "No alternate source found.",
      );
    } finally {
      setActionBusy(null);
    }
  };

  const onComparePrevious = () =>
    showToast("Recipe comparison — coming in M2.");

  // ---------- Feedback recovery flows ----------
  const onFeedbackSelect = async (reason: FeedbackReason) => {
    setFeedbackOpen(false);
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
          showToast(
            err instanceof ApiError ? err.message : "Recompute failed.",
          );
        }
        break;
      }
      case "time-off": {
        try {
          const { value } = await api.recomputeField(recipe, "time");
          const prevTotal = recipe.times.totalMinutes || 1;
          const prepShare = recipe.times.prepMinutes / prevTotal;
          const newPrep = Math.max(0, Math.round(value * prepShare));
          const newCook = Math.max(0, value - newPrep);
          setRecipe({
            ...recipe,
            times: {
              prepMinutes: newPrep,
              cookMinutes: newCook,
              totalMinutes: value,
            },
          });
          showToast(`Updated total time to ${value} min.`);
        } catch (err) {
          showToast(
            err instanceof ApiError ? err.message : "Recompute failed.",
          );
        }
        break;
      }
      case "not-what-i-want":
        // Just take them back to results — they can pick a different card
        // from the same batch. No fetch.
        if (location.key === "default") navigate("/results");
        else navigate(-1);
        break;
    }
  };

  const onStartCooking = () => showToast("Cooking mode — built in M3.");

  // Sticky bottom CTA variant — derives from the Ingredients-tab selection
  // and check state. Default is "cook" (Start cooking). Selecting any
  // ingredient swaps it to "check" (Check Instamart, white). Running the
  // check swaps it to "add" (Add to cart, white).
  const ctaVariant: "cook" | "check" | "add" =
    selectedForInstamart.size === 0
      ? "cook"
      : instamartChecked
        ? "add"
        : "check";

  const onCtaTap = () => {
    if (ctaVariant === "cook") return onStartCooking();
    if (ctaVariant === "check") {
      runInstamartCheck();
      // Jump to Ingredients so the user lands on the result panel rather
      // than being on Recipe/Equipment with the check having vanished.
      setActiveTab("ingredients");
      return;
    }
    return openInstamartCart();
  };

  // Kebab keeps only tertiary recovery actions. Secondary actions
  // (substitutions, find different recipe) now live inline on the Recipe
  // tab so they're discoverable without needing to open this menu.
  const kebabActions: ActionSheetAction[] = [
    {
      id: "more",
      label: "More like this",
      onSelect: onMoreLikeThis,
      disabled: actionBusy === "more",
    },
    {
      id: "wrong",
      label: "Something looks wrong",
      onSelect: () => setFeedbackOpen(true),
    },
  ];

  return (
    <>
      <main className="pb-40">
        {/* Sticky top bar — single blur region. When the in-flow tabs scroll
            past, a second copy of the TabStrip slides in inside this same
            wrapper, so the blur stays one continuous surface (no seam). */}
        <div
          ref={topBarRef}
          className="sticky top-0 z-30 bg-paper/60 backdrop-blur-lg"
          style={{ paddingTop: "max(env(safe-area-inset-top), 8px)" }}
        >
          <div className="mx-auto flex max-w-md items-center gap-1 px-3 pb-2">
            <button
              type="button"
              aria-label="Back to results"
              onClick={back}
              className="focus-ring inline-flex h-10 w-10 shrink-0 items-center justify-center text-ink"
            >
              <ArrowLeft size={20} />
            </button>

            {/* Title fades in once the in-page title scrolls out. Tracks
                the currently-displayed recipe, including alt-swaps. */}
            <h2
              aria-hidden={!titleInBar}
              className={`truncate text-strong font-semibold text-ink transition-opacity duration-150 ${
                titleInBar ? "opacity-100" : "opacity-0"
              }`}
            >
              {recipe.title}
            </h2>

            <div className="ml-auto flex items-center">
              <button
                type="button"
                aria-label="Share"
                onClick={() => showToast("Share — wired post-v1.")}
                className="focus-ring inline-flex h-10 w-10 shrink-0 items-center justify-center text-ink-muted"
              >
                <Share2 size={18} />
              </button>
              <button
                type="button"
                aria-label="More actions"
                onClick={() => setKebabOpen(true)}
                className="focus-ring inline-flex h-10 w-10 shrink-0 items-center justify-center text-ink"
              >
                <MoreVertical size={20} />
              </button>
            </div>
          </div>

          {/* In-bar tabs — fade in only after the in-flow tabs have scrolled
              fully past the top bar (sentinel sits *below* the in-flow strip).
              Same blur region as the rest of the bar, so no visible boundary. */}
          <div
            aria-hidden={!tabsInBar}
            className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
              tabsInBar
                ? "grid-rows-[1fr] opacity-100"
                : "grid-rows-[0fr] opacity-0"
            }`}
          >
            <div className="overflow-hidden">
              <TabStrip
                active={activeTab}
                onChange={handleTabChange}
                tabIndex={tabsInBar ? 0 : -1}
              />
            </div>
          </div>
        </div>

        {/* Identity block — plain white. Holds title, source, pills, pairs,
            make-ahead. */}
        <section>
          <div className="mx-auto max-w-md px-5 pt-4 pb-6">
            {/* layoutId matches the Results card's title so Framer animates
                the morph from card → page header when the user taps in.
                Deep links (no source card mounted) just render in place — no
                animation, no error. */}
            <motion.h1
              ref={inPageTitleRef}
              layoutId={`recipe-title-${recipe.id}`}
              className="text-title leading-tight text-ink"
            >
              {recipe.title}
            </motion.h1>

            {/* Everything below the title fades in while the title morphs
                into position from the Results card. */}
            <div className="recipe-body-fade">
            <p className="mt-3 text-caption text-ink-muted">
              Source:{" "}
              <a
                href={recipe.source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="focus-ring underline decoration-ink-disabled underline-offset-2 hover:decoration-ink"
              >
                {recipe.source.siteName}
              </a>
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="pill pill-secondary">
                {sentence(recipe.difficulty.label)}
              </span>
              {recipe.dietFlags.map((flag) => (
                <span key={flag} className="pill pill-secondary">
                  {flag}
                </span>
              ))}
            </div>

            {recipe.pairsWith && recipe.pairsWith.length > 0 && (
              <p className="mt-4 text-body text-ink-muted">
                Pairs well with {recipe.pairsWith.join(", ")}.
              </p>
            )}

            {/* Alternate-recipe affordance — shown when the recipe carries
                a previousVersion (set by onDifferentRecipe). The link opens
                the comparison view (built in M2). */}
            {recipe.previousVersion && (
              <p className="mt-4 text-caption text-ink-muted">
                Alternate recipe ·{" "}
                <button
                  type="button"
                  onClick={onComparePrevious}
                  className="focus-ring text-ink-muted underline underline-offset-2 hover:text-ink"
                >
                  compare with previous recipe
                </button>
              </p>
            )}

            </div>
          </div>
        </section>

        {/* Stats — edge-to-edge section, hairline strokes top + bottom and
            vertical dividers between the four equal cells. */}
        <div className="recipe-body-fade border-y border-line">
          <dl className="mx-auto grid max-w-md grid-cols-4 divide-x divide-line text-center">
            <Metric icon={<Clock size={14} />} label="Prep">
              {recipe.times.prepMinutes}m
            </Metric>
            <Metric icon={<Flame size={14} />} label="Cook">
              {recipe.times.cookMinutes}m
            </Metric>
            <Metric icon={<Users size={14} />} label="Serves">
              {servings}
            </Metric>
            <Metric icon={<Zap size={14} />} label="Cal">
              {recipe.calories.perServing}K
            </Metric>
          </dl>
        </div>

        {/* Make-ahead nudge — sits between stats and tabs so the editorial
            identity block stays clean, and the user sees timing context
            (prep/cook/serves/calories) before the warning lands. */}
        {recipe.makeAhead && !makeAheadDismissed && (
          <div className="recipe-body-fade mx-auto max-w-md px-5 pt-5">
            <MakeAheadCard
              text={recipe.makeAhead}
              onDismiss={() => setMakeAheadDismissed(true)}
            />
          </div>
        )}

        {/* In-flow tabs — anchored to the content they control. A sentinel
            placed at the *bottom* edge tells us when the strip has fully
            scrolled under the top bar; only then does the in-bar copy fade in,
            so there's no moment where two strips are visible at once. */}
        <div ref={inFlowTabsRef} className="recipe-body-fade bg-paper">
          <div className="mx-auto max-w-md">
            <TabStrip
              active={activeTab}
              onChange={handleTabChange}
              tabIndex={tabsInBar ? -1 : 0}
            />
          </div>
        </div>
        <div ref={tabSentinelRef} aria-hidden className="h-px" />

        {/* Tab content — `min-h-[100dvh]` keeps each panel at least the full
            viewport tall, so switching between tabs never causes the page to
            collapse and bounce the scroll position. Tall content (e.g. a
            20-step recipe) still extends naturally past it.
            `overflow-x-hidden` clips the slide-out so the page never gets a
            horizontal scrollbar mid-animation. */}
        <div className="recipe-body-fade relative mx-auto min-h-[100dvh] max-w-md overflow-x-hidden px-5 pt-5">
          <AnimatePresence
            mode="popLayout"
            initial={false}
            custom={tabDirection}
          >
            <motion.div
              key={activeTab}
              custom={tabDirection}
              variants={TAB_SLIDE_VARIANTS}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            >
              {activeTab === "recipe" && (
                <RecipeTab
                  recipe={recipe}
                  substitutions={substitutions}
                  substitutionsLoading={substitutionsLoading}
                  appliedSubs={appliedSubs}
                  onApplySubstitute={applySubstitute}
                  onResetSubstitute={resetSubstitute}
                  onFindAlternate={onDifferentRecipe}
                  alternateBusy={actionBusy === "different"}
                />
              )}
              {activeTab === "equipment" && (
                <EquipmentTab items={recipe.equipment} />
              )}
              {activeTab === "ingredients" && (
                <IngredientsTab
                  recipe={recipe}
                  servings={servings}
                  setServings={setServings}
                  substitutions={substitutions}
                  appliedSubs={appliedSubs}
                  onApplySubstitute={applySubstitute}
                  onResetSubstitute={resetSubstitute}
                  selectedForInstamart={selectedForInstamart}
                  onToggleSelection={toggleIngredientSelection}
                  instamartChecked={instamartChecked}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Bottom CTA — full pill at rest, morphs to ChefHat FAB on scroll. */}
      <CookingCTA mode={ctaMode} variant={ctaVariant} onTap={onCtaTap} />

      {/* Kebab actions */}
      <ActionSheet
        open={kebabOpen}
        title="Recipe actions"
        actions={kebabActions}
        onClose={() => setKebabOpen(false)}
      />

      <FeedbackSheet
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        onSelect={onFeedbackSelect}
      />

      {/* Loader overlay during the "Find alternate recipe" fetch. Covers
          the content area below the top bar — the user can still see
          where they are without losing the page identity. */}
      {actionBusy === "different" && (
        <div
          className="fixed inset-x-0 bottom-0 z-30 bg-paper"
          style={{ top: topBarH }}
        >
          <Loader streamed={0} target={1} />
        </div>
      )}

      {toast && toast.variant === "info" && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-0 z-50 mx-auto max-w-md px-5"
          style={{ bottom: "calc(max(env(safe-area-inset-bottom), 16px) + 88px)" }}
        >
          <div className="mx-auto inline-block rounded-button bg-ink px-4 py-2.5 text-center text-caption font-medium text-paper shadow-soft-lg">
            {toast.msg}
          </div>
        </div>
      )}

      {/* Success toast — same frosted-green style as the Results page
          regenerate toast. Top-positioned just below the top bar. */}
      {toast && toast.variant === "success" && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-0 z-50 mx-auto max-w-md px-5"
          style={{ top: `calc(${topBarH}px + 8px)` }}
        >
          <div
            className="rounded-button px-4 py-3 text-center text-strong font-medium text-paper shadow-soft backdrop-blur-lg"
            style={{ background: "rgba(45, 106, 79, 0.55)" }}
          >
            {toast.msg}
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================ helpers ====

function TabStrip({
  active,
  onChange,
  tabIndex = 0,
}: {
  active: TabKey;
  onChange: (k: TabKey) => void;
  tabIndex?: number;
}) {
  return (
    // Continuous hairline under all three tabs, with the accent indicator
    // sitting *on top of* the line for the selected tab. `-bottom-px`
    // pulls the 2px accent block over the 1px border so it visually
    // replaces the line in the selected column.
    <div role="tablist" className="flex border-b border-line">
      {TABS.map((t) => {
        const selected = t.key === active;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={selected}
            type="button"
            tabIndex={tabIndex}
            onClick={() => onChange(t.key)}
            className={`focus-ring relative flex-1 py-4 text-strong font-medium transition-colors ${
              selected ? "text-ink" : "text-ink-faint"
            }`}
          >
            {t.label}
            <span
              aria-hidden
              className={`absolute inset-x-0 -bottom-px h-0.5 transition-opacity ${
                selected ? "bg-accent opacity-100" : "opacity-0"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}

function MakeAheadCard({
  text,
  onDismiss,
}: {
  text: string;
  onDismiss: () => void;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);

  const onTouchStart = (e: React.TouchEvent) => {
    setDragging(true);
    startX.current = e.touches[0].clientX;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging) return;
    setDx(e.touches[0].clientX - startX.current);
  };
  const onTouchEnd = () => {
    setDragging(false);
    if (Math.abs(dx) > 80) {
      setDx(dx > 0 ? 400 : -400);
      window.setTimeout(onDismiss, 180);
    } else {
      setDx(0);
    }
  };

  const opacity = 1 - Math.min(Math.abs(dx) / 200, 0.6);

  return (
    <div
      className={`flex items-center gap-3 rounded-card bg-warning-50 px-4 py-3 shadow-soft ${
        dragging ? "" : "transition-transform duration-150"
      }`}
      style={{
        transform: `translateX(${dx}px)`,
        opacity,
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <p className="flex-1 text-body text-warning-800">{text}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Mark this step done"
        className="focus-ring -mr-1 inline-flex h-9 w-9 shrink-0 items-center justify-center text-success-500 hover:text-success-700"
      >
        <CheckCircle2 size={26} />
      </button>
    </div>
  );
}

/**
 * Sticky bottom CTA. Has two orthogonal axes:
 *   • `mode`    — "full" pill at rest, collapses to "fab" on scroll-down,
 *                 expands back when the user scrolls back up.
 *   • `variant` — "cook" (default tomato Start cooking), "check" (white
 *                 Check Instamart with cart icon, when any ingredient is
 *                 selected), or "add" (white Add to cart, after check
 *                 has been run). White variants share the cart icon for
 *                 the FAB collapse.
 */
type CtaVariant = "cook" | "check" | "add";

function CookingCTA({
  mode,
  variant,
  onTap,
}: {
  mode: "full" | "fab";
  variant: CtaVariant;
  onTap: () => void;
}) {
  const isInstamart = variant !== "cook";
  const label =
    variant === "cook"
      ? "Start cooking →"
      : variant === "check"
        ? "Check Instamart"
        : "Add to cart";
  const aria =
    variant === "cook"
      ? "Start cooking"
      : variant === "check"
        ? "Check Instamart for selected ingredients"
        : "Add to Instamart cart";

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-20"
      style={{ bottom: 0 }}
    >
      {/* Full pill — fades + slides out of the way in FAB mode. */}
      <div
        className={`transition-all duration-200 ease-out ${
          mode === "full"
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-4 opacity-0"
        }`}
      >
        <div className="h-8 bg-gradient-to-t from-paper/60 to-transparent" />
        <div
          className="bg-paper/60 backdrop-blur-lg"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom), 16px)" }}
        >
          <div className="mx-auto max-w-md px-5 pt-2 pb-2">
            <button
              type="button"
              onClick={onTap}
              aria-label={aria}
              className={`focus-ring inline-flex w-full items-center justify-center gap-2 rounded-button font-semibold transition-colors ${
                isInstamart
                  ? "border border-line bg-paper text-accent shadow-soft hover:bg-accent-soft"
                  : "btn-primary"
              } ${mode === "full" ? "pointer-events-auto" : ""}`}
              style={
                isInstamart
                  ? { minHeight: 56, fontSize: 17, letterSpacing: "-0.005em" }
                  : undefined
              }
            >
              {isInstamart && <ShoppingCart size={18} aria-hidden />}
              {label}
            </button>
          </div>
        </div>
      </div>

      {/* FAB — fades + slides up when full pill collapses. White circle
          with cart icon when in an Instamart variant; tomato circle with
          ChefHat for the default cook variant. */}
      <div
        className="absolute right-5"
        style={{ bottom: "max(env(safe-area-inset-bottom), 16px)" }}
      >
        <button
          type="button"
          aria-label={aria}
          onClick={onTap}
          className={`focus-ring inline-flex h-14 w-14 items-center justify-center rounded-full transition-all duration-200 ease-out active:scale-95 ${
            isInstamart
              ? "border border-line bg-paper text-accent"
              : "bg-accent text-paper"
          } ${
            mode === "fab"
              ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
              : "pointer-events-none translate-y-4 scale-90 opacity-0"
          }`}
          style={{
            boxShadow: isInstamart
              ? "0 1px 2px rgba(26,26,26,0.06), 0 6px 18px rgba(26,26,26,0.10)"
              : "0 1px 2px rgba(214,63,42,0.18), 0 6px 18px rgba(214,63,42,0.22)",
          }}
        >
          {isInstamart ? <ShoppingCart size={22} /> : <ChefHat size={24} />}
        </button>
      </div>
    </div>
  );
}

/** Format a step's timerSeconds into a short, rough label. */
function formatStepTime(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)} min`;
}

function RecipeTab({
  recipe,
  substitutions,
  substitutionsLoading,
  appliedSubs,
  onApplySubstitute,
  onResetSubstitute,
  onFindAlternate,
  alternateBusy,
}: {
  recipe: RecipeT;
  substitutions: Record<string, string[]> | null;
  substitutionsLoading: boolean;
  appliedSubs: Record<string, string>;
  onApplySubstitute: (name: string, sub: string) => void;
  onResetSubstitute: (name: string) => void;
  onFindAlternate: () => void;
  alternateBusy: boolean;
}) {
  return (
    <section>
      {/* Steps. The left column is a squarish bg-paper-soft tile holding
          the step number on top and a rough time underneath (when available).
          Spacing between steps is bumped ~8% over `space-y-4` so the list
          breathes a touch more. Step text live-rewrites with the user's
          applied substitutions (butter → olive oil etc.). */}
      <ol className="space-y-[1.08rem]">
        {recipe.steps.map((step) => {
          const time = formatStepTime(step.timerSeconds);
          const text = applySubstitutions(step.text, appliedSubs);
          return (
            <li key={step.number} className="flex gap-3">
              <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md bg-paper-soft">
                <span className="text-strong font-semibold leading-none text-ink-muted">
                  {step.number}
                </span>
                {time && (
                  <span className="text-[10px] font-medium leading-none text-ink-faint">
                    {time}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-strong leading-relaxed text-ink">
                {text}
              </p>
            </li>
          );
        })}
      </ol>

      <SubstitutionsSection
        substitutions={substitutions}
        loading={substitutionsLoading}
        appliedSubs={appliedSubs}
        onApply={onApplySubstitute}
        onReset={onResetSubstitute}
      />

      <AlternateRecipeSection onFind={onFindAlternate} busy={alternateBusy} />
    </section>
  );
}

/** Inline substitutions section on the Recipe tab. Mirrors the per-row
    "Substitute with: …" UI on the Ingredients tab — tapping a swap here
    applies it everywhere (step text rewrites, ingredients row swaps).
    Hides itself when there's nothing useful to show. */
function SubstitutionsSection({
  substitutions,
  loading,
  appliedSubs,
  onApply,
  onReset,
}: {
  substitutions: Record<string, string[]> | null;
  loading: boolean;
  appliedSubs: Record<string, string>;
  onApply: (name: string, sub: string) => void;
  onReset: (name: string) => void;
}) {
  const hasContent =
    substitutions && Object.keys(substitutions).length > 0;
  if (!loading && !hasContent) return null;

  return (
    <section className="mt-10 border-t border-line pt-6">
      <h3 className="text-section text-ink">Substitutions</h3>
      {loading ? (
        <p className="mt-3 text-body text-ink-muted">
          Looking up common swaps…
        </p>
      ) : (
        <ul className="mt-4 space-y-4">
          {Object.entries(substitutions ?? {}).map(([name, options]) => {
            const applied = appliedSubs[name];
            return (
              <li key={name}>
                <p className="text-strong font-medium text-ink">
                  {applied ? (
                    <>
                      <span className="text-ink-faint line-through">
                        {name}
                      </span>{" "}
                      <span>{applied}</span>
                    </>
                  ) : (
                    name
                  )}
                </p>
                {applied ? (
                  <p className="mt-1 text-caption text-ink-faint">
                    Substituted ·{" "}
                    <button
                      type="button"
                      onClick={() => onReset(name)}
                      className="focus-ring text-ink-muted underline underline-offset-2 hover:text-ink"
                    >
                      Reset to {name}
                    </button>
                  </p>
                ) : (
                  <ul className="mt-1 space-y-1 text-body text-ink-muted">
                    {options.map((opt) => (
                      <li key={opt} className="flex gap-2">
                        <span aria-hidden className="text-ink-faint">
                          ·
                        </span>
                        <button
                          type="button"
                          onClick={() => onApply(name, opt)}
                          className="focus-ring text-left text-accent underline underline-offset-2"
                        >
                          {opt}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Inline "find another version of this dish" prompt. Surfaces what used
    to live behind the kebab so the user sees it as a normal option. */
function AlternateRecipeSection({
  onFind,
  busy,
}: {
  onFind: () => void;
  busy: boolean;
}) {
  return (
    <section className="mt-10 border-t border-line pt-6">
      <p className="text-body text-ink-muted">
        Not happy with the recipe? I can find an alternate recipe for this
        same dish.
      </p>
      <button
        type="button"
        onClick={onFind}
        disabled={busy}
        className="btn-outline focus-ring mt-3 disabled:opacity-50"
      >
        {busy ? "Looking…" : "Find alternate recipe"}
      </button>
    </section>
  );
}

function EquipmentTab({ items }: { items: string[] }) {
  if (items.length === 0) {
    return (
      <p className="text-body text-ink-muted">
        Nothing special — your usual pots, pans, and knives will do.
      </p>
    );
  }
  return (
    <ul className="grid grid-cols-2 gap-3">
      {items.map((it) => (
        <li
          key={it}
          className="flex aspect-square flex-col items-center justify-center gap-3 rounded-card bg-paper-soft px-3 text-center"
        >
          <HugeiconsIcon
            icon={equipmentIconFor(it)}
            size={36}
            strokeWidth={1.5}
            className="text-ink-muted"
          />
          <span className="text-strong leading-tight text-ink">
            {sentence(it)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function IngredientsTab({
  recipe,
  servings,
  setServings,
  substitutions,
  appliedSubs,
  onApplySubstitute,
  onResetSubstitute,
  selectedForInstamart,
  onToggleSelection,
  instamartChecked,
}: {
  recipe: RecipeT;
  servings: number;
  setServings: (n: number) => void;
  substitutions: Record<string, string[]> | null;
  appliedSubs: Record<string, string>;
  onApplySubstitute: (name: string, sub: string) => void;
  onResetSubstitute: (name: string) => void;
  selectedForInstamart: Set<string>;
  onToggleSelection: (name: string) => void;
  instamartChecked: boolean;
}) {
  const selectedCount = selectedForInstamart.size;

  // For the post-check summary, walk the selected ingredients and count
  // how many of them have `instamart.available === true` in the recipe
  // data. M4 will replace this with a real /api/check-instamart call.
  const availableCount = recipe.ingredients.reduce((acc, ing) => {
    if (!selectedForInstamart.has(ing.name)) return acc;
    return acc + (ing.instamart.available ? 1 : 0);
  }, 0);

  return (
    <section>
      <header className="flex items-center justify-between py-2">
        <span className="text-step text-ink">Serves</span>
        <ServingsAdjuster servings={servings} onChange={setServings} />
      </header>

      {/* Tiny purpose label — disambiguates the checkboxes from the Serves
          counter above so the column doesn't read as "choose serving size
          with a checkbox." */}
      <p className="mt-5 text-caption text-ink-muted">
        Pick what you need from Instamart
      </p>

      <IngredientList
        recipe={recipe}
        servings={servings}
        substitutions={substitutions}
        appliedSubs={appliedSubs}
        onApplySubstitute={onApplySubstitute}
        onResetSubstitute={onResetSubstitute}
        selectedForInstamart={selectedForInstamart}
        onToggleSelection={onToggleSelection}
      />

      {/* Result panel — appears only after the sticky CTA's "Check
          Instamart" has been pressed. The CTA itself lives on the Recipe
          component as the bottom sticky button; the panel here is
          informational so the user knows what they're about to add. */}
      {instamartChecked && (
        <div className="mt-6 rounded-card border border-line bg-paper-soft p-4">
          <p className="text-strong text-ink">
            {availableCount} of {selectedCount} available on Instamart
          </p>
          <p className="mt-1 text-caption text-ink-muted">
            Tap "Add to cart" below to push the available ones.
          </p>
        </div>
      )}
    </section>
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
    <div className="flex flex-col items-center justify-center gap-1 px-2 py-4">
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
  substitutions,
  appliedSubs,
  onApplySubstitute,
  onResetSubstitute,
  selectedForInstamart,
  onToggleSelection,
}: {
  recipe: RecipeT;
  servings: number;
  substitutions: Record<string, string[]> | null;
  appliedSubs: Record<string, string>;
  onApplySubstitute: (name: string, sub: string) => void;
  onResetSubstitute: (name: string) => void;
  selectedForInstamart: Set<string>;
  onToggleSelection: (name: string) => void;
}) {
  const base = recipe.servings.base;

  const groups: Map<string | null, typeof recipe.ingredients> = new Map();
  for (const ing of recipe.ingredients) {
    const key = ing.group ?? null;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(ing);
  }

  return (
    <div className="mt-2">
      {[...groups.entries()].map(([groupName, items]) => (
        <div key={groupName ?? "default"} className="mt-3 first:mt-0">
          {groupName && (
            <h3 className="text-caption text-ink-muted">{groupName}</h3>
          )}
          <ul className="mt-1 divide-y divide-line-soft">
            {items.map((ing) => {
              const scaled = scaleQuantity(ing.quantity, base, servings);
              const display = formatQuantity(scaled, ing.unit);
              const unitInQty = display === "a pinch";
              const subs = substitutions?.[ing.name] ?? null;
              return (
                <IngredientRow
                  key={`${groupName ?? ""}-${ing.name}`}
                  ingredient={unitInQty ? { ...ing, unit: null } : ing}
                  displayQuantity={display}
                  substitutes={subs}
                  appliedSubstitute={appliedSubs[ing.name] ?? null}
                  selected={selectedForInstamart.has(ing.name)}
                  onToggleSelected={() => onToggleSelection(ing.name)}
                  onApplySubstitute={(sub) => onApplySubstitute(ing.name, sub)}
                  onResetSubstitute={() => onResetSubstitute(ing.name)}
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
