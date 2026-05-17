// Chip group used in the Form (spec §3).
//
// Multi-select toggles values in/out of the array. Single-select replaces
// the selection or deselects when the same chip is tapped again.
//
// When `groupId` is passed, the user can also add a custom chip via the
// "+ Add" button. Custom chips persist in localStorage (see storage.ts)
// and render alongside the built-in options. Long-press / hover-to-show
// a small "×" to remove a custom chip.

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import {
  addCustomChip,
  getCustomChipsForGroup,
  removeCustomChip,
} from "../lib/storage";

type ChipOption = { value: string; label: string };

interface ChipGroupProps {
  id: string; // stable id for scroll-spy + custom-chip storage key
  label: string;
  options: readonly ChipOption[];
  selected: readonly string[];
  multi: boolean;
  onChange: (next: string[]) => void;
  allowAdd?: boolean; // show "+ Add" UI for user-added options
  /** Notified whenever the rendered chip set changes so the form can
      keep a stable count for the splat CTA. */
  onOptionsChange?: (options: ChipOption[]) => void;
}

export function ChipGroup({
  id,
  label,
  options,
  selected,
  multi,
  onChange,
  allowAdd = false,
  onOptionsChange,
}: ChipGroupProps) {
  // Custom chips load from storage on mount; updates push back synchronously.
  const [customChips, setCustomChips] = useState<string[]>([]);
  useEffect(() => {
    setCustomChips(getCustomChipsForGroup(id));
  }, [id]);

  // Combine built-in + custom into a single rendered list.
  const allOptions: ChipOption[] = [
    ...options,
    ...customChips.map((label) => ({
      value: `custom:${label.toLowerCase()}`,
      label,
    })),
  ];

  useEffect(() => {
    onOptionsChange?.(allOptions);
    // We deliberately don't include onOptionsChange in deps — it would
    // trigger an effect storm on parent re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, options.length, customChips.join("|")]);

  const isSelected = (v: string) => selected.includes(v);
  const isCustom = (v: string) => v.startsWith("custom:");

  const toggle = (v: string) => {
    if (multi) {
      onChange(
        isSelected(v) ? selected.filter((x) => x !== v) : [...selected, v],
      );
    } else {
      onChange(isSelected(v) ? [] : [v]);
    }
  };

  const removeChip = (opt: ChipOption) => {
    const label = opt.label;
    removeCustomChip(id, label);
    setCustomChips((prev) => prev.filter((c) => c !== label));
    if (isSelected(opt.value)) {
      onChange(selected.filter((x) => x !== opt.value));
    }
  };

  // -------- "Add" inline input --------
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const commitAdd = () => {
    const value = draft.trim();
    if (value) {
      addCustomChip(id, value);
      setCustomChips((prev) =>
        prev.some((c) => c.toLowerCase() === value.toLowerCase())
          ? prev
          : [...prev, value],
      );
      // Auto-select the new chip so the user sees the connection.
      const newValue = `custom:${value.toLowerCase()}`;
      if (multi) {
        onChange([...selected, newValue]);
      } else {
        onChange([newValue]);
      }
    }
    setDraft("");
    setAdding(false);
  };

  const cancelAdd = () => {
    setDraft("");
    setAdding(false);
  };

  return (
    <section id={`chip-group-${id}`} className="flex flex-col gap-3">
      <h2 className="font-sans text-caption font-semibold uppercase tracking-[0.08em] text-ink-faint">
        {label}
      </h2>

      <div className="flex flex-wrap gap-2">
        {allOptions.map((opt) => {
          const selectedState = isSelected(opt.value);
          const custom = isCustom(opt.value);
          return (
            <span key={opt.value} className="relative inline-flex">
              <button
                type="button"
                className={`chip focus-ring ${
                  selectedState ? "chip-selected" : "chip-unselected"
                } ${custom ? "pr-9" : ""}`}
                onClick={() => toggle(opt.value)}
                aria-pressed={selectedState}
              >
                {opt.label}
              </button>
              {custom && (
                <button
                  type="button"
                  aria-label={`Remove ${opt.label}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeChip(opt);
                  }}
                  className="focus-ring absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-ink-faint hover:bg-paper-soft hover:text-ink"
                >
                  <X size={12} />
                </button>
              )}
            </span>
          );
        })}

        {allowAdd && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="chip chip-unselected focus-ring border-dashed text-ink-muted"
            aria-label={`Add to ${label}`}
          >
            <Plus size={14} className="mr-1" /> Add
          </button>
        )}

        {allowAdd && adding && (
          <div className="inline-flex items-center gap-2 rounded-pill border-[1.5px] border-accent bg-paper px-4 leading-none">
            <input
              ref={inputRef}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitAdd();
                else if (e.key === "Escape") cancelAdd();
              }}
              onBlur={() => {
                if (draft.trim()) commitAdd();
                else cancelAdd();
              }}
              maxLength={28}
              placeholder="Type and hit enter"
              className="h-12 w-40 bg-transparent text-strong text-ink placeholder:text-ink-disabled focus:outline-none"
            />
          </div>
        )}
      </div>
    </section>
  );
}
