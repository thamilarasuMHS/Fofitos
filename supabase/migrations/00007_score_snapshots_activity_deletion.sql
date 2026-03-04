CREATE TABLE public.score_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_version_id uuid NOT NULL REFERENCES public.recipe_versions(id) ON DELETE CASCADE,
  overall_score numeric NOT NULL,
  parameter_scores jsonb NOT NULL,
  goal_snapshot jsonb NOT NULL,
  triggered_by snapshot_trigger NOT NULL,
  actor_id uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_score_snapshots_version ON public.score_snapshots(recipe_version_id);
CREATE INDEX idx_score_snapshots_created ON public.score_snapshots(created_at);

CREATE TABLE public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_activity_logs_entity ON public.activity_logs(entity_type, entity_id);
CREATE INDEX idx_activity_logs_created ON public.activity_logs(created_at DESC);
CREATE INDEX idx_activity_logs_actor ON public.activity_logs(actor_id);

CREATE TABLE public.deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES public.recipes(id),
  requested_by uuid NOT NULL REFERENCES public.profiles(id),
  status deletion_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_deletion_requests_status ON public.deletion_requests(status);
CREATE TRIGGER deletion_requests_updated_at
  BEFORE UPDATE ON public.deletion_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.score_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deletion_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Score snapshots with recipe access"
  ON public.score_snapshots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.recipe_versions rv
      JOIN public.recipes r ON r.id = rv.recipe_id
      JOIN public.categories c ON c.id = r.category_id
      WHERE rv.id = recipe_version_id
      AND ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin' OR c.created_by = auth.uid() OR c.status = 'approved')
    )
  );

CREATE POLICY "Score snapshots insert"
  ON public.score_snapshots FOR INSERT
  WITH CHECK (auth.uid() = actor_id OR actor_id IS NULL);

CREATE POLICY "Activity logs admin all"
  ON public.activity_logs FOR SELECT
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Activity logs manager by category"
  ON public.activity_logs FOR SELECT
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'manager'
    AND (metadata->>'category_id' IS NOT NULL AND (metadata->>'category_id')::uuid IN (SELECT id FROM public.categories WHERE created_by = auth.uid()))
    OR entity_type IN ('recipe','recipe_version') AND entity_id IN (SELECT r.id FROM public.recipes r JOIN public.categories c ON c.id = r.category_id WHERE c.created_by = auth.uid())
  );

CREATE POLICY "Activity logs dietician own"
  ON public.activity_logs FOR SELECT
  USING (actor_id = auth.uid());

CREATE POLICY "Activity logs insert"
  ON public.activity_logs FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Deletion requests admin full"
  ON public.deletion_requests FOR ALL
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Deletion requests manager own"
  ON public.deletion_requests FOR SELECT
  USING (requested_by = auth.uid());

CREATE POLICY "Deletion requests manager insert"
  ON public.deletion_requests FOR INSERT
  WITH CHECK (requested_by = auth.uid());
