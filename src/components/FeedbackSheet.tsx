// "Something looks wrong?" bottom sheet (spec §5.2).
//
// M1: rows render but recovery flows aren't wired up yet — tapping a row
// closes the sheet without action. M2 will wire each row to its endpoint
// (refetch, recompute, alternate source, etc.).

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

export function FeedbackSheet({ open, onClose, onSelect }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-overlay"
      />
      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Something looks wrong"
        className="safe-pb absolute inset-x-0 bottom-0 border-t-[3px] border-ink bg-paper pb-2"
      >
        <header className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="text-section font-bold text-ink">
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
