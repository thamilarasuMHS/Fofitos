CREATE TABLE public.ingredient_database (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  raw_cooked raw_cooked_enum NOT NULL,
  calories_per_100g numeric NOT NULL,
  protein_g_per_100g numeric NOT NULL,
  carbs_g_per_100g numeric NOT NULL,
  fat_g_per_100g numeric NOT NULL,
  fibre_g_per_100g numeric NOT NULL,
  omega3_g_per_100g numeric NOT NULL,
  omega6_g_per_100g numeric NOT NULL,
  sodium_mg_per_100g numeric NOT NULL,
  added_sugar_g_per_100g numeric NOT NULL,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX idx_ingredient_database_name_raw_cooked ON public.ingredient_database(name, raw_cooked) WHERE deleted_at IS NULL;
CREATE INDEX idx_ingredient_database_name ON public.ingredient_database(name);
CREATE INDEX idx_ingredient_database_deleted ON public.ingredient_database(deleted_at);

CREATE TRIGGER ingredient_database_updated_at
  BEFORE UPDATE ON public.ingredient_database
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.ingredient_edit_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id uuid NOT NULL REFERENCES public.ingredient_database(id),
  edited_by uuid NOT NULL REFERENCES public.profiles(id),
  field_name text NOT NULL,
  old_value numeric,
  new_value numeric,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_ingredient_edit_history_ingredient ON public.ingredient_edit_history(ingredient_id);
CREATE INDEX idx_ingredient_edit_history_created ON public.ingredient_edit_history(created_at);

ALTER TABLE public.ingredient_database ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredient_edit_history ENABLE ROW LEVEL SECURITY;

-- Admin: full; Manager: select + update; Dietician: select + insert; Chef: no access
CREATE POLICY "Admin full ingredient_database"
  ON public.ingredient_database FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.status = 'active'));

CREATE POLICY "Manager select update ingredient_database"
  ON public.ingredient_database FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('manager','dietician') AND p.status = 'active'));

CREATE POLICY "Manager update ingredient_database"
  ON public.ingredient_database FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.status = 'active'));

CREATE POLICY "Dietician Manager insert ingredient_database"
  ON public.ingredient_database FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('dietician','manager') AND p.status = 'active'));

CREATE POLICY "Edit history read by ingredient access"
  ON public.ingredient_edit_history FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','manager') AND p.status = 'active'));

CREATE POLICY "Edit history insert by app"
  ON public.ingredient_edit_history FOR INSERT
  WITH CHECK (auth.uid() = edited_by);
