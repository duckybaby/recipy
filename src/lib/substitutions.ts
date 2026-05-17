// Substitution text helpers (spec §5.2).
//
// When the user swaps an ingredient (e.g. butter → olive oil) on the
// Ingredients tab, the Recipe tab's step text auto-renders with the new
// name in place of the original. Same map flows into Cooking mode (M3).
//
// Word-boundary regex keeps "butter" from accidentally rewriting
// "buttermilk", and case of the first letter is preserved so
// sentence-leading capitalization survives.

export type AppliedSubstitutions = Record<string, string>;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Apply the user's accepted substitutions to a piece of free text. */
export function applySubstitutions(
  text: string,
  swaps: AppliedSubstitutions,
): string {
  let out = text;
  for (const [original, replacement] of Object.entries(swaps)) {
    if (!original || !replacement) continue;
    const re = new RegExp(`\\b${escapeRegExp(original)}\\b`, "gi");
    out = out.replace(re, (match) => {
      // Preserve case of the first character so sentence-leading
      // "Butter" becomes "Olive oil", not "olive oil".
      if (match[0] && match[0] === match[0].toUpperCase()) {
        return replacement.charAt(0).toUpperCase() + replacement.slice(1);
      }
      return replacement;
    });
  }
  return out;
}
