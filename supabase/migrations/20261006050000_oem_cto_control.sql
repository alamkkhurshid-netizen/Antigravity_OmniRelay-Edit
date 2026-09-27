ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS premium_cto_agent_active BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_orgs_premium_cto ON public.organizations(premium_cto_agent_active);
