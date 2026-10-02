-- Retail Module: Meta CAPI and Dynamic Catalog Feed Foundation

BEGIN;

-- 1. Meta CAPI Configuration
CREATE TABLE IF NOT EXISTS public.meta_capi_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    pixel_id TEXT NOT NULL,
    access_token TEXT NOT NULL,
    test_event_code TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id)
);

ALTER TABLE public.meta_capi_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own organization's CAPI config"
    ON public.meta_capi_config
    FOR ALL
    TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    ))
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    ));

-- 2. Retail Products (For Dynamic Catalog Feed)
CREATE TABLE IF NOT EXISTS public.retail_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    sku TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    availability TEXT DEFAULT 'in stock',
    condition TEXT DEFAULT 'new',
    price NUMERIC(10, 2) NOT NULL,
    currency TEXT DEFAULT 'INR',
    link TEXT NOT NULL,
    image_link TEXT NOT NULL,
    brand TEXT,
    inventory_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, sku)
);

ALTER TABLE public.retail_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own organization's products"
    ON public.retail_products
    FOR ALL
    TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    ))
    WITH CHECK (organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    ));

-- 3. CAPI Event Logs (For tracking and debugging)
CREATE TABLE IF NOT EXISTS public.capi_event_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    event_name TEXT NOT NULL,
    event_id TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL,
    api_response JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.capi_event_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their organization's CAPI logs"
    ON public.capi_event_logs
    FOR SELECT
    TO authenticated
    USING (organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    ));

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_retail_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER meta_capi_config_updated_at
BEFORE UPDATE ON public.meta_capi_config
FOR EACH ROW EXECUTE FUNCTION update_retail_updated_at();

CREATE TRIGGER retail_products_updated_at
BEFORE UPDATE ON public.retail_products
FOR EACH ROW EXECUTE FUNCTION update_retail_updated_at();

COMMIT;
