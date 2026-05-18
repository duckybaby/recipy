// "Something looks wrong?" bottom sheet (spec §5.2).
//
// Each row maps to a recovery flow handled in Recipe.tsx's onFeedbackSelect:
// steps/ingredients mismatches trigger find-alternate-source; calories/time
// errors call /api/recompute-field; "not what I want" just navigates back.
//
// Entry/exit is a 160ms ease-out slide from the bottom, with the overlay
// crossfading. Matches ActionSheet so both bottom sheets feel identical.

import { useEffect, useState } from "react";
import { ChevronRight, X } from "lucide-react";

export type FeedbackReason =
  | "steps-dont-match"
  | "ingredients-wrong"
  | "calories-off"
  | "time-off"
  | "not-what-i-want";

interface Row {
  reason: FeedbackReason;
  label: string;
}

const ROWS: Row[] = [
  { reason: "steps-dont-match", label: "Steps don't match this dish" },
  { reason: "ingredients-wrong", label: "Ingredients look wrong" },
  { reason: "calories-off", label: "Calorie count is off" },
  { reason: "time-off", label: "Time is way off" },
  { reason: "not-what-i-want", label: "Just not what I want" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (reason: FeedbackReason) => void;
}

const TRANSITION_MS = 160;

export function FeedbackSheet({ open, onClose, onSelect }: Props) {
  // Two-phase mount/visible so the sheet animates both in and out.
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Double rAF: one frame to paint the initial `translate-y-full` state,
      // another to flip `visible`. A single rAF gets batched and the open
      // animation silently no-ops.
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }
    setVisible(false);
    const t = window.setTimeout(() => setMounted(false), TRANSITION_MS);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className={`absolute inset-0 bg-overlay transition-opacity ease-out ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        style={{ transitionDuration: `${TRANSITION_MS}ms` }}
      />
      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Something looks wrong"
        className={`safe-pb absolute inset-x-0 bottom-0 rounded-t-sheet border-t border-line bg-paper pb-2 shadow-soft-lg transition-transform ease-out ${
          visible ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ transitionDuration: `${TRANSITION_MS}ms` }}
      >
        <header className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="text-section text-ink">
            Something looks wrong?
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="focus-ring -mr-2 inline-flex h-10 w-10 items-center justify-center text-ink-muted"
          >
            <X size={18} />
          </button>
        </header>

        <ul className="px-2 pb-2">
          {ROWS.map((row) => (
            <li key={row.reason}>
              <button
                type="button"
                onClick={() => onSelect(row.reason)}
                className="focus-ring flex w-full items-center justify-between rounded-button px-3 py-3 text-left text-strong text-ink active:bg-paper-soft"
              >
                <span>{row.label}</span>
                <ChevronRight
                  size={16}
                  className="text-ink-faint"
                  aria-hidden
                />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
