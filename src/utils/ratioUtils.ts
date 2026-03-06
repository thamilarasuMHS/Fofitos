/**
 * Ratio normalization utilities.
 *
 * Business rule:
 *   For a displayed ratio  A : B  (e.g. "Carb : Fibre = 4 : 1"),
 *   the normalised scalar is:
 *       normalizedRatio = A / B  (first ÷ second = left ÷ right)
 *
 *   Examples
 *   ─────────────────────────────────────────────────
 *   1 : 1   →  1 / 1  = 1
 *   4 : 1   →  4 / 1  = 4
 *   10 : 1  →  10 / 1 = 10
 *   1 : 2   →  1 / 2  = 0.5
 *   ─────────────────────────────────────────────────
 *
 *   Range validity: min ≤ max means normalised(min) ≤ normalised(max).
 *   Example — Carb:Fibre min=1:1, max=4:1 → 1 ≤ 4  ✓  (valid)
 *             Omega-6:Omega-3 min=1:1, max=10:1 → 1 ≤ 10 ✓  (valid)
 *
 *   Display: stored value is A/B; shown back as  storedValue : 1.
 *   Pre-fill: minLeft = storedValue, min = "1"
 *             On re-save: normalizeDisplayedRatio(storedValue, 1) = storedValue / 1 = storedValue ✓
 *
 * Actual recipe validation:
 *   actual = numerator_total / denominator_total   (A / B direction)
 *   Valid when: goal_min ≤ actual ≤ goal_max
 */

/**
 * Convert a user-entered  first : second  ratio into the normalised decimal
 * that is stored in the database.
 *
 * @param first  - Left-hand side of the ratio (A).
 * @param second - Right-hand side of the ratio (B; must be > 0).
 * @returns  first / second, or null when second ≤ 0 (divide-by-zero guard).
 */
export function normalizeDisplayedRatio(first: number, second: number): number | null {
  if (second <= 0) return null; // guard: divide-by-zero or zero denominator
  return first / second;
}

/**
 * Format a stored normalised ratio back to a human-readable display string.
 * Stored value = A/B; canonical re-display form is "storedValue : 1".
 *
 * @param stored - The normalised decimal from the DB (goal_min / goal_max).
 * @returns A string like "4:1", or "—" when the value is null/undefined.
 */
export function formatStoredRatio(stored: number | null | undefined): string {
  if (stored == null) return '—';
  return `${stored}:1`;
}

/**
 * Validate that a ratio range is coherent: normalised min ≤ normalised max.
 *
 * @param minFirst   - Left side of the Min input  (A of min ratio).
 * @param minSecond  - Right side of the Min input (B of min ratio).
 * @param maxFirst   - Left side of the Max input  (A of max ratio).
 * @param maxSecond  - Right side of the Max input (B of max ratio).
 * @returns  true when the range is valid (normalised min ≤ normalised max).
 *           false when either second value is ≤ 0 (divide-by-zero guard).
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
