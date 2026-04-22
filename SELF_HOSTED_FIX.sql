-- ============================================================
-- SELF-HOSTED VPS FIX: "Database error saving new user"
-- Run this ENTIRE script in your self-hosted Supabase SQL editor
-- ============================================================

-- 1. Ensure profiles has all needed columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT false;

-- 2. Relax NOT NULLs so trigger never fails on missing metadata
ALTER TABLE public.profiles ALTER COLUMN first_name SET DEFAULT '';
ALTER TABLE public.profiles ALTER COLUMN last_name  SET DEFAULT '';
ALTER TABLE public.profiles ALTER COLUMN phone      SET DEFAULT '';
ALTER TABLE public.profiles ALTER COLUMN address    SET DEFAULT '';
ALTER TABLE public.profiles ALTER COLUMN first_name DROP NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN last_name  DROP NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN phone      DROP NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN address    DROP NOT NULL;

-- 3. Recreate trigger function (safe / never blocks signup)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, first_name, last_name, phone, address, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.raw_user_meta_data->>'address', ''),
    NEW.email
  )
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- 4. CRITICAL: attach trigger to auth.users
--    (this is what's missing on VPS — Lovable's hosted runner cannot create
--    triggers on auth.users, so you MUST run this on your self-hosted DB)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 5. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- 6. Verify
SELECT trigger_name FROM information_schema.triggers
WHERE event_object_schema='auth' AND event_object_table='users';
