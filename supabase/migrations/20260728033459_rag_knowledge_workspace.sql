create table public.rag_knowledge_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 2 and 160),
  source_type text not null default 'faq' check (source_type in ('faq','policy','service','clinical_guidance','business_info')),
  content text not null check (char_length(trim(content)) between 10 and 20000),
  status text not null default 'approved' check (status in ('draft','approved','archived')),
  language_code text not null default 'en',
  embedding_status text not null default 'pending' check (embedding_status in ('pending','indexed','failed')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index rag_knowledge_items_org_status_idx
  on public.rag_knowledge_items (organization_id,status,updated_at desc);

alter table public.rag_knowledge_items enable row level security;
grant select,insert,update,delete on public.rag_knowledge_items to authenticated;

create policy "members read knowledge"
on public.rag_knowledge_items for select to authenticated
using (private.is_organization_member(organization_id,'member'));

create policy "admins create knowledge"
on public.rag_knowledge_items for insert to authenticated
with check (
  private.is_organization_member(organization_id,'admin')
  and created_by = (select auth.uid())
);

create policy "admins update knowledge"
on public.rag_knowledge_items for update to authenticated
using (private.is_organization_member(organization_id,'admin'))
with check (private.is_organization_member(organization_id,'admin'));

create policy "owners delete knowledge"
on public.rag_knowledge_items for delete to authenticated
using (private.is_organization_member(organization_id,'owner'));

create table public.ai_agent_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  role text not null default 'booking_concierge',
  status text not null default 'training' check (status in ('training','ready','paused','live')),
  instructions text not null default 'Answer only from approved workspace knowledge. Never diagnose, prescribe, or invent prices, availability, policies, or medical advice.',
  handoff_message text not null default 'I will connect you with the clinic team for this question.',
  channels text[] not null default array['web'],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,role)
);

alter table public.ai_agent_profiles enable row level security;
grant select,insert,update,delete on public.ai_agent_profiles to authenticated;

create policy "members read agents"
on public.ai_agent_profiles for select to authenticated
using (private.is_organization_member(organization_id,'member'));

create policy "admins manage agents"
on public.ai_agent_profiles for all to authenticated
using (private.is_organization_member(organization_id,'admin'))
with check (private.is_organization_member(organization_id,'admin'));

insert into public.ai_agent_profiles(organization_id,name,role,status)
select id,'Appointment Concierge','booking_concierge','training'
from public.organizations
on conflict do nothing;
