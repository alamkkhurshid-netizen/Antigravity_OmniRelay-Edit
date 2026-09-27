-- Migration: OEM Control Layer for AI Agents
-- Adds feature flags to the organizations table to allow OEM upselling and hard control

ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS premium_support_agent_active BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS premium_growth_agent_active BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS premium_admin_agent_active BOOLEAN NOT NULL DEFAULT false;

-- Add an index for quick filtering by OEM admins
CREATE INDEX IF NOT EXISTS idx_orgs_premium_support ON public.organizations(premium_support_agent_active);
CREATE INDEX IF NOT EXISTS idx_orgs_premium_growth ON public.organizations(premium_growth_agent_active);
