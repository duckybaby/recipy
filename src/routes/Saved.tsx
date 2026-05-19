// Saved recipes route (spec §3.8 — M3 phase 5 placeholder).
//
// Phase 3 wires the drawer link here so navigation works end-to-end.
// Phase 5 fills this in with the actual heart-saved list backed by
// /users/{uid}/saved in recipy-users.

import { HamburgerButton } from "../components/HamburgerButton";
import { TopBar } from "../components/TopBar";

export default function Saved() {
  return (
    <>
      <TopBar>
        <div className="mx-auto flex max-w-md items-center gap-1 px-3 pb-2 md:max-w-[1280px] md:px-8 lg:px-10">
          <HamburgerButton />
          <h1 className="font-sans text-strong font-semibold text-ink">Saved recipes</h1>
        </div>
      </TopBar>

      <main className="mx-auto max-w-md px-5 pt-12 md:max-w-[1280px] md:px-8 lg:px-10">
        <h2 className="text-section text-ink">Nothing saved yet</h2>
        <p className="mt-2 text-body text-ink-muted">
          Tap the heart on any recipe to save it here. Coming in M3 phase 5.
        </p>
      </main>
    </>
  );
}
