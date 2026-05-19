// Global navigation drawer (spec §3.6 — M3 phase 3).
//
// Slides in from the left with a backdrop dim. Opens via HamburgerButton
// in any screen's top bar except Cooking (the drawer mount is unconditional
// in App.tsx, but Cooking just doesn't render a hamburger). Closes on:
//   • Tap outside (backdrop)
//   • Tap the X close button
//   • Tap any nav item (after navigating)
//   • Press Escape
//
// Content (top to bottom):
//   • Close X
//   • Profile photo + display name + email
//   • Find recipes / Saved recipes / Preferences nav items
//   • Sign out (bottom, divider above) — confirmation prompt before signOut.
//
// Active nav item gets the accent-soft fill + accent-strong text. Active
// is computed from `useLocation().pathname` so it stays in sync with the
// real router state.
//
// Mobile width: ~80% of viewport, capped at 320px. Desktop (md+) sits at
// 320px. The full-rail-at-lg+ pattern from the spec is intentionally
// deferred — phase 3 ships the mobile drawer; the desktop rail is a
// follow-up so it can be designed alongside Preferences + Saved layouts.

import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { Heart, LogOut, Monitor, Moon, Search, Settings, Sun } from "lucide-react";
import { useDrawer } from "../hooks/useDrawer";
import { useUserContext } from "../hooks/useUserContext";
import { useStore, type ThemePreference } from "../lib/store";

// Swipe-left dismiss thresholds. User has to drag past 80px AND keep
// some leftward momentum so a slow drift back doesn't count.
const SWIPE_DISMISS_X_PX = 80;
const SWIPE_DISMISS_V_PX_S = 200;

type NavItem = {
  path: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
};

const NAV_ITEMS: NavItem[] = [
  { path: "/", label: "Find recipes", Icon: Search },
  { path: "/saved", label: "Saved recipes", Icon: Heart },
  { path: "/preferences", label: "Preferences", Icon: Settings },
];

// Theme cycle order matches the (deleted) ThemeToggle component:
// light → dark → auto → light. "auto" means follow prefers-color-scheme.
const THEME_CYCLE: readonly ThemePreference[] = ["light", "dark", null];

const THEME_LABEL: Record<string, string> = {
  light: "Light",
  dark: "Dark",
  auto: "Auto",
};

function themeKey(pref: ThemePreference): "light" | "dark" | "auto" {
  return pref === null ? "auto" : pref;
}

function themeIcon(pref: ThemePreference) {
  if (pref === "light") return Sun;
  if (pref === "dark") return Moon;
  return Monitor;
}

export function Drawer() {
  const { open, closeDrawer } = useDrawer();
  const { user, signOut } = useUserContext();
  const location = useLocation();
  const navigate = useNavigate();
  // Theme cycle: light → dark → auto. Mirrors the (deleted)
  // ThemeToggle component's cycle. Persisted in the Zustand store;
  // main.tsx's subscription re-applies the resolved mode on every
  // change.
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const ThemeIcon = themeIcon(theme);
  const nextTheme =
    THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length];

  // Escape key closes the drawer (keyboard a11y).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeDrawer]);

  // Body scroll lock while drawer is open — without it, swipe-up on the
  // drawer scrolls the page underneath, which feels wrong on mobile.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  function handleNav(path: string) {
    if (path !== location.pathname) navigate(path);
    closeDrawer();
  }

  async function handleSignOut() {
    const confirmed = window.confirm("Sign out of recipy?");
    if (!confirmed) return;
    closeDrawer();
    try {
      await signOut();
      // AuthGate re-mounts Splash automatically via onAuthStateChanged.
    } catch (err) {
      console.warn("sign out failed", err);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop — full-screen dim, fades in. Tap to close. */}
          <motion.div
            key="drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="fixed inset-0 z-40 bg-overlay"
            onClick={closeDrawer}
            aria-hidden
          />

          {/* Drawer itself — slides in from left. role=dialog so screen
              readers announce it as a modal context. */}
          <motion.aside
            key="drawer-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
            // Swipe-left to dismiss. The whole panel is draggable;
            // dragConstraints lock x at 0 (no rest position drift),
            // dragElastic on the left side gives the spring-back feel
            // until the threshold in onDragEnd commits the dismiss.
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0.35, right: 0 }}
            onDragEnd={(_e: unknown, info: PanInfo) => {
              if (
                info.offset.x < -SWIPE_DISMISS_X_PX &&
                info.velocity.x < -SWIPE_DISMISS_V_PX_S
              ) {
                closeDrawer();
              }
            }}
            className="safe-pt safe-pb fixed inset-y-0 left-0 z-50 flex w-[80vw] max-w-[320px] flex-col border-r border-line bg-paper shadow-soft-lg"
          >
            {/* No close button — tap-outside (backdrop), swipe-left,
                and Escape all close the drawer. Three dismiss paths is
                enough; an X button just adds chrome. */}

            {/* User header — photo + name + email. Photo is a Google
                profile image from lh3.googleusercontent.com; img-src on
                the CSP already permits *.googleusercontent.com. */}
            {user && (
              <div className="flex items-center gap-3 border-b border-line px-5 pb-4">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="h-10 w-10 shrink-0 rounded-full bg-paper-soft object-cover"
                  />
                ) : (
                  <div className="h-10 w-10 shrink-0 rounded-full bg-paper-soft" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-strong font-semibold text-ink">
                    {user.displayName ?? "—"}
                  </div>
                  <div className="truncate text-caption text-ink-muted">
                    {user.email ?? ""}
                  </div>
                </div>
              </div>
            )}

            {/* Primary nav. Active item gets the accent-soft fill that
                chip-selected uses, so it reads as the same "selected"
                affordance language used elsewhere in the app. */}
            <nav className="flex flex-col gap-1 px-3 pt-4">
              {NAV_ITEMS.map(({ path, label, Icon }) => {
                const active = location.pathname === path;
                return (
                  <button
                    key={path}
                    type="button"
                    onClick={() => handleNav(path)}
                    aria-current={active ? "page" : undefined}
                    className={`focus-ring flex w-full items-center gap-3 rounded-button px-3 py-3 text-left text-strong font-medium transition-colors ${
                      active
                        ? "text-accent-strong"
                        : "text-ink hover:bg-paper-soft"
                    }`}
                    style={
                      active
                        ? { backgroundColor: "var(--color-accent-soft)" }
                        : undefined
                    }
                  >
                    <Icon size={18} strokeWidth={1.75} />
                    <span>{label}</span>
                  </button>
                );
              })}
            </nav>

            {/* Spacer pushes the bottom cluster down. */}
            <div className="flex-1" />

            {/* Theme — settings-style row. Label "Theme" left, the
                current mode (icon + name) right in a muted tone to
                read as a state indicator, not a second action. Whole
                row cycles light → dark → auto on tap. No left icon
                since this row isn't navigation, it's a setting. */}
            <div className="px-3 pt-2 pb-2">
              <button
                type="button"
                onClick={() => setTheme(nextTheme)}
                aria-label={`Theme: ${THEME_LABEL[themeKey(theme)]}. Tap for ${THEME_LABEL[themeKey(nextTheme)]}.`}
                className="focus-ring flex w-full items-center justify-between rounded-button px-3 py-3 text-left text-strong font-medium text-ink transition-colors hover:bg-paper-soft"
              >
                {/* Stack "Theme" + the "Tap to change" hint as one
                    column on the left. items-center on the parent
                    button vertically centres the right-hand state
                    indicator against this column's full height.
                    text-left on the button is what stops the inner
                    text from centre-aligning to the button default. */}
                <span className="flex flex-col">
                  <span>Theme</span>
                  <span className="mt-0.5 text-meta font-normal text-ink-disabled">
                    Tap to change
                  </span>
                </span>
                <span className="flex items-center gap-2 text-ink-muted">
                  <ThemeIcon size={18} strokeWidth={1.75} />
                  <span>{THEME_LABEL[themeKey(theme)]}</span>
                </span>
              </button>
            </div>

            {/* Sign out — own cluster, divider above to mark it as
                distinct (destructive-ish, separate from settings). */}
            <div className="border-t border-line px-3 py-3">
              <button
                type="button"
                onClick={handleSignOut}
                className="focus-ring flex w-full items-center gap-3 rounded-button px-3 py-3 text-left text-strong font-medium text-ink-muted transition-colors hover:bg-paper-soft hover:text-ink"
              >
                <LogOut size={18} strokeWidth={1.75} />
                <span>Sign out</span>
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
