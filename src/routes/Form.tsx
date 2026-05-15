// Screen 1 — Form ("What are we cooking?") — spec §3.
// M0: placeholder. M1 will build out the chip groups + filter state.

export default function Form() {
  return (
    <main className="mx-auto max-w-md px-5 pt-12 safe-pt safe-pb">
      <h1 className="text-[17px] font-medium">What are we cooking?</h1>
      <p className="mt-2 text-slate-500">
        Form screen (M0 placeholder). Chip groups arrive in M1.
      </p>
    </main>
  );
}
