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
 *   1 : 2.5 →  1 / 2.5 = 0.4
 *   ─────────────────────────────────────────────────
 *
 *   Range validity:
 *   A range  minA:minB  →  maxA:maxB  is valid when BOTH components are
 *   non-decreasing, i.e.  minA ≤ maxA  AND  minB ≤ maxB.
 *
 *   This handles all three supported patterns:
 *     • Left side increases  (Carb:Fibre  1:1 → 4:1)
 *     • Right side increases (Protein:Carb 1:1 → 1:2.5)
 *     • Both equal           (any 1:1 → 1:1 edge case)
 *   And correctly rejects reversed ranges like 4:1 → 1:1.
 *
 *   Storage: goal_min = Math.min(A/B of min, A/B of max)
 *            goal_max = Math.max(A/B of min, A/B of max)
 *   This always satisfies the DB constraint goal_min ≤ goal_max.
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
 *
 * Stored value = A/B (first ÷ second).
 * Re-display rules:
 *   stored ≥ 1  →  "stored : 1"      e.g. 4 → "4:1", 10 → "10:1"
 *   stored < 1  →  "1 : (1/stored)"  e.g. 0.4 → "1:2.5"
 *
 * This ensures Protein:Carb stored as 0.4 shows as "1:2.5" (user's original input),
 * while Carb:Fibre stored as 4 shows as "4:1".
 *
 * @param stored - The normalised decimal from the DB (goal_min or goal_max).
 * @returns A human-readable ratio string, or "—" when the value is null/undefined.
 */
export function formatStoredRatio(stored: number | null | undefined): string {
  if (stored == null) return '—';
  if (stored >= 1) return `${stored}:1`;
  // stored < 1: invert to "1:X" so the user sees their original entry style
  const inv = parseFloat((1 / stored).toFixed(6)); // toFixed(6) then parseFloat removes trailing zeros
  return `1:${inv}`;
}

/**
 * Resolve which stored value should be shown in the MIN column vs MAX column.
 *
 * Problem: when the right side of the ratio varies (e.g. Protein:Carb 1:1 → 1:2.5),
 * the A/B formula gives rawMin=1 and rawMax=0.4.  After Math.min/Math.max sorting:
 *   goal_min = 0.4  (user's MAX entry)
 *   goal_max = 1    (user's MIN entry)
 * — the scalar sort has inverted the user-intended labels.
 *
 * Detection: if goal_min < 1 AND goal_max ≥ 1, the pair was inverted during storage.
 * In that case, swap so the display MIN column reflects the user's original Min entry.
 *
 * Verification:
 *   Protein:Carb  goal_min=0.4, goal_max=1   → swapped  → displayMin=1(1:1), displayMax=0.4(1:2.5) ✓
 *   Carb:Fibre    goal_min=1,   goal_max=4   → normal   → displayMin=1(1:1), displayMax=4(4:1)     ✓
 *   Omega-6:Ω-3  goal_min=1,   goal_max=10  → normal   → displayMin=1(1:1), displayMax=10(10:1)   ✓
 *
 * @param goalMin - The stored goal_min scalar from the DB.
 * @param goalMax - The stored goal_max scalar from the DB.
 * @returns { displayMin, displayMax } — the scalars to use for the MIN and MAX columns.
 */
export function ratioDisplayOrder(
  goalMin: number | null | undefined,
  goalMax: number | null | undefined,
): { displayMin: number | null | undefined; displayMax: number | null | undefined } {
  if (goalMin != null && goalMax != null && goalMin < 1 && goalMax >= 1) {
    // Scalar sort inverted the user's labels — swap back for display
    return { displayMin: goalMax, displayMax: goalMin };
  }
  return { displayMin: goalMin, displayMax: goalMax };
}

/**
 * Validate that a ratio range is coherent.
 *
 * A range is valid when BOTH components are non-decreasing:
 *   minFirst ≤ maxFirst  AND  minSecond ≤ maxSecond
 *
 * This accepts all three patterns the app supports:
 *   • Left side increases  → Carb:Fibre   1:1 to 4:1   ✓
 *   • Right side increases → Protein:Carb 1:1 to 1:2.5 ✓
 *   • Omega-6:Omega-3      1:1 to 10:1                 ✓
 * And rejects reversed ranges:
 *   • 4:1 to 1:1  →  maxFirst(1) < minFirst(4)  ✗  invalid
 *
 * @param minFirst   - Left side of the Min input  (A of min ratio).
 * @param minSecond  - Right side of the Min input (B of min ratio; must be > 0).
 * @param maxFirst   - Left side of the Max input  (A of max ratio).
 * @param maxSecond  - Right side of the Max input (B of max ratio; must be > 0).
 * @returns  true when the range is valid.
 */
export function isRatioRangeValid(
  minFirst: number, minSecond: number,
  maxFirst: number, maxSecond: number,
): boolean {
  if (minSecond <= 0 || maxSecond <= 0) return false; // divide-by-zero guard
  if (minFirst < 0 || maxFirst < 0) return false;     // negative guard
  return minFirst <= maxFirst && minSecond <= maxSecond;
}
