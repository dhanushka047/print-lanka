ALTER TABLE public.profiles ALTER COLUMN first_name SET DEFAULT '';
ALTER TABLE public.profiles ALTER COLUMN last_name SET DEFAULT '';
ALTER TABLE public.profiles ALTER COLUMN phone SET DEFAULT '';
ALTER TABLE public.profiles ALTER COLUMN first_name DROP NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN last_name DROP NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN phone DROP NOT NULL;

NOTIFY pgrst, 'reload schema';