import pg from 'pg';
const { Client } = pg;

const client = new Client({
  host: '13.234.115.104',
  port: 5432,
  database: 'Fofitos_Nutrition',
  user: 'postgres',
  password: '$erver2026',
  connectionTimeoutMillis: 15000,
  ssl: false,
});

const SQL = `
-- ============================================================
-- FOFITOS RECIPE NUTRITION — AWS PostgreSQL Migration
-- Replaces all Supabase-specific features with plain SQL
-- ============================================================

-- Enums
DO $$ BEGIN
  CREATE TYPE app_role AS ENUM ('admin', 'manager', 'dietician', 'chef');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('pending_approval', 'active', 'deactivated', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE param_unit AS ENUM ('g', 'mg', 'kcal', 'ratio');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE param_type_enum AS ENUM ('absolute', 'ratio');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE direction_enum AS ENUM ('higher_is_better', 'lower_is_better');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE category_status AS ENUM ('draft', 'pending_approval', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE recipe_status AS ENUM ('draft', 'submitted', 'approved', 'changes_requested');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE raw_cooked_enum AS ENUM ('raw', 'cooked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE snapshot_trigger AS ENUM ('recipe_save', 'goal_update');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE deletion_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Local users table (replaces Supabase auth.users) ─────────
CREATE TABLE IF NOT EXISTS public.users (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text        NOT NULL UNIQUE,
  password_hash text        NOT NULL,
  created_at    timestamptz DEFAULT now()
);

-- ── Shared updated_at trigger ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Profiles ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id           uuid        PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  email        text        NOT NULL,
  full_name    text,
  role         app_role    NOT NULL,
  status       user_status NOT NULL DEFAULT 'pending_approval',
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  last_active_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_profiles_role_status ON public.profiles(role, status);

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Nutrition Parameters ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nutrition_parameters (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text          NOT NULL UNIQUE,
  unit                  param_unit    NOT NULL,
  param_type            param_type_enum NOT NULL,
  numerator_param_id    uuid          REFERENCES public.nutrition_parameters(id),
  denominator_param_id  uuid          REFERENCES public.nutrition_parameters(id),
  direction             direction_enum NOT NULL,
  sort_order            int           DEFAULT 0,
  is_active             boolean       NOT NULL DEFAULT true,
  created_at            timestamptz   DEFAULT now(),
  updated_at            timestamptz   DEFAULT now(),
  CONSTRAINT ratio_has_numerator_denominator CHECK (
    (param_type = 'absolute' AND numerator_param_id IS NULL AND denominator_param_id IS NULL)
    OR (param_type = 'ratio' AND numerator_param_id IS NOT NULL AND denominator_param_id IS NOT NULL)
  )
);

DROP TRIGGER IF EXISTS nutrition_parameters_updated_at ON public.nutrition_parameters;
CREATE TRIGGER nutrition_parameters_updated_at
  BEFORE UPDATE ON public.nutrition_parameters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed default parameters (only if table is empty)
INSERT INTO public.nutrition_parameters (name, unit, param_type, direction, sort_order)
SELECT name, unit::param_unit, param_type::param_type_enum, direction::direction_enum, sort_order
FROM (VALUES
  ('Calories',     'kcal', 'absolute', 'lower_is_better',  1),
  ('Protein',      'g',    'absolute', 'higher_is_better', 2),
  ('Carbs',        'g',    'absolute', 'lower_is_better',  3),
  ('Fat',          'g',    'absolute', 'lower_is_better',  4),
  ('Fibre',        'g',    'absolute', 'higher_is_better', 5),
  ('Omega-3',      'g',    'absolute', 'higher_is_better', 6),
  ('Omega-6',      'g',    'absolute', 'lower_is_better',  7),
  ('Sodium',       'mg',   'absolute', 'lower_is_better',  8),
  ('Added Sugar',  'g',    'absolute', 'lower_is_better',  9)
) AS v(name, unit, param_type, direction, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.nutrition_parameters);

-- Ratio parameters (only if not yet inserted)
INSERT INTO public.nutrition_parameters (name, unit, param_type, numerator_param_id, denominator_param_id, direction, sort_order)
SELECT 'Protein:Carb Ratio', 'ratio', 'ratio', p.id, c.id, 'higher_is_better', 10
FROM public.nutrition_parameters p, public.nutrition_parameters c
WHERE p.name = 'Protein' AND c.name = 'Carbs'
  AND NOT EXISTS (SELECT 1 FROM public.nutrition_parameters WHERE name = 'Protein:Carb Ratio');

INSERT INTO public.nutrition_parameters (name, unit, param_type, numerator_param_id, denominator_param_id, direction, sort_order)
SELECT 'Carb:Fibre Ratio', 'ratio', 'ratio', c.id, f.id, 'lower_is_better', 11
FROM public.nutrition_parameters c, public.nutrition_parameters f
WHERE c.name = 'Carbs' AND f.name = 'Fibre'
  AND NOT EXISTS (SELECT 1 FROM public.nutrition_parameters WHERE name = 'Carb:Fibre Ratio');

INSERT INTO public.nutrition_parameters (name, unit, param_type, numerator_param_id, denominator_param_id, direction, sort_order)
SELECT 'Omega-6:Omega-3 Ratio', 'ratio', 'ratio', o6.id, o3.id, 'lower_is_better', 12
FROM public.nutrition_parameters o6, public.nutrition_parameters o3
WHERE o6.name = 'Omega-6' AND o3.name = 'Omega-3'
  AND NOT EXISTS (SELECT 1 FROM public.nutrition_parameters WHERE name = 'Omega-6:Omega-3 Ratio');

-- ── Component Library ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.component_library (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  sort_order int         DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

DROP TRIGGER IF EXISTS component_library_updated_at ON public.component_library;
CREATE TRIGGER component_library_updated_at
  BEFORE UPDATE ON public.component_library
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Categories ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.categories (
  id           uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text            NOT NULL,
  created_by   uuid            NOT NULL REFERENCES public.profiles(id),
  status       category_status NOT NULL DEFAULT 'draft',
  submitted_at timestamptz,
  approved_by  uuid            REFERENCES public.profiles(id),
  approved_at  timestamptz,
  created_at   timestamptz     DEFAULT now(),
  updated_at   timestamptz     DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_categories_status_approved ON public.categories(status, approved_at);
CREATE INDEX IF NOT EXISTS idx_categories_created_by      ON public.categories(created_by);

DROP TRIGGER IF EXISTS categories_updated_at ON public.categories;
CREATE TRIGGER categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Category Goals ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.category_goals (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id  uuid        NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  parameter_id uuid        NOT NULL REFERENCES public.nutrition_parameters(id),
  goal_min     numeric     NOT NULL,
  goal_max     numeric     NOT NULL,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  UNIQUE(category_id, parameter_id),
  CONSTRAINT goal_min_max CHECK (goal_min <= goal_max)
);

CREATE INDEX IF NOT EXISTS idx_category_goals_category ON public.category_goals(category_id);

-- ── Category Components ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.category_components (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid        NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  sort_order  int         DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_category_components_category ON public.category_components(category_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'category_components_category_name_unique'
      AND table_name = 'category_components'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.category_components
      ADD CONSTRAINT category_components_category_name_unique
      UNIQUE (category_id, name);
  END IF;
END $$;

-- ── Ingredient Database ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ingredient_database (
  id                     uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   text          NOT NULL,
  raw_cooked             raw_cooked_enum NOT NULL,
  calories_per_100g      numeric       NOT NULL,
  protein_g_per_100g     numeric       NOT NULL,
  carbs_g_per_100g       numeric       NOT NULL,
  fat_g_per_100g         numeric       NOT NULL,
  fibre_g_per_100g       numeric       NOT NULL,
  omega3_g_per_100g      numeric       NOT NULL,
  omega6_g_per_100g      numeric       NOT NULL,
  sodium_mg_per_100g     numeric       NOT NULL,
  added_sugar_g_per_100g numeric       NOT NULL,
  created_by             uuid          REFERENCES public.profiles(id),
  created_at             timestamptz   DEFAULT now(),
  updated_at             timestamptz   DEFAULT now(),
  deleted_at             timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ingredient_database_name_raw_cooked
  ON public.ingredient_database(name, raw_cooked) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ingredient_database_name    ON public.ingredient_database(name);
CREATE INDEX IF NOT EXISTS idx_ingredient_database_deleted ON public.ingredient_database(deleted_at);

DROP TRIGGER IF EXISTS ingredient_database_updated_at ON public.ingredient_database;
CREATE TRIGGER ingredient_database_updated_at
  BEFORE UPDATE ON public.ingredient_database
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.ingredient_edit_history (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id uuid        NOT NULL REFERENCES public.ingredient_database(id),
  edited_by     uuid        NOT NULL REFERENCES public.profiles(id),
  field_name    text        NOT NULL,
  old_value     numeric,
  new_value     numeric,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingredient_edit_history_ingredient ON public.ingredient_edit_history(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_ingredient_edit_history_created    ON public.ingredient_edit_history(created_at);

-- ── Sauce Library ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sauce_library (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,
  batch_total_g numeric     NOT NULL,
  created_by    uuid        REFERENCES public.profiles(id),
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sauce_library_name ON public.sauce_library(name);

DROP TRIGGER IF EXISTS sauce_library_updated_at ON public.sauce_library;
CREATE TRIGGER sauce_library_updated_at
  BEFORE UPDATE ON public.sauce_library
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.sauce_ingredients (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sauce_id      uuid        NOT NULL REFERENCES public.sauce_library(id) ON DELETE CASCADE,
  ingredient_id uuid        REFERENCES public.ingredient_database(id),
  custom_name   text,
  quantity_g    numeric     NOT NULL,
  calories      numeric     NOT NULL,
  protein_g     numeric     NOT NULL,
  carbs_g       numeric     NOT NULL,
  fat_g         numeric     NOT NULL,
  fibre_g       numeric     NOT NULL,
  omega3_g      numeric     NOT NULL,
  omega6_g      numeric     NOT NULL,
  sodium_mg     numeric     NOT NULL,
  added_sugar_g numeric     NOT NULL,
  sort_order    int         DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sauce_ingredients_sauce ON public.sauce_ingredients(sauce_id);

-- ── Recipes ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recipes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid        NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  name        text        NOT NULL,
  flavour_tags text[]     DEFAULT '{}',
  created_by  uuid        REFERENCES public.profiles(id),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  deleted_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_recipes_category_name ON public.recipes(category_id, name);
CREATE INDEX IF NOT EXISTS idx_recipes_deleted        ON public.recipes(deleted_at) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS recipes_updated_at ON public.recipes;
CREATE TRIGGER recipes_updated_at
  BEFORE UPDATE ON public.recipes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Recipe Versions ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recipe_versions (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id        uuid          NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  version_number   int           NOT NULL,
  parent_version_id uuid         REFERENCES public.recipe_versions(id),
  status           recipe_status NOT NULL DEFAULT 'draft',
  locked           boolean       NOT NULL DEFAULT false,
  submitted_at     timestamptz,
  approved_by      uuid          REFERENCES public.profiles(id),
  approved_at      timestamptz,
  reviewer_notes   text,
  created_by       uuid          REFERENCES public.profiles(id),
  created_at       timestamptz   DEFAULT now(),
  updated_at       timestamptz   DEFAULT now(),
  UNIQUE(recipe_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_recipe_versions_recipe   ON public.recipe_versions(recipe_id, version_number);
CREATE INDEX IF NOT EXISTS idx_recipe_versions_status   ON public.recipe_versions(status);
CREATE INDEX IF NOT EXISTS idx_recipe_versions_approved ON public.recipe_versions(approved_at);

DROP TRIGGER IF EXISTS recipe_versions_updated_at ON public.recipe_versions;
CREATE TRIGGER recipe_versions_updated_at
  BEFORE UPDATE ON public.recipe_versions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Recipe Ingredients ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recipe_ingredients (
  id                    uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_version_id     uuid            NOT NULL REFERENCES public.recipe_versions(id) ON DELETE CASCADE,
  category_component_id uuid            NOT NULL REFERENCES public.category_components(id),
  ingredient_id         uuid            REFERENCES public.ingredient_database(id),
  sauce_id              uuid            REFERENCES public.sauce_library(id),
  custom_name           text,
  quantity_g            numeric         NOT NULL CHECK (quantity_g > 0),
  raw_cooked            raw_cooked_enum NOT NULL,
  calories              numeric,
  protein_g             numeric,
  carbs_g               numeric,
  fat_g                 numeric,
  fibre_g               numeric,
  omega3_g              numeric,
  omega6_g              numeric,
  sodium_mg             numeric,
  added_sugar_g         numeric,
  sort_order            int             DEFAULT 0,
  created_at            timestamptz     DEFAULT now(),
  updated_at            timestamptz     DEFAULT now(),
  CONSTRAINT ingredient_or_sauce_or_custom CHECK (
    ingredient_id IS NOT NULL OR sauce_id IS NOT NULL OR (custom_name IS NOT NULL AND custom_name != '')
  )
);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_version ON public.recipe_ingredients(recipe_version_id);

DROP TRIGGER IF EXISTS recipe_ingredients_updated_at ON public.recipe_ingredients;
CREATE TRIGGER recipe_ingredients_updated_at
  BEFORE UPDATE ON public.recipe_ingredients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Score Snapshots ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.score_snapshots (
  id                uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_version_id uuid             NOT NULL REFERENCES public.recipe_versions(id) ON DELETE CASCADE,
  overall_score     numeric          NOT NULL,
  parameter_scores  jsonb            NOT NULL,
  goal_snapshot     jsonb            NOT NULL,
  triggered_by      snapshot_trigger NOT NULL,
  actor_id          uuid             REFERENCES public.profiles(id),
  created_at        timestamptz      DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_score_snapshots_version ON public.score_snapshots(recipe_version_id);
CREATE INDEX IF NOT EXISTS idx_score_snapshots_created ON public.score_snapshots(created_at);

-- ── Activity Logs ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid        REFERENCES public.profiles(id),
  action      text        NOT NULL,
  entity_type text        NOT NULL,
  entity_id   uuid,
  metadata    jsonb,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_entity  ON public.activity_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON public.activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_actor   ON public.activity_logs(actor_id);

-- ── Deletion Requests ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.deletion_requests (
  id           uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id    uuid            NOT NULL REFERENCES public.recipes(id),
  requested_by uuid            NOT NULL REFERENCES public.profiles(id),
  status       deletion_status NOT NULL DEFAULT 'pending',
  reviewed_by  uuid            REFERENCES public.profiles(id),
  reviewed_at  timestamptz,
  created_at   timestamptz     DEFAULT now(),
  updated_at   timestamptz     DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deletion_requests_status ON public.deletion_requests(status);

DROP TRIGGER IF EXISTS deletion_requests_updated_at ON public.deletion_requests;
CREATE TRIGGER deletion_requests_updated_at
  BEFORE UPDATE ON public.deletion_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RPC: get_all_profiles ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_all_profiles()
RETURNS TABLE (id uuid, full_name text, email text, role app_role)
LANGUAGE sql STABLE AS $$
  SELECT id, full_name, email, role FROM public.profiles;
$$;

-- ── RPC: cascade_update_recipe_ingredients_by_ingredient ──────
CREATE OR REPLACE FUNCTION public.cascade_update_recipe_ingredients_by_ingredient(p_ingredient_id uuid)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  v_ing  record;
  v_rows integer;
BEGIN
  SELECT calories_per_100g, protein_g_per_100g, carbs_g_per_100g,
         fat_g_per_100g, fibre_g_per_100g, omega3_g_per_100g,
         omega6_g_per_100g, sodium_mg_per_100g, added_sugar_g_per_100g
  INTO v_ing FROM public.ingredient_database WHERE id = p_ingredient_id;
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

-- ── RPC: cascade_update_recipe_ingredients_by_sauce ───────────
CREATE OR REPLACE FUNCTION public.cascade_update_recipe_ingredients_by_sauce(p_sauce_id uuid)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  v_ing  record;
  v_rows integer;
BEGIN
  SELECT calories, protein_g, carbs_g, fat_g, fibre_g,
         omega3_g, omega6_g, sodium_mg, added_sugar_g
  INTO v_ing FROM public.sauce_ingredients
  WHERE sauce_id = p_sauce_id ORDER BY sort_order LIMIT 1;
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

-- ── View: recipe_latest_versions ──────────────────────────────
CREATE OR REPLACE VIEW public.recipe_latest_versions AS
SELECT DISTINCT ON (rv.recipe_id)
  rv.id, rv.recipe_id, rv.version_number, rv.status,
  rv.submitted_at, rv.approved_at, rv.created_at, rv.updated_at
FROM public.recipe_versions rv
WHERE rv.status != 'draft'
ORDER BY rv.recipe_id, rv.version_number DESC;
`;

async function run() {
  try {
    await client.connect();
    console.log('Connected to AWS PostgreSQL — Fofitos_Nutrition');
    await client.query(SQL);
    console.log('Schema migration completed successfully.');
    console.log('\nTables created:');
    const { rows } = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    rows.forEach(r => console.log(' ✓', r.table_name));
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
