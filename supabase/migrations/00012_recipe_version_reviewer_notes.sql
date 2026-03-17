-- Add reviewer_notes column to recipe_versions
-- Stores optional feedback from reviewer when requesting changes.
-- NULL for approved versions or when no notes were provided.

ALTER TABLE public.recipe_versions
  ADD COLUMN IF NOT EXISTS reviewer_notes text;
