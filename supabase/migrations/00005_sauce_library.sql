CREATE TABLE public.sauce_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  batch_total_g numeric NOT NULL,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_sauce_library_name ON public.sauce_library(name);

CREATE TRIGGER sauce_library_updated_at
  BEFORE UPDATE ON public.sauce_library
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.sauce_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sauce_id uuid NOT NULL REFERENCES public.sauce_library(id) ON DELETE CASCADE,
  ingredient_id uuid REFERENCES public.ingredient_database(id),
  custom_name text,
  quantity_g numeric NOT NULL,
  calories numeric NOT NULL,
  protein_g numeric NOT NULL,
  carbs_g numeric NOT NULL,
  fat_g numeric NOT NULL,
  fibre_g numeric NOT NULL,
  omega3_g numeric NOT NULL,
  omega6_g numeric NOT NULL,
  sodium_mg numeric NOT NULL,
  added_sugar_g numeric NOT NULL,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_sauce_ingredients_sauce ON public.sauce_ingredients(sauce_id);

ALTER TABLE public.sauce_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sauce_ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manager Dietician sauce_library full"
  ON public.sauce_library FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('manager','dietician','admin') AND p.status = 'active'));

CREATE POLICY "Manager Dietician sauce_ingredients full"
  ON public.sauce_ingredients FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('manager','dietician','admin') AND p.status = 'active'));
