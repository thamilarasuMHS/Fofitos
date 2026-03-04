CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  status category_status NOT NULL DEFAULT 'draft',
  submitted_at timestamptz,
  approved_by uuid REFERENCES public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_categories_status_approved ON public.categories(status, approved_at);
CREATE INDEX idx_categories_created_by ON public.categories(created_by);

CREATE TRIGGER categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.category_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  parameter_id uuid NOT NULL REFERENCES public.nutrition_parameters(id),
  goal_min numeric NOT NULL,
  goal_max numeric NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(category_id, parameter_id),
  CONSTRAINT goal_min_max CHECK (goal_min <= goal_max)
);

CREATE INDEX idx_category_goals_category ON public.category_goals(category_id);

CREATE TABLE public.category_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_category_components_category ON public.category_components(category_id);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_components ENABLE ROW LEVEL SECURITY;

-- Categories: Admin all; Manager own; Dietician approved only
CREATE POLICY "Admin all categories"
  ON public.categories FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.status = 'active'));

CREATE POLICY "Manager own categories"
  ON public.categories FOR ALL
  USING (
    created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.status = 'active')
  );

CREATE POLICY "Dietician view approved categories"
  ON public.categories FOR SELECT
  USING (
    status = 'approved'
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('dietician','manager') AND p.status = 'active')
  );

-- Goals and components follow category access
CREATE POLICY "Category goals by category access"
  ON public.category_goals FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.categories c WHERE c.id = category_id AND (
      c.created_by = auth.uid() OR
      (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin' OR
      (c.status = 'approved' AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('dietician','manager'))
    ))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.categories c WHERE c.id = category_id AND (c.created_by = auth.uid() OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'))
  );

CREATE POLICY "Category components by category access"
  ON public.category_components FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.categories c WHERE c.id = category_id AND (
      c.created_by = auth.uid() OR
      (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin' OR
      (c.status = 'approved' AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('dietician','manager'))
    ))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.categories c WHERE c.id = category_id AND (c.created_by = auth.uid() OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'))
  );
