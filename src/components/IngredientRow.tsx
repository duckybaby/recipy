// Single ingredient row on the Recipe detail screen (spec §5).
//
// The dot color encodes Instamart availability:
//   green  → in stock
//   orange → missing
//   gray   → not checked (Path B fallback may surface this in M4)

import type { Ingredient } from "../lib/types";

interface Props {
  ingredient: Ingredient;
  /** Pre-scaled, pre-formatted quantity (or empty string). */
  displayQuantity: string;
  onAdd?: () => void;
}

export function IngredientRow({ ingredient, displayQuantity, onAdd }: Props) {
  const { instamart, name, unit } = ingredient;

  const dotClass = instamart.available
    ? "bg-success-500"
    : "bg-missing";

  const unitText = unit ? ` ${unit}` : "";

  return (
    <li className="flex items-start gap-3 py-2">
      <span
        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotClass}`}
        aria-hidden
      />
      <div className="flex flex-1 items-baseline justify-between gap-3">
        <p className="text-strong leading-snug text-ink">
          <span className="text-ink-muted">
            {displayQuantity}
            {unitText}{" "}
          </span>
          {name}
        </p>
        {!instamart.available && (
          <button
            type="button"
            onClick={onAdd}
            className="focus-ring shrink-0 text-caption text-warning-700 underline underline-offset-2"
          >
            add
          </button>
        )}
      </div>
    </li>
  );
}
