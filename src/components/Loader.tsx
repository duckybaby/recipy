// Cooking-themed loader for the Results page.
//
// Three layers, each on its own timer so the loader feels alive even when
// the API is slow:
//   • A rotating SVG animation (stirring pot, knife chopping, whisk in bowl).
//     ~4.5s per slot.
//   • A rotating quirky one-liner ("Finding veggies", "Making tomatoes
//     redder", …). ~3.5s per line. Picked randomly from a bank so back-to-
//     back searches don't show the same sequence.
//   • A deterministic horizontal progress bar — `streamed / target` fills
//     the bar by 1/3 per recipe that arrives. An animated stripe overlay
//     keeps it from feeling frozen between chunks.
//
// A constant sub-line ("Usually takes 1-3 minutes…") sits below the rotating
// copy so users know what they're in for.

import { useEffect, useMemo, useRef, useState } from "react";

interface Props {
  /** How many recipes have already streamed in (0..target). */
  streamed: number;
  /** Total recipes expected — controls the deterministic fill. */
  target: number;
}

const PHASES = [
  "Finding veggies",
  "Making tomatoes redder",
  "Asking the chefs",
  "Polishing the spoons",
  "Warming up the oven",
  "Sniffing for freshness",
  "Counting calories properly",
  "Calibrating spice levels",
  "Pulling out the good stuff",
  "Skipping the bland ones",
  "Reading recipe sites",
  "Triple-checking the timings",
  "Picking only the keepers",
  "Translating chef-speak",
  "Comparing notes with grandma",
  "Drumroll, please",
];

// ============================================================ animations ===

function StirringPot() {
  return (
    <svg
      viewBox="0 0 96 96"
      xmlns="http://www.w3.org/2000/svg"
      className="h-20 w-20 md:h-28 md:w-28"
      aria-hidden
    >
      {/* Steam wisps */}
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.55">
        <path className="steam steam-a" d="M34 28 C 30 22, 38 18, 34 12" />
        <path className="steam steam-b" d="M48 26 C 44 20, 52 16, 48 10" />
        <path className="steam steam-c" d="M62 28 C 58 22, 66 18, 62 12" />
      </g>
      {/* Pot body */}
      <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round">
        <path d="M20 42 H 76 V 70 Q 76 80 66 80 H 30 Q 20 80 20 70 Z" />
        <path d="M14 42 H 82" />
        {/* Handles */}
        <path d="M14 46 L 10 50" />
        <path d="M82 46 L 86 50" />
      </g>
      {/* Spoon (rotates) */}
      <g className="spoon" style={{ transformOrigin: "48px 58px" }}>
        <line x1="48" y1="58" x2="64" y2="34" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <circle cx="65" cy="32" r="3.5" fill="currentColor" />
      </g>
    </svg>
  );
}

function KnifeChopping() {
  return (
    <svg
      viewBox="0 0 96 96"
      xmlns="http://www.w3.org/2000/svg"
      className="h-20 w-20 md:h-28 md:w-28"
      aria-hidden
    >
      {/* Board */}
      <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round">
        <rect x="14" y="68" width="68" height="10" rx="3" />
      </g>
      {/* Little veg bits */}
      <g fill="currentColor" opacity="0.55">
        <circle cx="30" cy="66" r="2" />
        <circle cx="38" cy="66" r="2" />
        <circle cx="46" cy="66" r="2" />
        <circle cx="54" cy="66" r="2" />
      </g>
      {/* Knife (chops up & down) */}
      <g className="knife" style={{ transformOrigin: "60px 60px" }}>
        <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round">
          {/* Blade */}
          <path d="M28 60 L 64 30 L 70 36 L 34 64 Z" />
          {/* Handle */}
          <line x1="64" y1="30" x2="78" y2="20" />
        </g>
      </g>
    </svg>
  );
}

function WhiskBowl() {
  return (
    <svg
      viewBox="0 0 96 96"
      xmlns="http://www.w3.org/2000/svg"
      className="h-20 w-20 md:h-28 md:w-28"
      aria-hidden
    >
      {/* Bowl */}
      <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round">
        <path d="M16 52 Q 16 80 48 80 Q 80 80 80 52 Z" />
        <path d="M12 52 H 84" />
      </g>
      {/* Whisk (rotates) */}
      <g className="whisk" style={{ transformOrigin: "48px 56px" }}>
        <g fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round">
          {/* Handle */}
          <line x1="48" y1="56" x2="48" y2="14" />
          {/* Wires forming the whisk bulb */}
          <path d="M48 56 C 36 50, 36 30, 48 24" />
          <path d="M48 56 C 60 50, 60 30, 48 24" />
          <path d="M48 56 C 42 50, 42 30, 48 24" />
          <path d="M48 56 C 54 50, 54 30, 48 24" />
          <ellipse cx="48" cy="30" rx="11" ry="3" />
        </g>
      </g>
    </svg>
  );
}

const ANIMATIONS = [StirringPot, KnifeChopping, WhiskBowl];

// =============================================================== helpers ===

/** Random integer in [0, max). */
function randInt(max: number) {
  return Math.floor(Math.random() * max);
}

// =============================================================== loader ===

export function Loader({ streamed, target }: Props) {
  // Animation and phase line each cycle on their own timer. They're NOT
  // synced — that's intentional, makes the screen feel less mechanical.
  const [animIndex, setAnimIndex] = useState(() => randInt(ANIMATIONS.length));
  const [phaseIndex, setPhaseIndex] = useState(() => randInt(PHASES.length));

  useEffect(() => {
    const a = window.setInterval(
      () => setAnimIndex((i) => (i + 1) % ANIMATIONS.length),
      4500,
    );
    const p = window.setInterval(
      () => setPhaseIndex((i) => (i + 1) % PHASES.length),
      3500,
    );
    return () => {
      window.clearInterval(a);
      window.clearInterval(p);
    };
  }, []);

  // Cap progress at 95% so the bar never reaches the end before recipes
  // actually land — the "snap to 100%" happens once the loader unmounts.
  const pct = useMemo(() => {
    if (target <= 0) return 0;
    return Math.min(95, Math.round((streamed / target) * 100));
  }, [streamed, target]);

  const Animation = ANIMATIONS[animIndex];

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-6 text-center">
      <div className="text-accent" aria-hidden>
        <Animation />
      </div>

      {/* Phase line. aria-live so screen readers hear updates but politely. */}
      <p
        className="mt-6 text-section font-medium text-ink transition-opacity duration-300"
        aria-live="polite"
        key={phaseIndex}
      >
        {PHASES[phaseIndex]}…
      </p>

      <p className="mt-3 max-w-xs text-caption text-ink-muted">
        Usually takes 1-3 minutes, depending on how many filters you picked.
      </p>

      {/* Deterministic progress with an animated stripe overlay so it
          never looks frozen between stream chunks. */}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="loader-bar mt-8 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-paper-soft md:max-w-sm"
      >
        <div
          className="loader-bar-fill h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Hook: returns true once `open` has been true for at least `minMs`.
    Use to enforce a minimum loader display time so quick API responses
    don't flash the loader off in 50ms. */
export function useMinDisplay(open: boolean, minMs: number): boolean {
  const [held, setHeld] = useState(open);
  const shownAt = useRef<number | null>(open ? Date.now() : null);

  useEffect(() => {
    if (open) {
      if (shownAt.current === null) shownAt.current = Date.now();
      setHeld(true);
      return;
    }
    // open went false — only release after minMs has elapsed.
    if (shownAt.current === null) {
      setHeld(false);
      return;
    }
    const elapsed = Date.now() - shownAt.current;
    const remaining = Math.max(0, minMs - elapsed);
    const t = window.setTimeout(() => {
      shownAt.current = null;
      setHeld(false);
    }, remaining);
    return () => window.clearTimeout(t);
  }, [open, minMs]);

  return held;
}
