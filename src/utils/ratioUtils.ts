/**
 * Ratio normalization utilities.
 *
 * Business rule:
 *   For a displayed ratio  A : B  (e.g. "Protein : Carb = 1 : 2.5"),
 *   the meaning is: "for every 1 unit of A, there are B units of the second nutrient."
 *
 *   Therefore the normalised scalar we store in the DB is:
 *       normalizedRatio = B / A  (second ÷ first)
 *
 *   Examples
 *   ─────────────────────────────────────────────────
 *   1 : 1    →  1 / 1   = 1
 *   1 : 2.5  →  2.5 / 1 = 2.5
 *   2 : 4    →  4 / 2   = 2
 *   1 : 10   →  10 / 1  = 10
 *   ─────────────────────────────────────────────────
 *
 *   When we load a stored value back for editing / display we show it as "1 : storedValue"
 *   because that is the canonical 1-based representation of the same proportion.
 *
 * Actual recipe validation:
 *   actual = numerator_total / denominator_total
 *   (numerator / denominator are defined per-parameter in the DB)
 *
 *   For Protein:Carb  → actual = carbs_total / protein_total
 *   For Carb:Fibre    → actual = fibre_total / carbs_total
 *   For Omega-6:Omega-3 → actual = omega3_total / omega6_total
 *
 *   Valid when: goal_min ≤ actual ≤ goal_max
 */

/**
 * Convert a user-entered  first : second  ratio into the normalised decimal
 * that is stored in the database.
 *
 * @param first  - Left-hand side of the ratio (the base; must be > 0).
 * @param second - Right-hand side of the ratio (the variable amount).
 * @returns  second / first, or null when first ≤ 0 (invalid / divide-by-zero).
 */
export function normalizeDisplayedRatio(first: number, second: number): number | null {
  if (first <= 0) return null; // guard: divide-by-zero or negative base
  return second / first;
}

/**
 * Format a stored normalised ratio back to a human-readable display string.
 * Because normalizedRatio = second / first and we always use 1 as the base
 * when re-displaying, the canonical form is "1 : storedValue".
 *
 * @param stored - The normalised decimal from the DB (goal_min / goal_max).
 * @returns A string like "1:2.5", or "—" when the value is null/undefined.
 */
export function formatStoredRatio(stored: number | null | undefined): string {
  if (stored == null) return '—';
  return `1:${stored}`;
}

/**
 * Validate that a ratio range is coherent: normalised min ≤ normalised max.
 *
 * @param minFirst   - Left side of the Min input.
 * @param minSecond  - Right side of the Min input.
 * @param maxFirst   - Left side of the Max input.
 * @param maxSecond  - Right side of the Max input.
 * @returns  true when the range is valid (min ≤ max), false otherwise.
 *           Also returns false when any base is ≤ 0 (divide-by-zero guard).
 */
export function isRatioRangeValid(
  minFirst: number, minSecond: number,
  maxFirst: number, maxSecond: number,
): boolean {
  const nMin = normalizeDisplayedRatio(minFirst, minSecond);
  const nMax = normalizeDisplayedRatio(maxFirst, maxSecond);
  if (nMin === null || nMax === null) return false;
  return nMin <= nMax;
}
