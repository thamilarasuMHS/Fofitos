-- Fix duplicate category_components rows
-- Root cause: CategoryEdit delete had no error check, so silent failures left
-- old rows intact while insert added a new full set each time.

-- Step 1: Remove duplicates — keep the earliest row per (category_id, name)
DELETE FROM public.category_components
WHERE id NOT IN (
  SELECT DISTINCT ON (category_id, name) id
  FROM public.category_components
  ORDER BY category_id, name, created_at ASC
);

-- Step 2: Add unique constraint to prevent future duplicates
ALTER TABLE public.category_components
  ADD CONSTRAINT category_components_category_name_unique
  UNIQUE (category_id, name);
