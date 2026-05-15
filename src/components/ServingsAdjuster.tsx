// Servings stepper used on the Recipe detail screen (spec §5.1).
//
// Range 1–12. Decrement disabled at 1, increment disabled at 12.
// Tapping mutates the parent — quantity scaling lives in scaling.ts.

import { Minus, Plus } from "lucide-react";

interface Props {
  servings: number;
  onChange: (next: number) => void;
}

const MIN = 1;
const MAX = 12;

export function ServingsAdjuster({ servings, onChange }: Props) {
  const dec = () => {
    if (servings > MIN) onChange(servings - 1);
  };
  const inc = () => {
    if (servings < MAX) onChange(servings + 1);
  };

  return (
    <div className="inline-flex items-center gap-2">
      <span className="text-body text-ink-muted">Serves</span>
      <div className="inline-flex items-center rounded-full border-[2.5px] border-ink bg-paper shadow-brutal-sm">
        <button
          type="button"
          onClick={dec}
          disabled={servings <= MIN}
          aria-label="Decrease servings"
          className="focus-ring flex h-9 w-9 items-center justify-center rounded-full text-ink disabled:text-ink-disabled"
        >
          <Minus size={14} />
        </button>
        <span className="min-w-[18px] text-center text-strong font-medium tabular-nums text-ink">
          {servings}
        </span>
        <button
          type="button"
          onClick={inc}
          disabled={servings >= MAX}
          aria-label="Increase servings"
          className="focus-ring flex h-9 w-9 items-center justify-center rounded-full text-ink disabled:text-ink-disabled"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}
