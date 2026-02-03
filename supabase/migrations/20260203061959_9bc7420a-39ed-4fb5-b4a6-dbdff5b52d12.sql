-- Add missing weight_grams column to order_items table
ALTER TABLE public.order_items 
ADD COLUMN IF NOT EXISTS weight_grams numeric;

-- Drop and recreate invoice settings policy (in case it doesn't exist)
DROP POLICY IF EXISTS "Anyone can view invoice settings" ON public.system_settings;

CREATE POLICY "Anyone can view invoice settings"
ON public.system_settings
FOR SELECT
USING (key IN ('invoice_settings', 'pricing_images'));