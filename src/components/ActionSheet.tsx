// Generic bottom action sheet. Mirrors FeedbackSheet's shape but takes a
// flexible list of actions — used for the Recipe-page kebab menu (More like
// this · Substitutions · Different recipe · Something looks wrong).
//
// Entry/exit is a 160ms ease-out slide from the bottom, with the overlay
// crossfading at the same time. The sheet stays mounted through the exit
// transition so the closing motion plays cleanly.

import { useEffect, useState } from "react";
import { ChevronRight, X } from "lucide-react";

export interface ActionSheetAction {
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
}

interface Props {
  open: boolean;
  title: string;
  actions: ActionSheetAction[];
  onClose: () => void;
}

const TRANSITION_MS = 160;

export function ActionSheet({ open, title, actions, onClose }: Props) {
  // Two-phase: `mounted` controls whether the DOM is present; `visible`
  // drives the transform/opacity. We flip `visible` one frame after mount so
  // the browser registers the starting state before the transition fires.
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Double rAF: the first frame lets the browser paint the initial
      // `translate-y-full` state; the second flips `visible`, so the
      // transition has a real starting frame to animate from. A single rAF
      // here gets batched and the open animation silently no-ops.
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
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className={`absolute inset-0 bg-overlay transition-opacity ease-out ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        style={{ transitionDuration: `${TRANSITION_MS}ms` }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`safe-pb absolute inset-x-0 bottom-0 rounded-t-sheet border-t border-line bg-paper pb-2 shadow-soft-lg transition-transform ease-out ${
          visible ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ transitionDuration: `${TRANSITION_MS}ms` }}
      >
        <header className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="text-section text-ink">{title}</h2>
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
          {actions.map((action) => (
            <li key={action.id}>
              <button
                type="button"
                onClick={() => {
                  action.onSelect();
                  onClose();
                }}
                disabled={action.disabled}
                className={`focus-ring flex w-full items-center justify-between rounded-button px-3 py-3 text-left text-strong active:bg-paper-soft disabled:opacity-40 ${
                  action.tone === "danger" ? "text-accent" : "text-ink"
                }`}
              >
                <span>{action.label}</span>
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
