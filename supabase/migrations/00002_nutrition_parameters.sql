CREATE TABLE public.nutrition_parameters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  unit param_unit NOT NULL,
  param_type param_type_enum NOT NULL,
  numerator_param_id uuid REFERENCES public.nutrition_parameters(id),
  denominator_param_id uuid REFERENCES public.nutrition_parameters(id),
  direction direction_enum NOT NULL,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT ratio_has_numerator_denominator CHECK (
    (param_type = 'absolute' AND numerator_param_id IS NULL AND denominator_param_id IS NULL)
    OR (param_type = 'ratio' AND numerator_param_id IS NOT NULL AND denominator_param_id IS NOT NULL)
  )
);

CREATE TRIGGER nutrition_parameters_updated_at
  BEFORE UPDATE ON public.nutrition_parameters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.nutrition_parameters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin only nutrition_parameters"
  ON public.nutrition_parameters FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.status = 'active')
  );

-- Seed default parameters (Section J)
INSERT INTO public.nutrition_parameters (name, unit, param_type, direction, sort_order) VALUES
  ('Calories', 'kcal', 'absolute', 'lower_is_better', 1),
  ('Protein', 'g', 'absolute', 'higher_is_better', 2),
  ('Carbs', 'g', 'absolute', 'lower_is_better', 3),
  ('Fat', 'g', 'absolute', 'lower_is_better', 4),
  ('Fibre', 'g', 'absolute', 'higher_is_better', 5),
  ('Omega-3', 'g', 'absolute', 'higher_is_better', 6),
  ('Omega-6', 'g', 'absolute', 'lower_is_better', 7),
  ('Sodium', 'mg', 'absolute', 'lower_is_better', 8),
  ('Added Sugar', 'g', 'absolute', 'lower_is_better', 9);

-- Ratios (insert after absolutes exist)
INSERT INTO public.nutrition_parameters (name, unit, param_type, numerator_param_id, denominator_param_id, direction, sort_order)
SELECT 'Protein:Carb Ratio', 'ratio', 'ratio', p.id, c.id, 'higher_is_better', 10
FROM public.nutrition_parameters p, public.nutrition_parameters c WHERE p.name = 'Protein' AND c.name = 'Carbs';

INSERT INTO public.nutrition_parameters (name, unit, param_type, numerator_param_id, denominator_param_id, direction, sort_order)
SELECT 'Carb:Fibre Ratio', 'ratio', 'ratio', c.id, f.id, 'lower_is_better', 11
FROM public.nutrition_parameters c, public.nutrition_parameters f WHERE c.name = 'Carbs' AND f.name = 'Fibre';

INSERT INTO public.nutrition_parameters (name, unit, param_type, numerator_param_id, denominator_param_id, direction, sort_order)
SELECT 'Omega-6:Omega-3 Ratio', 'ratio', 'ratio', o6.id, o3.id, 'lower_is_better', 12
FROM public.nutrition_parameters o6, public.nutrition_parameters o3 WHERE o6.name = 'Omega-6' AND o3.name = 'Omega-3';
