// Single ingredient row on the Recipe detail screen (spec §5).
//
// The row is one big tappable area — tapping the checkbox, the quantity,
// or the ingredient name all toggle the Instamart-selection state. The
// substitutes accordion lives *below* the row as a sibling, so taps on
// "1 substitute ⌄" or any chip do their own thing without flipping the
// checkbox. Each interactive child has a comfortable touch target.
//
// Per-ingredient Instamart availability dots / "add" buttons were
// removed — that flow moved to a batch check via the sticky CTA.

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { Ingredient } from "../lib/types";

interface Props {
  ingredient: Ingredient;
  /** Pre-scaled, pre-formatted quantity (or empty string). */
  displayQuantity: string;
  /** Available substitutes from /api/get-substitutions for this ingredient. */
  substitutes?: string[] | null;
  /** Currently-applied substitute name, if the user picked one. */
  appliedSubstitute?: string | null;
  /** Whether this row is selected in the Instamart batch list. */
  selected: boolean;
  onToggleSelected: () => void;
  onApplySubstitute: (substitute: string) => void;
  onResetSubstitute: () => void;
}

export function IngredientRow({
  ingredient,
  displayQuantity,
  substitutes,
  appliedSubstitute,
  selected,
  onToggleSelected,
  onApplySubstitute,
  onResetSubstitute,
}: Props) {
  const { name, unit } = ingredient;
  const unitText = unit ? ` ${unit}` : "";
  const subs = substitutes ?? [];
  const hasSubs = subs.length > 0;

  // Per-row accordion state for the substitutes list. Collapses by default;
  // expanding doesn't affect any other row.
  const [expanded, setExpanded] = useState(false);

  return (
    <li className="py-4">
      {/* Row tappable area — entire band toggles the checkbox. role="checkbox"
          on a button is WCAG-acceptable; aria-checked carries the state. */}
      <button
        type="button"
        role="checkbox"
        aria-checked={selected}
        aria-label={`Select ${name} for Instamart`}
        onClick={onToggleSelected}
        className="focus-ring flex w-full items-start gap-3 text-left"
      >
        {/* Visual checkbox — no longer a button itself; the parent owns
            the click. */}
        <span
          aria-hidden
          className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
            selected
              ? "border-accent bg-accent text-paper"
              : "border-line bg-paper text-transparent"
          }`}
        >
          <Check size={14} strokeWidth={3} />
        </span>

        <p className="min-w-0 flex-1 text-step leading-snug text-ink">
          <span className="text-ink-muted">
            {displayQuantity}
            {unitText}{" "}
          </span>
          {appliedSubstitute ? (
            <>
              <span className="text-ink-faint line-through">{name}</span>{" "}
              <span>{appliedSubstitute}</span>
            </>
          ) : (
            name
          )}
        </p>
      </button>

      {/* Substitutes section — sibling of the row button so taps here
          don't toggle the checkbox. `pl-8` aligns with the text column
          (checkbox 20px + gap 12px). */}
      {appliedSubstitute ? (
        <p className="mt-1.5 pl-8 text-caption text-ink-faint">
          Substituted ·{" "}
          <button
            type="button"
            onClick={onResetSubstitute}
            className="focus-ring inline-block py-1 text-ink-muted underline underline-offset-2 hover:text-ink"
          >
            Reset to {name}
          </button>
        </p>
      ) : hasSubs ? (
        <div className="pl-8">
          {/* Accordion trigger — comfortable 40px tap target via py-2. */}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="focus-ring inline-flex items-center gap-1 py-2 text-caption text-ink-muted hover:text-ink"
          >
            <span>
              {subs.length} substitute{subs.length === 1 ? "" : "s"}
            </span>
            <ChevronDown
              size={14}
              aria-hidden
              className={`transition-transform duration-200 ${
                expanded ? "rotate-180" : ""
              }`}
            />
          </button>

          {/* Collapsible chip list — grid-rows trick for content-height
              transition without measuring. */}
          <div
            className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
              expanded
                ? "grid-rows-[1fr] opacity-100"
                : "grid-rows-[0fr] opacity-0"
            }`}
            aria-hidden={!expanded}
          >
            <div className="overflow-hidden">
              <ul className="mt-1 mb-1 flex flex-wrap gap-2">
                {subs.map((sub) => (
                  <li key={sub}>
                    <button
                      type="button"
                      onClick={() => {
                        onApplySubstitute(sub);
                        setExpanded(false);
                      }}
                      tabIndex={expanded ? 0 : -1}
                      className="focus-ring inline-flex items-center rounded-pill border border-line bg-paper px-3 py-2 text-caption text-ink transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent"
                    >
                      {sub}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </li>
  );
}
