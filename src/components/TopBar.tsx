// Shared top bar chrome — frosted, safe-area-top aware, sticky or fixed.
//
// Every screen with a top bar uses this. The component owns the outer
// wrapper only — positioning, frosted backdrop, top padding for the iOS
// notch, z-index. Each screen brings its own inner content (back arrow
// / hamburger, title, right-cluster, secondary rows like the Results
// filter summary).
//
// Why a wrapper instead of a fully-slotted component? Inner content
// genuinely varies — Form is just chrome; Results has a 40px action
// row + filter summary button; Recipe has a fading title + share +
// kebab. Trying to formalise every slot would either lock down the
// design or leak abstraction. "Here's the chrome, you bring the
// contents" is the right shape.
//
// Position:
//   • `sticky` (default) — stays at top:0 while in scroll range; moves
//     with the document during iOS rubber-band overscroll. Backwards-
//     compatible default while we migrate screens.
//   • `fixed` — locked to the viewport like the bottom CTA. No
//     overscroll wiggle, feels native. Consumers MUST add an
//     equivalent padding-top to whatever sits beneath, or content
//     will hide behind the bar.
//
// Density:
//   • `compact` (default) — 8px min top pad. Matches all current
//     action-row layouts.
//   • `comfortable` — 20px min top pad. Reserved for screens that
//     want extra breathing room above the bar's content (legacy
//     value; current usage has migrated to compact).
//
// Pass `className` to augment: `lg:hidden` to mobile-only (Recipe),
// or `z-30` to override the default z-20 stacking when the page has
// extra overlays.

import { forwardRef, type ReactNode } from "react";

type TopBarProps = {
  density?: "compact" | "comfortable";
  position?: "sticky" | "fixed";
  className?: string;
  children: ReactNode;
};

export const TopBar = forwardRef<HTMLDivElement, TopBarProps>(function TopBar(
  { density = "compact", position = "sticky", className = "", children },
  ref,
) {
  // 8px or 20px floor; iOS notch can push it higher via env(safe-area-inset-top).
  const topPad = density === "comfortable" ? "20px" : "8px";
  const posClasses =
    position === "fixed"
      ? "fixed inset-x-0 top-0"
      : "sticky top-0";

  return (
    <div
      ref={ref}
      className={`${posClasses} z-20 bg-paper/60 backdrop-blur-lg ${className}`}
      style={{ paddingTop: `max(env(safe-area-inset-top), ${topPad})` }}
    >
      {children}
    </div>
  );
});
