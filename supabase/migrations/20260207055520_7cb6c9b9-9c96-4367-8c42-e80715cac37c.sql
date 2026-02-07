-- Fix system_settings RLS policy for admin updates (pricing images, etc.)
-- The current policy has no WITH CHECK clause, which blocks INSERT/UPDATE

-- Drop and recreate the admin management policy with proper WITH CHECK
DROP POLICY IF EXISTS "Admins can manage system settings" ON public.system_settings;

CREATE POLICY "Admins can manage system settings"
ON public.system_settings
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));