-- Add is_active flag to nutrition_parameters.
-- All existing parameters default to active (true).
ALTER TABLE public.nutrition_parameters
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
