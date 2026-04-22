-- ============================================================
-- SELF-HOSTED VPS FIX: "Database error saving new user"
-- Run this in your self-hosted Supabase SQL editor
-- ============================================================

-- 1. Ensure profiles table has all required columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT false;

-- Make address nullable-safe (trigger passes '' default)
ALTER TABLE public.profiles ALTER COLUMN address DROP NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN address SET DEFAULT '';

-- 2. Recreate the trigger function (matches current schema)
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
  -- Don't block signup if profile insert fails
  RAISE WARNING 'handle_new_user failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- 3. Attach trigger to auth.users (THIS IS USUALLY MISSING ON SELF-HOSTED)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
