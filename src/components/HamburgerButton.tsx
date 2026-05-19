// Hamburger trigger — opens the global Drawer.
//
// Rendered in the top-left slot of Form / Results / Recipe top bars.
// Cooking mode (M4) intentionally omits this so the cook screen stays
// distraction-free.
//
// Sits beside back arrows on Results / Recipe (hamburger on the far
// left, back arrow to its right). Matches the height of the existing
// 40px icon buttons.

import { Menu } from "lucide-react";
import { useDrawer } from "../hooks/useDrawer";

export function HamburgerButton({ className = "" }: { className?: string }) {
  const { openDrawer } = useDrawer();
  return (
    <button
      type="button"
      onClick={openDrawer}
      aria-label="Open menu"
      className={`focus-ring inline-flex h-10 w-10 shrink-0 items-center justify-center text-ink ${className}`}
    >
      <Menu size={20} />
    </button>
  );
}
