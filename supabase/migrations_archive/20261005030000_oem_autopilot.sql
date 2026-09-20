-- Create oem_agent_drafts table to hold the OEM Autopilot queue
create table public.oem_agent_drafts (
  id uuid primary key default gen_random_uuid(),
  
  -- The context that triggered this draft (e.g. 'tenant_churn_risk')
  context_source text,
  
  -- What the agent wants the OEM to do
  proposed_action text not null,
  
  -- The actual content to be approved (e.g., target organization_id, message text)
  draft_payload jsonb not null,
  
  -- Workflow state
  status text not null default 'pending_approval' check (status in ('pending_approval', 'approved', 'rejected')),
  
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

-- Enable RLS
alter table public.oem_agent_drafts enable row level security;

-- Policies for OEM Admins
create policy "platform operators can read oem drafts" 
  on public.oem_agent_drafts for select to authenticated 
  using (private.is_platform_operator('oem_admin') or private.is_platform_operator('oem_support'));

create policy "platform operators can update oem drafts" 
  on public.oem_agent_drafts for update to authenticated 
  using (private.is_platform_operator('oem_admin') or private.is_platform_operator('oem_support'));

-- Allow system/backend to insert drafts
create policy "system can insert oem drafts" 
  on public.oem_agent_drafts for insert to authenticated 
  with check (private.is_platform_operator('oem_admin')); 
  -- Note: The background cron script will use service_role which bypasses RLS anyway

create trigger set_oem_agent_drafts_updated_at
  before update on public.oem_agent_drafts
  for each row
  execute function public.set_updated_at();
