-- ==============================================================================
-- Migration: 20261012000000_retail_production_vertical.sql
-- Description: Retail Core, Categories, Product Variants, Orders Timeline,
--              Discounts/Offers, and Abandoned Cart Recovery
-- ==============================================================================

BEGIN;

-- 1. Retail Categories with Nested Hierarchy and Ordering
CREATE TABLE IF NOT EXISTS public.retail_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    parent_id UUID REFERENCES public.retail_categories(id) ON DELETE SET NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    image_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_retail_categories_org ON public.retail_categories(organization_id, display_order);
CREATE INDEX IF NOT EXISTS idx_retail_categories_parent ON public.retail_categories(parent_id);

ALTER TABLE public.retail_categories ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'retail_categories' AND policyname = 'members read retail categories') THEN
        CREATE POLICY "members read retail categories"
            ON public.retail_categories FOR SELECT TO authenticated
            USING (private.is_organization_member(organization_id, 'member'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'retail_categories' AND policyname = 'admins insert retail categories') THEN
        CREATE POLICY "admins insert retail categories"
            ON public.retail_categories FOR INSERT TO authenticated
            WITH CHECK (private.is_organization_member(organization_id, 'admin'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'retail_categories' AND policyname = 'admins update retail categories') THEN
        CREATE POLICY "admins update retail categories"
            ON public.retail_categories FOR UPDATE TO authenticated
            USING (private.is_organization_member(organization_id, 'admin'))
            WITH CHECK (private.is_organization_member(organization_id, 'admin'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'retail_categories' AND policyname = 'admins delete retail categories') THEN
        CREATE POLICY "admins delete retail categories"
            ON public.retail_categories FOR DELETE TO authenticated
            USING (private.is_organization_member(organization_id, 'admin'));
    END IF;
END $$;

-- 2. Extend Retail Products with Category, Multi-Image, Variants, and Low Stock Alerts
ALTER TABLE public.retail_products 
    ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.retail_categories(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS variants JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER NOT NULL DEFAULT 5,
    ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_retail_products_cat ON public.retail_products(organization_id, category_id);

-- 3. Extend Retail Orders Status Constraint & Fulfillment Metadata
ALTER TABLE public.retail_orders
    DROP CONSTRAINT IF EXISTS retail_orders_status_check;

ALTER TABLE public.retail_orders
    ADD CONSTRAINT retail_orders_status_check 
    CHECK (status IN ('new', 'confirmed', 'packing', 'preparing', 'shipping', 'shipped', 'delivered', 'completed', 'cancelled'));

ALTER TABLE public.retail_orders
    ADD COLUMN IF NOT EXISTS tracking_number TEXT,
    ADD COLUMN IF NOT EXISTS tracking_url TEXT,
    ADD COLUMN IF NOT EXISTS carrier TEXT,
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS discount_code TEXT,
    ADD COLUMN IF NOT EXISTS discount_amount NUMERIC NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS timeline JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 4. Discounts, Coupons & Loyalty Promotions
CREATE TABLE IF NOT EXISTS public.retail_discounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    description TEXT,
    discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed', 'bundle')),
    value NUMERIC NOT NULL CHECK (value >= 0),
    min_order_amount NUMERIC NOT NULL DEFAULT 0,
    max_discount_amount NUMERIC,
    usage_limit INTEGER,
    times_used INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, code)
);

CREATE INDEX IF NOT EXISTS idx_retail_discounts_org ON public.retail_discounts(organization_id, is_active);

ALTER TABLE public.retail_discounts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'retail_discounts' AND policyname = 'members read retail discounts') THEN
        CREATE POLICY "members read retail discounts"
            ON public.retail_discounts FOR SELECT TO authenticated
            USING (private.is_organization_member(organization_id, 'member'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'retail_discounts' AND policyname = 'admins insert retail discounts') THEN
        CREATE POLICY "admins insert retail discounts"
            ON public.retail_discounts FOR INSERT TO authenticated
            WITH CHECK (private.is_organization_member(organization_id, 'admin'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'retail_discounts' AND policyname = 'admins update retail discounts') THEN
        CREATE POLICY "admins update retail discounts"
            ON public.retail_discounts FOR UPDATE TO authenticated
            USING (private.is_organization_member(organization_id, 'admin'))
            WITH CHECK (private.is_organization_member(organization_id, 'admin'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'retail_discounts' AND policyname = 'admins delete retail discounts') THEN
        CREATE POLICY "admins delete retail discounts"
            ON public.retail_discounts FOR DELETE TO authenticated
            USING (private.is_organization_member(organization_id, 'admin'));
    END IF;
END $$;

-- 5. Abandoned Carts Tracking & Recovery
CREATE TABLE IF NOT EXISTS public.retail_abandoned_carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    customer_phone TEXT NOT NULL,
    customer_name TEXT,
    cart_items JSONB NOT NULL DEFAULT '[]'::jsonb,
    cart_value NUMERIC NOT NULL DEFAULT 0,
    recovered BOOLEAN NOT NULL DEFAULT false,
    recovery_sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retail_abandoned_carts_org ON public.retail_abandoned_carts(organization_id, recovered);

ALTER TABLE public.retail_abandoned_carts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'retail_abandoned_carts' AND policyname = 'members read abandoned carts') THEN
        CREATE POLICY "members read abandoned carts"
            ON public.retail_abandoned_carts FOR SELECT TO authenticated
            USING (private.is_organization_member(organization_id, 'member'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'retail_abandoned_carts' AND policyname = 'admins manage abandoned carts') THEN
        CREATE POLICY "admins manage abandoned carts"
            ON public.retail_abandoned_carts FOR ALL TO authenticated
            USING (private.is_organization_member(organization_id, 'admin'))
            WITH CHECK (private.is_organization_member(organization_id, 'admin'));
    END IF;
END $$;

COMMIT;
