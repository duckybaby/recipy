// Per-route entry animation. CSS-only so the transform reverts to identity
// after the animation, leaving position:fixed/sticky children intact —
// Framer Motion's transform-based approach leaves a `translate3d(0,0,0)`
// behind that breaks fixed positioning in Safari.
//
// Used in App.tsx to wrap the route element. Exits are instant; we add
// exit animations in Phase 5 if the abrupt unmount feels off.
//
// On POP (back navigation), we skip the entry animation entirely — the
// previous screen is conceptually "revealed" by the outgoing page's exit
// animation, not freshly entered. Replaying the slide-up on back would
// feel like a re-load rather than a return.
//
// Variants:
//   • slideUp — modal-style entry from the bottom (Form→Results,
//     Recipe→Cooking).
//   • fade    — soft opacity fade-in (used selectively).
//   • none    — no animation; renders children as-is.

import type { ReactNode } from "react";
import { useNavigationType } from "react-router-dom";

type Variant = "none" | "slideUp" | "fade";

const CLASS_FOR: Record<Variant, string> = {
  none: "",
  slideUp: "page-enter-slide-up",
  fade: "page-enter-fade",
};

export function PageTransition({
  children,
  variant = "none",
}: {
  children: ReactNode;
  variant?: Variant;
}) {
  const navType = useNavigationType();
  const effective = navType === "POP" ? "none" : variant;
  const cls = CLASS_FOR[effective];
  if (!cls) return <>{children}</>;
  return <div className={cls}>{children}</div>;
}
