import {
  Routes,
  Route,
  useLocation,
  useNavigationType,
  type NavigationType,
} from "react-router-dom";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { UserContextProvider } from "./hooks/useUserContext";
import { AuthGate } from "./components/AuthGate";
import { ResumeBanner } from "./components/ResumeBanner";
import { ScrollToTop } from "./components/ScrollToTop";
import { PageTransition } from "./components/PageTransition";
import Form from "./routes/Form";
import Results from "./routes/Results";
import Recipe from "./routes/Recipe";
import Cooking from "./routes/Cooking";

export default function App() {
  return (
    <UserContextProvider>
      <AuthGate>
        {/* Reset scroll to top on every forward navigation — gives the app
            a native mobile feel where tapping into a screen always starts
            you at the top. Back/forward still restore. */}
        <ScrollToTop />

        {/* Global resume banner — appears on every screen if a cook is in
            progress (spec §2). Cooking mode itself hides it. */}
        <ResumeBanner />

        <AnimatedRoutes />
      </AuthGate>
    </UserContextProvider>
  );
}

/**
 * Routes wrapped in `AnimatePresence` so specific exit animations can play
 * on unmount.
 *
 * Today the only exit we animate is Recipe sliding off to the right when
 * the user goes back (POP) — the iOS-style hierarchical-nav cue. Forward
 * navigations and other back-navs unmount instantly (no flash), letting
 * each route's own entry animation carry the choreography.
 */
// Variants are defined outside the component so the function references
// stay stable across renders. `exit` is a function of the `custom` prop —
// `captured` is whatever was passed to AnimatePresence's `custom` at
// unmount time. We only slide off the right when the user is going back
// (POP) AND the route being unmounted is a Recipe page; everything else
// unmounts instantly (no exit translate).
const routeVariants: Variants = {
  enter: { x: 0 },
  exit: (custom: { navType: NavigationType; isRecipe: boolean }) => ({
    x: custom.navType === "POP" && custom.isRecipe ? "100%" : 0,
  }),
};

function AnimatedRoutes() {
  const location = useLocation();
  const navType = useNavigationType();
  const pathname = location.pathname;
  const isRecipe = pathname.startsWith("/recipe/");
  const customExit = { navType, isRecipe };

  return (
    // mode="wait" — the exiting route fully completes its animation
    // before the new one mounts. Previously used `popLayout` which let
    // both routes coexist, but the exiting page lost its layout (became
    // position:absolute and collapsed to content width), producing the
    // "both pages shrunk" visual on back nav. With "wait" you see Recipe
    // slide cleanly off-right, then Results appears.
    <AnimatePresence mode="wait" custom={customExit}>
      <motion.div
        key={pathname}
        variants={routeVariants}
        initial="enter"
        animate="enter"
        exit="exit"
        custom={customExit}
        transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
      >
        <Routes location={location}>
          <Route path="/" element={<Form />} />
          <Route
            path="/results"
            element={
              <PageTransition variant="slideUp">
                <Results />
              </PageTransition>
            }
          />
          {/* No PageTransition wrapper — the shared-element title morph is
              the entry animation (forward direction). On back, the parent
              motion.div above handles the slide-off-right. */}
          <Route path="/recipe/:id" element={<Recipe />} />
          <Route
            path="/cook/:id"
            element={
              <PageTransition variant="slideUp">
                <Cooking />
              </PageTransition>
            }
          />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}
