-- Create printers table
CREATE TABLE IF NOT EXISTS public.printers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active', -- active, maintenance, inactive
    monthly_premium NUMERIC NOT NULL DEFAULT 0,
    terms_count INTEGER NOT NULL DEFAULT 0,
    hourly_cost NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for printers
ALTER TABLE public.printers ENABLE ROW LEVEL SECURITY;

-- Create policy for printers
CREATE POLICY "Anyone can view printers" ON public.printers
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Admins can manage printers" ON public.printers
    FOR ALL TO authenticated
    USING (public.is_admin_or_moderator(auth.uid()))
    WITH CHECK (public.is_admin_or_moderator(auth.uid()));

-- Create filaments table
CREATE TABLE IF NOT EXISTS public.filaments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    material TEXT NOT NULL, -- pla, petg, abs
    color TEXT NOT NULL,
    brand TEXT,
    cost NUMERIC NOT NULL DEFAULT 0,
    weight_total NUMERIC NOT NULL DEFAULT 1000,
    weight_remaining NUMERIC NOT NULL DEFAULT 1000,
    low_threshold NUMERIC NOT NULL DEFAULT 200,
    is_over BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for filaments
ALTER TABLE public.filaments ENABLE ROW LEVEL SECURITY;

-- Create policy for filaments
CREATE POLICY "Anyone can view filaments" ON public.filaments
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Admins can manage filaments" ON public.filaments
    FOR ALL TO authenticated
    USING (public.is_admin_or_moderator(auth.uid()))
    WITH CHECK (public.is_admin_or_moderator(auth.uid()));

-- Create filament_usages table
CREATE TABLE IF NOT EXISTS public.filament_usages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filament_id UUID REFERENCES public.filaments(id) ON DELETE CASCADE,
    order_item_id UUID REFERENCES public.order_items(id) ON DELETE SET NULL,
    printer_id UUID REFERENCES public.printers(id) ON DELETE SET NULL,
    weight_used NUMERIC NOT NULL,
    print_hours NUMERIC NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for filament_usages
ALTER TABLE public.filament_usages ENABLE ROW LEVEL SECURITY;

-- Create policy for filament_usages
CREATE POLICY "Anyone can view filament_usages" ON public.filament_usages
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Admins can manage filament_usages" ON public.filament_usages
    FOR ALL TO authenticated
    USING (public.is_admin_or_moderator(auth.uid()))
    WITH CHECK (public.is_admin_or_moderator(auth.uid()));
