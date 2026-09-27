-- Migration to automatically activate all agents for the OEM organization
-- The OEM organization is always the very first one created in the database.

UPDATE public.organizations
SET 
  premium_support_agent_active = true,
  premium_cto_agent_active = true,
  premium_growth_agent_active = true,
  premium_admin_agent_active = true
WHERE id = (SELECT id FROM public.organizations ORDER BY created_at ASC LIMIT 1);
