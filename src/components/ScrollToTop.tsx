// Resets the window scroll to the top on every forward navigation.
//
// React Router v6 deliberately does NOT touch scroll position on its own —
// the rationale being "let apps decide." For a mobile-first experience the
// expectation is the native one: tapping into a new screen always lands you
// at the top, like an app. Tapping back restores the previous scroll, again
// like an app.
//
// We trigger on pathname change only (so URL filter updates via REPLACE
// don't yank the user back to the top mid-edit) and only when the nav type
// is PUSH (so the browser's auto scroll-restoration handles back/forward).

import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

export function ScrollToTop() {
  const { pathname } = useLocation();
  const navType = useNavigationType();

  useEffect(() => {
    if (navType !== "PUSH") return;
    window.scrollTo(0, 0);
  }, [pathname, navType]);

  return null;
}
