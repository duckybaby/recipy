import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
// Side-effect import: initialises Firebase + App Check before any API call.
// Must come before App so the App Check provider is ready when api.ts runs.
import "./lib/firebase";
import "./styles/index.css";
import App from "./App";
import { useStore, resolveTheme, applyTheme } from "./lib/store";

// ---- Theme wiring ----
// The inline script in index.html already applied the first-paint theme.
// What we wire up here is what happens AFTER hydration:
//   1) Whenever the user toggles, re-apply the resolved mode to the DOM.
//   2) If the user hasn't picked (pref === null), follow the OS as it
//      changes mid-session — same behaviour as the inline init.
applyTheme(resolveTheme(useStore.getState().theme));
useStore.subscribe((state, prev) => {
  if (state.theme !== prev.theme) {
    applyTheme(resolveTheme(state.theme));
  }
});
if (typeof window !== "undefined" && window.matchMedia) {
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystemChange = () => {
    if (useStore.getState().theme === null) {
      applyTheme(mql.matches ? "dark" : "light");
    }
  };
  // addEventListener works on modern browsers; older Safari needs the
  // deprecated addListener fallback. Both are valid.
  if (mql.addEventListener) mql.addEventListener("change", onSystemChange);
  else if (mql.addListener) mql.addListener(onSystemChange);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
