// Chip group used in the Form (spec §3).
//
// Multi-select toggles values in/out of the array. Single-select replaces
// the selection or deselects when the same chip is tapped again.

type ChipOption = { value: string; label: string };

interface ChipGroupProps {
  label: string;
  options: readonly ChipOption[];
  selected: readonly string[];
  multi: boolean;
  onChange: (next: string[]) => void;
}

export function ChipGroup({
  label,
  options,
  selected,
  multi,
  onChange,
}: ChipGroupProps) {
  const isSelected = (v: string) => selected.includes(v);

  const toggle = (v: string) => {
    if (multi) {
      onChange(
        isSelected(v) ? selected.filter((x) => x !== v) : [...selected, v],
      );
    } else {
      // Single-select: tapping the selected chip deselects it.
      onChange(isSelected(v) ? [] : [v]);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-strong font-medium text-ink-muted">{label}</h2>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`chip focus-ring ${
              isSelected(opt.value) ? "chip-selected" : "chip-unselected"
            }`}
            onClick={() => toggle(opt.value)}
            aria-pressed={isSelected(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </section>
  );
}
