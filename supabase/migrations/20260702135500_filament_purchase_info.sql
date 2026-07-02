ALTER TABLE public.filaments ADD COLUMN IF NOT EXISTS supplier TEXT;
ALTER TABLE public.filaments ADD COLUMN IF NOT EXISTS purchase_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
