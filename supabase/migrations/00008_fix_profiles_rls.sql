-- ============================================================
-- Migration 00008: Fix profiles RLS so all authenticated users
--                  can resolve creator / approver names.
--
-- Problem:
--   The existing "Admin can read all profiles" policy means only
--   admins can look up other users' names.  Managers, dieticians,
--   and chefs see "—" in the "Approved By" / "Created By" columns
--   when the referenced user is not themselves.
--
-- Solution:
--   Create a SECURITY DEFINER function get_all_profiles() that
--   runs as the DB owner, bypassing RLS, and returns only the
--   non-sensitive columns (id, full_name, email, role).
--   The frontend calls supabase.rpc('get_all_profiles') instead
--   of querying the profiles table directly.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_all_profiles()
RETURNS TABLE (
  id        uuid,
  full_name text,
  email     text,
  role      app_role
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT id, full_name, email, role
  FROM public.profiles;
$$;

-- Allow every signed-in user to call it; block anonymous callers.
GRANT  EXECUTE ON FUNCTION public.get_all_profiles() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_all_profiles() FROM anon;
