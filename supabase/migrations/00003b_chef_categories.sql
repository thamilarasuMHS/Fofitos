-- Chef can view approved categories (read-only)
CREATE POLICY "Chef view approved categories"
  ON public.categories FOR SELECT
  USING (
    status = 'approved'
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'chef' AND p.status = 'active')
  );
