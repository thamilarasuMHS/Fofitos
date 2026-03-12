-- ============================================================
-- Migration 00009: SECURITY DEFINER RPCs for cascading
--                  nutrition updates to recipe_ingredients.
--
-- Problem:
--   Direct UPDATE on recipe_ingredients is blocked by RLS for
--   non-admin users when the category isn't approved or the
--   caller isn't the category creator.  The frontend cascade
--   loop silently returns 0 rows with no error.
--
-- Solution:
--   Two SECURITY DEFINER functions that run as the DB owner,
--   bypassing RLS.  The frontend calls these RPCs instead of
--   issuing direct table updates.
-- ============================================================

-- ── 1. Cascade by ingredient ────────────────────────────────
CREATE OR REPLACE FUNCTION public.cascade_update_recipe_ingredients_by_ingredient(
  p_ingredient_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ing  record;
  v_rows integer;
BEGIN
  SELECT calories_per_100g, protein_g_per_100g, carbs_g_per_100g,
         fat_g_per_100g, fibre_g_per_100g, omega3_g_per_100g,
         omega6_g_per_100g, sodium_mg_per_100g, added_sugar_g_per_100g
  INTO v_ing
  FROM public.ingredient_database
  WHERE id = p_ingredient_id;

  IF NOT FOUND THEN RETURN 0; END IF;

  UPDATE public.recipe_ingredients SET
    calories      = v_ing.calories_per_100g      * (quantity_g / 100.0),
    protein_g     = v_ing.protein_g_per_100g     * (quantity_g / 100.0),
    carbs_g       = v_ing.carbs_g_per_100g       * (quantity_g / 100.0),
    fat_g         = v_ing.fat_g_per_100g         * (quantity_g / 100.0),
    fibre_g       = v_ing.fibre_g_per_100g       * (quantity_g / 100.0),
    omega3_g      = v_ing.omega3_g_per_100g      * (quantity_g / 100.0),
    omega6_g      = v_ing.omega6_g_per_100g      * (quantity_g / 100.0),
    sodium_mg     = v_ing.sodium_mg_per_100g     * (quantity_g / 100.0),
    added_sugar_g = v_ing.added_sugar_g_per_100g * (quantity_g / 100.0),
    updated_at    = now()
  WHERE ingredient_id = p_ingredient_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

GRANT  EXECUTE ON FUNCTION public.cascade_update_recipe_ingredients_by_ingredient(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cascade_update_recipe_ingredients_by_ingredient(uuid) FROM anon;


-- ── 2. Cascade by sauce ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cascade_update_recipe_ingredients_by_sauce(
  p_sauce_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ing  record;
  v_rows integer;
BEGIN
  SELECT calories, protein_g, carbs_g, fat_g, fibre_g,
         omega3_g, omega6_g, sodium_mg, added_sugar_g
  INTO v_ing
  FROM public.sauce_ingredients
  WHERE sauce_id = p_sauce_id
  ORDER BY sort_order
  LIMIT 1;

  IF NOT FOUND THEN RETURN 0; END IF;

  UPDATE public.recipe_ingredients SET
    calories      = v_ing.calories      * (quantity_g / 100.0),
    protein_g     = v_ing.protein_g     * (quantity_g / 100.0),
    carbs_g       = v_ing.carbs_g       * (quantity_g / 100.0),
    fat_g         = v_ing.fat_g         * (quantity_g / 100.0),
    fibre_g       = v_ing.fibre_g       * (quantity_g / 100.0),
    omega3_g      = v_ing.omega3_g      * (quantity_g / 100.0),
    omega6_g      = v_ing.omega6_g      * (quantity_g / 100.0),
    sodium_mg     = v_ing.sodium_mg     * (quantity_g / 100.0),
    added_sugar_g = v_ing.added_sugar_g * (quantity_g / 100.0),
    updated_at    = now()
  WHERE sauce_id = p_sauce_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

GRANT  EXECUTE ON FUNCTION public.cascade_update_recipe_ingredients_by_sauce(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cascade_update_recipe_ingredients_by_sauce(uuid) FROM anon;
