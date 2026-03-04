-- Enums
CREATE TYPE app_role AS ENUM ('admin', 'manager', 'dietician', 'chef');
CREATE TYPE user_status AS ENUM ('pending_approval', 'active', 'deactivated', 'rejected');
CREATE TYPE param_unit AS ENUM ('g', 'mg', 'kcal', 'ratio');
CREATE TYPE param_type_enum AS ENUM ('absolute', 'ratio');
CREATE TYPE direction_enum AS ENUM ('higher_is_better', 'lower_is_better');
CREATE TYPE category_status AS ENUM ('draft', 'pending_approval', 'approved', 'rejected');
CREATE TYPE recipe_status AS ENUM ('draft', 'submitted', 'approved', 'changes_requested');
CREATE TYPE raw_cooked_enum AS ENUM ('raw', 'cooked');
CREATE TYPE snapshot_trigger AS ENUM ('recipe_save', 'goal_update');
CREATE TYPE deletion_status AS ENUM ('pending', 'approved', 'rejected');

-- Profiles (extends auth.users)
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  role app_role NOT NULL,
  status user_status NOT NULL DEFAULT 'pending_approval',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_active_at timestamptz
);

CREATE INDEX idx_profiles_role_status ON public.profiles(role, status);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Admin can read all profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "Admin can update any profile"
  ON public.profiles FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "Allow insert on signup"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Trigger: create profile on signup (handled by app or trigger)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'email', NEW.email),
    NEW.raw_user_meta_data->>'full_name',
    'dietician',
    'pending_approval'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
