// Chip group used in the Form (spec §3).
//
// Multi-select toggles values in/out of the array. Single-select replaces
// the selection or deselects when the same chip is tapped again.
//
// When `groupId` is passed, the user can also add a custom chip via the
// "+ Add" button. Custom chips persist in localStorage (see storage.ts)
// and render alongside the built-in options. Long-press / hover-to-show
// a small "×" to remove a custom chip.
//
// `maxRows` caps the visible wrap-rows when collapsed. Anything beyond
// is hidden under a max-height clamp and revealed by a "Show all" toggle
// rendered below the chip wrap. Cap value is height-in-pixels derived
// from the chip min-height + gap so it's invariant across viewport sizes.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  /** Visible-row cap when collapsed. Overflow is hidden behind a
      "Show all" toggle. Defaults to 4. */
  maxRows?: number;
  /** Notified whenever the rendered chip set changes so the form can
      keep a stable count for the splat CTA. */
  onOptionsChange?: (options: ChipOption[]) => void;
}

// Matches `.chip { min-height: 48px }` + Tailwind `gap-2` (8px) used on
// the wrap container. If either changes, update this so the visual cap
// still matches "N visual rows."
const CHIP_ROW_PX = 48;
const CHIP_GAP_PX = 8;
const rowsToPx = (rows: number) => rows * CHIP_ROW_PX + (rows - 1) * CHIP_GAP_PX;

export function ChipGroup({
  id,
  label,
  options,
  selected,
  multi,
  onChange,
  allowAdd = false,
  maxRows = 4,
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

  // -------- Row cap (collapse / expand) --------
  // Cap kicks in only when the natural height of the wrap exceeds the
  // `maxRows` threshold. Measured with a ResizeObserver so the toggle
  // appears/disappears as chips are added or removed and as the
  // container reflows across breakpoints.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const capPx = rowsToPx(maxRows);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const check = () => {
      // scrollHeight is the natural height regardless of the current
      // max-height clamp, so this works whether expanded or not.
      setOverflowing(el.scrollHeight > capPx + 1);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [capPx, allOptions.length, adding]);

  const showToggle = overflowing || expanded;

  return (
    <section id={`chip-group-${id}`} className="flex flex-col gap-3">
      <h2 className="font-sans text-caption font-semibold uppercase tracking-[0.08em] text-ink-faint">
        {label}
      </h2>

      <div
        ref={wrapRef}
        className="flex flex-wrap gap-2 overflow-hidden transition-[max-height] duration-300 ease-out"
        style={{ maxHeight: expanded ? 2000 : capPx }}
      >
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
              // text-body (16px), NOT text-strong (15px). 16px is the iOS
              // auto-zoom threshold — anything smaller triggers Safari to
              // zoom in on focus, which is jarring now that pinch-zoom is
              // re-enabled at the viewport level (Patch 3).
              className="h-12 w-40 bg-transparent text-body text-ink placeholder:text-ink-disabled focus:outline-none"
            />
          </div>
        )}
      </div>

      {showToggle && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="focus-ring -mt-1 self-start rounded text-caption text-ink-muted underline decoration-ink-faint decoration-1 underline-offset-4 hover:text-ink"
        >
          {expanded ? "Show fewer" : "Show all"}
        </button>
      )}
    </section>
  );
}
