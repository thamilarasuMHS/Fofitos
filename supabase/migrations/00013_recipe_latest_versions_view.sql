-- Returns the single highest non-draft version for each recipe
CREATE OR REPLACE VIEW recipe_latest_versions AS
SELECT DISTINCT ON (rv.recipe_id)
  rv.id,
  rv.recipe_id,
  rv.version_number,
  rv.status,
  rv.submitted_at,
  rv.approved_at,
  rv.created_at,
  rv.updated_at
FROM recipe_versions rv
WHERE rv.status != 'draft'
ORDER BY rv.recipe_id, rv.version_number DESC;
