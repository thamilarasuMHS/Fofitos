-- Fix duplicate category_components rows — FK-safe version.
-- Migration 00011 could not delete duplicates because recipe_ingredients
-- references category_component_id with a RESTRICT FK (no CASCADE).
--
-- Strategy:
--   1. Identify the "keeper" component per (category_id, name) — oldest row.
--   2. Re-point any recipe_ingredients that reference a duplicate component
--      to the keeper, so ALL ingredient data is preserved.
--   3. Delete the now-safe duplicate component rows.
--   4. Add the UNIQUE constraint (idempotent — skips if already present).

-- Step 1 + 2: Reassign recipe_ingredients from duplicate component IDs to keeper
WITH keepers AS (
  SELECT DISTINCT ON (category_id, name)
    id            AS keeper_id,
    category_id,
    name
  FROM public.category_components
  ORDER BY category_id, name, created_at ASC
),
duplicates AS (
  SELECT
    cc.id          AS dup_id,
    k.keeper_id
  FROM public.category_components cc
  JOIN keepers k
    ON  k.category_id = cc.category_id
    AND k.name        = cc.name
  WHERE cc.id <> k.keeper_id
)
UPDATE public.recipe_ingredients ri
SET    category_component_id = d.keeper_id
FROM   duplicates d
WHERE  ri.category_component_id = d.dup_id;

-- Step 3: Delete duplicate component rows (FK is now clear)
DELETE FROM public.category_components
WHERE id NOT IN (
  SELECT DISTINCT ON (category_id, name) id
  FROM public.category_components
  ORDER BY category_id, name, created_at ASC
);

-- Step 4: Add UNIQUE constraint (skip if already present from 00011)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   information_schema.table_constraints
    WHERE  constraint_name = 'category_components_category_name_unique'
      AND  table_name      = 'category_components'
      AND  table_schema    = 'public'
  ) THEN
    ALTER TABLE public.category_components
      ADD CONSTRAINT category_components_category_name_unique
      UNIQUE (category_id, name);
  END IF;
END $$;
