-- Bootstrap for plain PostgreSQL (non-Supabase)
-- Creates minimal auth schema so migrations can run.
-- When using Supabase (local/cloud), Supabase provides auth - do NOT run this.

CREATE SCHEMA IF NOT EXISTS auth;

-- Minimal auth.users for profiles FK and handle_new_user trigger
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- auth.uid() - reads from JWT claim (Supabase) or session var (direct pg)
-- For direct connections: SET app.user_id = 'uuid';
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
    nullif(current_setting('app.user_id', true), '')::uuid
  );
$$ LANGUAGE sql STABLE;
