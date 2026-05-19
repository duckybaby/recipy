// "Edit choices" bottom sheet on the Results page (spec §3.2 — M3 phase 3).
//
// Opens when the user taps the "Edit" link below the filter summary.
// Carries every chip group from Form (minus "Surprise me" — that's a
// start-fresh mood, not an edit-existing-filters action), an "Update
// recipes" CTA pinned at the bottom, and dismisses on backdrop tap,
// close X, swipe-down, or Escape.
//
// Local state vs caller state:
//   • The sheet keeps its own `localFilters` copy of the initial
//     filters. The user mutates only the local copy.
//   • On Update, the local copy is handed back to the caller via
//     `onUpdate(localFilters)`. The caller writes to the store and
//     fires the search.
//   • On Dismiss, local changes are discarded — next open resets to
//     whatever the current `initialFilters` are.
//
// Dirty detection uses `filtersEqual` from the store module so we
// compare value-by-value rather than reference. The Update CTA stays
// disabled until something actually differs from the initial filters.

import { useEffect, useState } from "react";
import {
  AnimatePresence,
  motion,
  type PanInfo,
} from "framer-motion";
import { X } from "lucide-react";
import { ChipGroup } from "./ChipGroup";
import {
  COOK_OPTIONS,
  CUISINE_OPTIONS,
  DIET_OPTIONS,
  MAIN_OPTIONS,
  MEAL_OPTIONS,
  PREP_OPTIONS,
  VIBE_OPTIONS,
} from "../lib/filterOptions";
import { filtersEqual } from "../lib/store";
import type {
  CookMax,
  Cuisine,
  Diet,
  MainIngredient,
  Meal,
  PrepMax,
  SearchFilters,
  Vibe,
} from "../lib/types";

// Swipe-down distance (in px) past which we treat the gesture as a
// dismiss intent. Combined with a positive y-velocity so a slow drag
// back up doesn't accidentally close.
const SWIPE_DISMISS_THRESHOLD_PX = 100;
const SWIPE_DISMISS_VELOCITY_PX_S = 200;

export function EditChoicesSheet({
  open,
  initialFilters,
  onClose,
  onUpdate,
}: {
  open: boolean;
  initialFilters: SearchFilters;
  onClose: () => void;
  onUpdate: (next: SearchFilters) => void;
}) {
  // Local filter copy. Resets on every open so previous edits that
  // were dismissed don't bleed back in.
  const [filters, setFilters] = useState<SearchFilters>(initialFilters);

  useEffect(() => {
    if (open) setFilters(initialFilters);
  }, [open, initialFilters]);

  // Escape closes — a11y baseline.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Body scroll lock while the sheet is up — keeps the underlying page
  // from drifting when the user scrolls inside the sheet content.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const isDirty = !filtersEqual(filters, initialFilters);

  function patch(next: Partial<SearchFilters>) {
    setFilters((prev) => ({ ...prev, ...next }));
  }

  function handleDragEnd(_e: unknown, info: PanInfo) {
    // Only treat downward drag past a meaningful distance + speed as
    // a dismiss. Drag back up returns the sheet to rest position via
    // the spring transition.
    if (
      info.offset.y > SWIPE_DISMISS_THRESHOLD_PX &&
      info.velocity.y > SWIPE_DISMISS_VELOCITY_PX_S
    ) {
      onClose();
    }
  }

  // Prep / cook single-select serialise back through "any" sentinel.
  // Mirrors the same conversion Form does on its onChange callbacks.
  const prepSelected: string[] =
    filters.prepMax === null ? [] : [String(filters.prepMax)];
  const cookSelected: string[] =
    filters.cookMax === null ? [] : [String(filters.cookMax)];

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop — covers everything including the fixed top bar
              (z-50) so the page underneath is fully muted. Tap to
              close + discard. */}
          <motion.div
            key="edit-sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="fixed inset-0 z-50 bg-overlay"
            onClick={onClose}
            aria-hidden
          />

          {/* Sheet panel. drag="y" with constraints={top:0, bottom:0}
              lets the user pull it down but not up, with elasticity
              for the spring-back feel. */}
          <motion.div
            key="edit-sheet-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-choices-title"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 280 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.25 }}
            onDragEnd={handleDragEnd}
            className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-sheet border-t border-line bg-paper shadow-soft-lg"
            style={{ height: "85dvh" }}
          >
            {/* Drag handle — visual cue that the sheet is swipe-down
                dismissable. The whole panel is draggable, not just
                this strip. */}
            <div
              aria-hidden
              className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-line"
            />

            {/* Header — title left, close X right. Borderless so the
                drag handle reads as part of the same top group. */}
            <div className="flex shrink-0 items-center justify-between px-5 pb-3 pt-3">
              <h2
                id="edit-choices-title"
                className="text-section text-ink"
              >
                Edit choices
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-paper-soft hover:text-ink"
              >
                <X size={20} />
              </button>
            </div>

            {/* Scrolling body — same chip groups as Form, same order.
                Surprise me intentionally omitted; that's a start-over
                mood, not an edit. */}
            <div className="flex-1 overflow-y-auto px-5 pb-6">
              <div className="flex flex-col gap-10 pt-4">
                <ChipGroup
                  id="meal"
                  label="Meal"
                  options={MEAL_OPTIONS}
                  selected={filters.meal}
                  multi
                  allowAdd
                  onChange={(next) => patch({ meal: next as Meal[] })}
                />
                <ChipGroup
                  id="cuisine"
                  label="Cuisine"
                  options={CUISINE_OPTIONS}
                  selected={filters.cuisines}
                  multi
                  allowAdd
                  onChange={(next) =>
                    patch({ cuisines: next as Cuisine[] })
                  }
                />
                <ChipGroup
                  id="diet"
                  label="Diet"
                  options={DIET_OPTIONS}
                  selected={filters.diet}
                  multi
                  allowAdd
                  onChange={(next) => patch({ diet: next as Diet[] })}
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
                    patch({ prepMax });
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
                    patch({ cookMax });
                  }}
                />
                <ChipGroup
                  id="vibe"
                  label="Vibe"
                  options={VIBE_OPTIONS}
                  selected={filters.vibes}
                  multi
                  allowAdd
                  onChange={(next) => patch({ vibes: next as Vibe[] })}
                />
                <ChipGroup
                  id="main"
                  label="Main ingredient"
                  options={MAIN_OPTIONS}
                  selected={filters.mainIngredients}
                  multi
                  allowAdd
                  onChange={(next) =>
                    patch({ mainIngredients: next as MainIngredient[] })
                  }
                />
              </div>
            </div>

            {/* Footer — pinned Update CTA. Border separates it from
                the scrolling body. Safe-area-bottom padding keeps the
                button clear of the iOS home indicator. Disabled until
                the user has actually changed something. */}
            <div
              className="shrink-0 border-t border-line bg-paper px-5 pt-3"
              style={{
                paddingBottom: "max(env(safe-area-inset-bottom), 16px)",
              }}
            >
              <button
                type="button"
                disabled={!isDirty}
                onClick={() => onUpdate(filters)}
                className="btn-primary focus-ring"
              >
                Update recipes
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
