-- Create ai_agent_drafts table to hold the Approval Loop queue
create table public.ai_agent_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  
  -- The role of the agent drafting this (e.g. 'concierge', 'marketing')
  agent_role text not null,
  
  -- The context that triggered this draft (e.g. 'whatsapp_message_id', 'order_id')
  context_source text,
  
  -- What the agent wants to do
  proposed_action text not null,
  
  -- The actual content to be approved
  draft_payload jsonb not null,
  
  -- Workflow state
  status text not null default 'pending_approval' check (status in ('pending_approval', 'approved', 'edited', 'rejected')),
  
  -- The moat: what the human changed or why they rejected it
  human_feedback text,
  
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

-- Index for fast queue retrieval in the Action Centre
create index idx_ai_agent_drafts_org_status on public.ai_agent_drafts(organization_id, status);

-- Enable RLS
alter table public.ai_agent_drafts enable row level security;

-- Policies
create policy "members read ai agent drafts" 
  on public.ai_agent_drafts for select to authenticated 
  using (private.is_organization_member(organization_id, 'member'));

create policy "admins update ai agent drafts" 
  on public.ai_agent_drafts for update to authenticated 
  using (private.is_organization_member(organization_id, 'admin'));

create policy "system insert ai agent drafts" 
  on public.ai_agent_drafts for insert to authenticated 
  with check (private.is_organization_member(organization_id, 'admin'));
  
-- We also allow the service role (background AI workers) to insert drafts bypassing RLS.

create trigger set_ai_agent_drafts_updated_at
  before update on public.ai_agent_drafts
  for each row
  execute function public.set_updated_at();
