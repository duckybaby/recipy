// Screen 1 — Form ("What are we cooking?") — spec §3.
//
// Filters live in the Zustand store (lib/store.ts). Form reads them on
// mount and writes back through patchFilters. Custom chips per section
// still persist in localStorage (see lib/storage.ts).
//
// Two ways out of this screen:
//   • "Find recipes" → navigate("/results", { state: { intent: "fresh" } })
//     The intent tells Results to show the loader and fetch even if the
//     filters happen to match a recent cached result.
//   • "Surprise me" → resets filters to { surprise: true } first so the
//     resulting search doesn't carry stale chip selections. Same intent.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChipGroup } from "../components/ChipGroup";
import { HamburgerButton } from "../components/HamburgerButton";
import { TopBar } from "../components/TopBar";
import {
  MEAL_OPTIONS,
  CUISINE_OPTIONS,
  DIET_OPTIONS,
  PREP_OPTIONS,
  COOK_OPTIONS,
  VIBE_OPTIONS,
  MAIN_OPTIONS,
} from "../lib/filterOptions";
import { EMPTY_FILTERS, useStore } from "../lib/store";
import type {
  SearchFilters,
  Meal,
  Cuisine,
  Diet,
  Vibe,
  MainIngredient,
  PrepMax,
  CookMax,
} from "../lib/types";

export default function Form() {
  const navigate = useNavigate();
  const filters = useStore((s) => s.filters);
  const patchFilters = useStore((s) => s.patchFilters);
  const setFilters = useStore((s) => s.setFilters);

  // Update one slice of filters in the store. Any chip change also clears
  // the surprise flag — once the user starts picking chips, they aren't in
  // "surprise me" mode any more, so an accidental Find Recipes shouldn't
  // come back as a surprise search.
  const update = (patch: Partial<SearchFilters>) => {
    patchFilters({ ...patch, surprise: false });
  };

  const findRecipes = () => {
    // Force surprise off — see above. If the user previously tapped
    // surprise-me and then changed chips, we want a regular search now.
    if (filters.surprise) {
      setFilters({ ...filters, surprise: false });
    }
    navigate("/results", { state: { intent: "fresh" } });
  };

  const surpriseMe = () => {
    // Surprise resets every chip so the API call doesn't accidentally
    // narrow the search. The Form chips clear on next visit too — that's
    // intentional, surprise is a one-shot mood.
    setFilters({ ...EMPTY_FILTERS, surprise: true });
    navigate("/results", { state: { intent: "fresh" } });
  };

  // Each single-select group's currently-selected value (length 0 or 1).
  const prepSelected: string[] =
    filters.prepMax === null ? [] : [String(filters.prepMax)];
  const cookSelected: string[] =
    filters.cookMax === null ? [] : [String(filters.cookMax)];

  // ---- Top bar measurement + in-page CTA tracking ----
  //
  // The "Find recipes" CTA lives next to the title on md+. As the user
  // scrolls past it, a copy in the top bar fades in (same pattern as
  // Recipe's title-in-bar fade). We measure the bar via ResizeObserver
  // and use its height as the rootMargin top for the IntersectionObserver
  // — so "intersecting" means "still visible below the bar." At <md the
  // in-page button is display:none, and the in-bar copy is hidden too,
  // so the observer's state doesn't matter visually on phone.
  const topBarRef = useRef<HTMLDivElement>(null);
  const [topBarH, setTopBarH] = useState(0);
  const inPageCtaRef = useRef<HTMLButtonElement>(null);
  const [ctaInBar, setCtaInBar] = useState(false);

  useLayoutEffect(() => {
    const el = topBarRef.current;
    if (!el) return;
    const measure = () => setTopBarH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!inPageCtaRef.current || topBarH === 0) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        // !isIntersecting once the in-page CTA scrolls fully behind the
        // bar — rootMargin shifts the IO root's top down by the bar's
        // height so the bar's blur region counts as "outside" the root.
        setCtaInBar(!entry.isIntersecting);
      },
      { rootMargin: `-${topBarH}px 0px 0px 0px`, threshold: 0 },
    );
    obs.observe(inPageCtaRef.current);
    return () => obs.disconnect();
  }, [topBarH]);

  return (
    <>
      {/* Fixed top bar — chrome + a scroll-tracked "Find recipes" copy.
          The CTA's primary home at md+ is the inline button next to the
          title in the body. Once that in-page button scrolls behind the
          bar, this in-bar copy fades in via the ctaInBar IO above. py-2
          around the 40px buttons gives a 64px-tall bar (matches Results
          / Recipe). `fixed` (not sticky) so iOS rubber-band overscroll
          doesn't bounce it. Main below compensates with explicit
          padding-top since the bar is out of document flow. */}
      <TopBar ref={topBarRef} position="fixed">
        <header className="mx-auto flex max-w-md items-center px-3 py-2 md:max-w-[1280px] md:px-8 lg:px-10">
          <HamburgerButton />
          {/* In-bar Find recipes — fades in once the in-page CTA scrolls
              past. Hidden at <md (mobile uses the sticky bottom CTA
              instead). pointer-events-none + aria-hidden + tabIndex=-1
              while invisible so it's inert to clicks, screen readers,
              and keyboard tabbing — otherwise an offscreen tab stop
              would be confusing. */}
          <button
            type="button"
            onClick={findRecipes}
            aria-hidden={!ctaInBar}
            tabIndex={ctaInBar ? 0 : -1}
            className={`btn-primary btn-primary-compact focus-ring ml-auto hidden transition-opacity duration-200 md:inline-flex ${
              ctaInBar ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            Find recipes
          </button>
        </header>
      </TopBar>

      {/* paddingTop = measured bar height + 32px desired gap to the title
          row. Using the measured value keeps the gap stable even if the
          bar's chrome changes (safe-area, font scaling, etc.). */}
      <main
        className="mx-auto max-w-md px-5 pb-32 md:max-w-[1280px] md:px-8 md:pb-16 lg:px-10"
        style={{ paddingTop: topBarH + 32 }}
      >
        {/* Intro group — title + desc are tightly grouped (mt-2 between
            them), then a bigger break (mt-10) before the form starts.
            Spacings are deliberate per context, not universal.
            At md+ the "Find recipes" CTA sits on the same row as the
            title (md:flex wrapper). The button carries inPageCtaRef
            so its visibility drives the in-bar fade-in above. On phone
            the wrapper falls back to block flow and the button hides
            (the sticky bottom CTA further down handles mobile). */}
        <div>
          <div className="md:flex md:items-center">
            <h1 className="text-title">What are we cooking today?</h1>
            <button
              ref={inPageCtaRef}
              type="button"
              onClick={findRecipes}
              className="btn-primary btn-primary-compact focus-ring hidden shrink-0 md:ml-auto md:inline-flex"
            >
              Find recipes
            </button>
          </div>
          <p className="mt-2 text-body text-ink-muted">
            Tap a few things to find recipes,
            {/* Forced break on mobile keeps the copy tight and stops
                the trailing period from orphaning on its own line. On
                md+ the wider container fits everything cleanly so we
                let it flow. */}
            <br className="md:hidden" />{" "}
            or{" "}
            <button
              type="button"
              onClick={surpriseMe}
              className="focus-ring rounded text-ink underline decoration-accent decoration-2 underline-offset-4 hover:text-accent"
            >
              surprise me
            </button>
            .
          </p>
        </div>

        {/* Chip-group container: stacked column on phone, 2-up tablet,
            3-up desktop. Vertical gap a touch larger than horizontal so
            section titles still read as anchors when wrapping. mt-10
            separates the form clearly from the intro above. */}
        <div className="chip-stagger mt-10 flex flex-col gap-10 md:grid md:grid-cols-2 md:gap-x-10 md:gap-y-12 lg:grid-cols-3">
          <ChipGroup
            id="meal"
            label="Meal"
            options={MEAL_OPTIONS}
            selected={filters.meal}
            multi
            allowAdd
            onChange={(next) => update({ meal: next as Meal[] })}
          />
          <ChipGroup
            id="cuisine"
            label="Cuisine"
            options={CUISINE_OPTIONS}
            selected={filters.cuisines}
            multi
            allowAdd
            onChange={(next) => update({ cuisines: next as Cuisine[] })}
          />
          <ChipGroup
            id="diet"
            label="Diet"
            options={DIET_OPTIONS}
            selected={filters.diet}
            multi
            allowAdd
            onChange={(next) => update({ diet: next as Diet[] })}
          />
          <ChipGroup
            id="prep"
            label="Prep time"
            options={PREP_OPTIONS}
            selected={prepSelected}
            multi={false}
            onChange={(next) => {
              const v = next[0];
              const prepMax: PrepMax =
                v === "any"
                  ? "any"
                  : v === "5" || v === "15" || v === "30"
                    ? (Number(v) as 5 | 15 | 30)
                    : null;
              update({ prepMax });
            }}
          />
          <ChipGroup
            id="cook"
            label="Cook time"
            options={COOK_OPTIONS}
            selected={cookSelected}
            multi={false}
            onChange={(next) => {
              const v = next[0];
              const cookMax: CookMax =
                v === "any"
                  ? "any"
                  : v === "15" || v === "30" || v === "60"
                    ? (Number(v) as 15 | 30 | 60)
                    : null;
              update({ cookMax });
            }}
          />
          <ChipGroup
            id="vibe"
            label="Vibe"
            options={VIBE_OPTIONS}
            selected={filters.vibes}
            multi
            allowAdd
            onChange={(next) => update({ vibes: next as Vibe[] })}
          />
          <ChipGroup
            id="main"
            label="Main ingredient"
            options={MAIN_OPTIONS}
            selected={filters.mainIngredients}
            multi
            allowAdd
            onChange={(next) =>
              update({ mainIngredients: next as MainIngredient[] })
            }
          />
        </div>
      </main>

      {/* Sticky bottom CTA — phone only (md:hidden). Anchored above iOS home
          indicator. Translucent + blurred to match the top header, with a
          generous bottom buffer so the orange CTA shadow has room to render
          without getting clipped by Safari's URL chrome. On md+ the CTA
          lives in the header right-cluster instead. */}
      <div
        className="pointer-events-none fixed inset-x-0 z-20 md:hidden"
        style={{ bottom: 0 }}
      >
        {/* Soft fade so scrolling content doesn't cut sharply */}
        <div className="h-8 bg-gradient-to-t from-paper/60 to-transparent" />
        <div
          className="pointer-events-auto bg-paper/60 backdrop-blur-lg"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom), 16px)" }}
        >
          <div className="mx-auto max-w-md px-5 pt-2 pb-2">
            <button
              type="button"
              onClick={findRecipes}
              className="btn-primary focus-ring"
            >
              Find recipes
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
