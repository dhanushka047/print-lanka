-- Fix missing RLS policies and schema issues for self-hosted compatibility

-- 1. Add missing contact_config to public viewable settings
DROP POLICY IF EXISTS "Anyone can view contact config" ON public.system_settings;
CREATE POLICY "Anyone can view contact config"
ON public.system_settings
FOR SELECT
USING (key = 'contact_config');

-- 2. Enable realtime for shop_payment_slips 
ALTER PUBLICATION supabase_realtime ADD TABLE public.shop_payment_slips;

-- 3. Ensure weight_grams column exists (for self-hosted that may have missed migration)
ALTER TABLE public.order_items 
ADD COLUMN IF NOT EXISTS weight_grams numeric;

-- 4. Ensure tracking_number column exists on orders
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS tracking_number text;

-- 5. Ensure all required system_settings policies are present
-- Already have: pricing_config, delivery_config (from 20260123061946)
-- Already have: invoice_settings, pricing_images (from 20260203061959)
-- Already have: shop_shipping_config (from 20260129060845)
-- Now adding: contact_config (above)

-- 6. Add backup_settings to viewable settings (used by AdminBackup)
DROP POLICY IF EXISTS "Admins can view backup settings" ON public.system_settings;
CREATE POLICY "Admins can view backup settings"
ON public.system_settings
FOR SELECT
USING (key = 'backup_settings' AND is_admin_or_moderator(auth.uid()));