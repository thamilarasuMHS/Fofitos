import type { DirectionEnum } from '@/types/database';

export interface NutritionTotals {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fibre_g: number;
  omega3_g: number;
  omega6_g: number;
  sodium_mg: number;
  added_sugar_g: number;
}

export interface IngredientRow {
  quantity_g: number;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fibre_g: number | null;
  omega3_g: number | null;
  omega6_g: number | null;
  sodium_mg: number | null;
  added_sugar_g: number | null;
}

export function computeTotals(ingredients: IngredientRow[]): NutritionTotals {
  const totals: NutritionTotals = {
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    fibre_g: 0,
    omega3_g: 0,
    omega6_g: 0,
    sodium_mg: 0,
    added_sugar_g: 0,
  };
  for (const row of ingredients) {
    totals.calories += Number(row.calories) || 0;
    totals.protein_g += Number(row.protein_g) || 0;
    totals.carbs_g += Number(row.carbs_g) || 0;
    totals.fat_g += Number(row.fat_g) || 0;
    totals.fibre_g += Number(row.fibre_g) || 0;
    totals.omega3_g += Number(row.omega3_g) || 0;
    totals.omega6_g += Number(row.omega6_g) || 0;
    totals.sodium_mg += Number(row.sodium_mg) || 0;
    totals.added_sugar_g += Number(row.added_sugar_g) || 0;
  }
  return totals;
}

export function computeRatios(
  totals: NutritionTotals,
  ratioDefs: { numerator: keyof NutritionTotals; denominator: keyof NutritionTotals }[]
): Record<string, number> {
  const ratios: Record<string, number> = {};
  for (const def of ratioDefs) {
    const den = totals[def.denominator];
    if (den == null || den === 0) {
      ratios[`${def.numerator}:${def.denominator}`] = 0;
      continue;
    }
    ratios[`${def.numerator}:${def.denominator}`] = totals[def.numerator] / den;
  }
  return ratios;
}

/**
 * Deviation % = |(boundary - actual) / boundary| × 100
 * Score deduction = 5 × deviation %
 * Score = max(0, 100 - deduction)
 */
export function scoreParameter(
  actual: number,
  goalMin: number,
  goalMax: number,
  direction: DirectionEnum
): number {
  if (actual >= goalMin && actual <= goalMax) return 100;
  if (direction === 'higher_is_better') {
    if (actual > goalMax) return 100;
    const boundary = goalMin;
    const deviationPct = Math.abs((boundary - actual) / boundary) * 100;
    return Math.max(0, 100 - deviationPct * 5);
  } else {
    if (actual < goalMin) return 100;
    const boundary = goalMax;
    const deviationPct = Math.abs((boundary - actual) / boundary) * 100;
    return Math.max(0, 100 - deviationPct * 5);
  }
}

export function getScoreColor(score: number): 'green' | 'orange' | 'red' {
  if (score === 100) return 'green';
  if (score >= 50) return 'orange';
  return 'red';
}

export function overallScore(parameterScores: number[]): number {
  if (parameterScores.length === 0) return 0;
  const sum = parameterScores.reduce((a, b) => a + b, 0);
  return sum / parameterScores.length;
}
