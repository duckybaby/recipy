// Screen 4 — Cooking mode — spec §6.
// M0: placeholder. M3 will build the offline-capable cooking screen
// with wake lock and multi-channel timer alert.

export default function Cooking() {
  return (
    <main className="mx-auto max-w-md px-5 pt-12 safe-pt safe-pb">
      <h1 className="text-title font-medium">Cooking mode</h1>
      <p className="mt-2 text-ink-muted">
        Cooking screen (M0 placeholder). Built in M3.
      </p>
    </main>
  );
}
