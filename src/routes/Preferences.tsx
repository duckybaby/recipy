// Preferences route (spec §3.7 — M3 phase 4 placeholder).
//
// Phase 3 wires the drawer link here so navigation works end-to-end.
// Phase 4 fills this in with diet / allergies / spice tolerance / default
// time limits / custom-chip sync against users/{uid}.preferences.

import { HamburgerButton } from "../components/HamburgerButton";
import { TopBar } from "../components/TopBar";

export default function Preferences() {
  return (
    <>
      <TopBar>
        <div className="mx-auto flex max-w-md items-center gap-1 px-3 pb-2 md:max-w-[1280px] md:px-8 lg:px-10">
          <HamburgerButton />
          <h1 className="font-sans text-strong font-semibold text-ink">Preferences</h1>
        </div>
      </TopBar>

      <main className="mx-auto max-w-md px-5 pt-12 md:max-w-[1280px] md:px-8 lg:px-10">
        <h2 className="text-section text-ink">Coming up</h2>
        <p className="mt-2 text-body text-ink-muted">
          Diet defaults, allergies, spice tolerance, and custom-chip sync. M3 phase 4.
        </p>
      </main>
    </>
  );
}
