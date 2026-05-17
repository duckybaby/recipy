// Tri-state theme toggle: Light → Dark → Auto → Light → ...
//
// "Auto" (store.theme === null) follows prefers-color-scheme. Once a user
// commits to Light or Dark we ignore the OS, until they cycle back to Auto.
//
// The icon reflects the CURRENT pref, not the next destination:
//   • Sun     → Light mode locked
//   • Moon    → Dark mode locked
//   • Monitor → Auto (following system)
//
// This is the macOS System Settings appearance pattern. Showing current
// state is more honest than "destination" icons because Auto has no
// natural directional metaphor.

import { Monitor, Moon, Sun } from "lucide-react";
import { useStore, type ThemePreference } from "../lib/store";

// Order matters — the cycle is light → dark → auto → light → ...
const CYCLE: readonly ThemePreference[] = ["light", "dark", null];

const LABELS = {
  light: "Light",
  dark: "Dark",
  auto: "Auto (follows system)",
} as const;

function prefKey(p: ThemePreference): keyof typeof LABELS {
  return p === null ? "auto" : p;
}

export function ThemeToggle() {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);

  const currentKey = prefKey(theme);
  const nextIdx = (CYCLE.indexOf(theme) + 1) % CYCLE.length;
  const next = CYCLE[nextIdx];
  const nextKey = prefKey(next);

  const Icon =
    currentKey === "light" ? Sun : currentKey === "dark" ? Moon : Monitor;

  const label = `Theme: ${LABELS[currentKey]}. Tap for ${LABELS[nextKey]}.`;

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={label}
      title={label}
      className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-full text-ink-muted transition-colors duration-150 hover:bg-paper-soft hover:text-ink active:scale-95"
    >
      <Icon size={18} strokeWidth={1.75} />
    </button>
  );
}
