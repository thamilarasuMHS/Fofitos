CREATE TABLE public.recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  name text NOT NULL,
  flavour_tags text[] DEFAULT '{}',
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX idx_recipes_category_name ON public.recipes(category_id, name);
CREATE INDEX idx_recipes_deleted ON public.recipes(deleted_at) WHERE deleted_at IS NULL;

CREATE TRIGGER recipes_updated_at
  BEFORE UPDATE ON public.recipes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.recipe_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  version_number int NOT NULL,
  parent_version_id uuid REFERENCES public.recipe_versions(id),
  status recipe_status NOT NULL DEFAULT 'draft',
  locked boolean NOT NULL DEFAULT false,
  submitted_at timestamptz,
  approved_by uuid REFERENCES public.profiles(id),
  approved_at timestamptz,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(recipe_id, version_number)
);

CREATE INDEX idx_recipe_versions_recipe ON public.recipe_versions(recipe_id, version_number);
CREATE INDEX idx_recipe_versions_status ON public.recipe_versions(status);
CREATE INDEX idx_recipe_versions_approved ON public.recipe_versions(approved_at);

CREATE TRIGGER recipe_versions_updated_at
  BEFORE UPDATE ON public.recipe_versions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.recipe_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_version_id uuid NOT NULL REFERENCES public.recipe_versions(id) ON DELETE CASCADE,
  category_component_id uuid NOT NULL REFERENCES public.category_components(id),
  ingredient_id uuid REFERENCES public.ingredient_database(id),
  sauce_id uuid REFERENCES public.sauce_library(id),
  custom_name text,
  quantity_g numeric NOT NULL CHECK (quantity_g > 0),
  raw_cooked raw_cooked_enum NOT NULL,
  calories numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  fibre_g numeric,
  omega3_g numeric,
  omega6_g numeric,
  sodium_mg numeric,
  added_sugar_g numeric,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT ingredient_or_sauce_or_custom CHECK (
    ingredient_id IS NOT NULL OR sauce_id IS NOT NULL OR (custom_name IS NOT NULL AND custom_name != '')
  )
);

CREATE INDEX idx_recipe_ingredients_version ON public.recipe_ingredients(recipe_version_id);

CREATE TRIGGER recipe_ingredients_updated_at
  BEFORE UPDATE ON public.recipe_ingredients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS: recipes by category visibility
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recipes by category access"
  ON public.recipes FOR ALL
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR EXISTS (SELECT 1 FROM public.categories c WHERE c.id = category_id AND c.created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM public.categories c WHERE c.id = category_id AND c.status = 'approved')
  )
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR EXISTS (SELECT 1 FROM public.categories c WHERE c.id = category_id AND (c.created_by = auth.uid() OR c.status = 'approved'))
  );

CREATE POLICY "Recipe versions by recipe access"
  ON public.recipe_versions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.recipes r
      JOIN public.categories c ON c.id = r.category_id
      WHERE r.id = recipe_id
      AND (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
        OR c.created_by = auth.uid()
        OR (c.status = 'approved' AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('manager','dietician'))
        OR (c.status = 'approved' AND status = 'approved' AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'chef')
      )
    )
  );

CREATE POLICY "Recipe ingredients by version access"
  ON public.recipe_ingredients FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.recipe_versions rv JOIN public.recipes r ON r.id = rv.recipe_id JOIN public.categories c ON c.id = r.category_id
      WHERE rv.id = recipe_version_id AND (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
        OR c.created_by = auth.uid()
        OR (c.status = 'approved')
      )
    )
  );