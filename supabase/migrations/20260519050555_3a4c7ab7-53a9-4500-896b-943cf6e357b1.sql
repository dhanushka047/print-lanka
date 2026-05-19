ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS admin_discount_value numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS admin_discount_type text NOT NULL DEFAULT 'amount' CHECK (admin_discount_type IN ('amount','percentage'));