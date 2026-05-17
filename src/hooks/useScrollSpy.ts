// Track which section is currently in view by id.
//
// Used by the Form's right-rail TOC indicator. Picks the topmost
// intersecting section. ALSO forces the last section active when the
// user has scrolled to the bottom of the document — without this, the
// final section can sit below the activation band forever (because the
// page can't scroll any further) and the second-to-last stays active.

import { useEffect, useState } from "react";

export function useScrollSpy(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);

  useEffect(() => {
    if (!ids.length) return;

    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => !!el);
    if (!elements.length) return;

    const lastId = ids[ids.length - 1];

    // rootMargin biases activation to roughly the upper third of the
    // viewport, which matches what "I am reading this section" feels like.
    const observer = new IntersectionObserver(
      (entries) => {
        // If at the bottom of the page, force last section.
        const atBottom =
          window.scrollY + window.innerHeight >=
          document.documentElement.scrollHeight - 8;
        if (atBottom) {
          setActive(lastId);
          return;
        }

        // Otherwise pick the topmost intersecting section.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          setActive(visible[0].target.id);
        }
      },
      { rootMargin: "-15% 0px -65% 0px", threshold: 0 },
    );
    elements.forEach((el) => observer.observe(el));

    // Separate scroll listener for the bottom-of-page case — the
    // IntersectionObserver doesn't always fire when the user is just
    // hovering at the bottom without crossing thresholds.
    const onScroll = () => {
      const atBottom =
        window.scrollY + window.innerHeight >=
        document.documentElement.scrollHeight - 8;
      if (atBottom) setActive(lastId);
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [ids.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  return active;
}
