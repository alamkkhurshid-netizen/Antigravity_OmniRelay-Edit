alter table public.channel_message_templates drop constraint if exists channel_message_templates_event_type_check;
alter table public.channel_message_templates add constraint channel_message_templates_event_type_check check (event_type in ('confirmation','reminder_24h','reminder_2h','follow_up','cancellation','reschedule','care_campaign','marketing_campaign','emergency_notice'));

create table public.communication_opt_outs (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 patient_id uuid references public.patient_profiles(id) on delete set null, channel text not null default 'whatsapp' check(channel in ('whatsapp','email','sms')),
 address text not null, scope text not null default 'marketing' check(scope in ('care','marketing','all')), source text not null default 'customer_request',
 reason text, opted_out_at timestamptz not null default now(), recorded_by uuid references auth.users(id) on delete set null,
 unique(organization_id,channel,address,scope)
);
create table public.campaigns (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 name text not null check(char_length(name) between 2 and 120), campaign_type text not null check(campaign_type in ('care','marketing','emergency')),
 channel text not null default 'whatsapp' check(channel='whatsapp'), template_id uuid not null references public.channel_message_templates(id),
 status text not null default 'draft' check(status in ('draft','scheduled','queued','running','paused','completed','cancelled')),
 audience_filter jsonb not null default '{}', message_note text, scheduled_for timestamptz, timezone text not null default 'Asia/Kolkata',
 frequency_cap_hours integer not null default 72 check(frequency_cap_hours between 1 and 720),
 total_count integer not null default 0, eligible_count integer not null default 0, sent_count integer not null default 0,
 delivered_count integer not null default 0, read_count integer not null default 0, failed_count integer not null default 0, skipped_count integer not null default 0,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.campaign_recipients (
 id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.campaigns(id) on delete cascade,
 organization_id uuid not null references public.organizations(id) on delete cascade, patient_id uuid not null references public.patient_profiles(id) on delete cascade,
 recipient_address text not null, consent_basis text not null check(consent_basis in ('care','marketing','emergency')),
 status text not null default 'approved' check(status in ('pending','approved','queued','sent','delivered','read','failed','skipped','opted_out')),
 scheduled_for timestamptz, message_id uuid references public.messages(id) on delete set null, provider_message_id text, failure_reason text,
 sent_at timestamptz, delivered_at timestamptz, read_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(campaign_id,patient_id)
);
create table public.campaign_events (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 campaign_id uuid not null references public.campaigns(id) on delete cascade, recipient_id uuid references public.campaign_recipients(id) on delete cascade,
 event_type text not null, payload jsonb not null default '{}', actor_user_id uuid references auth.users(id) on delete set null, created_at timestamptz not null default now()
);
create index campaigns_org_status_schedule_idx on public.campaigns(organization_id,status,scheduled_for);
create index campaign_recipients_campaign_status_idx on public.campaign_recipients(campaign_id,status);
create index communication_opt_outs_lookup_idx on public.communication_opt_outs(organization_id,channel,address);
alter table public.communication_opt_outs enable row level security; alter table public.campaigns enable row level security;
alter table public.campaign_recipients enable row level security; alter table public.campaign_events enable row level security;
grant select,insert,update on public.communication_opt_outs,public.campaigns,public.campaign_recipients to authenticated;
grant select,insert on public.campaign_events to authenticated;
create policy opt_outs_read on public.communication_opt_outs for select to authenticated using(private.is_organization_member(organization_id,null));
create policy opt_outs_manage on public.communication_opt_outs for all to authenticated using(private.is_organization_member(organization_id,'admin')) with check(private.is_organization_member(organization_id,'admin'));
create policy campaigns_read on public.campaigns for select to authenticated using(private.is_organization_member(organization_id,null));
create policy campaigns_insert on public.campaigns for insert to authenticated with check(private.is_organization_member(organization_id,'admin') and created_by=auth.uid());
create policy campaigns_update on public.campaigns for update to authenticated using(private.is_organization_member(organization_id,'admin')) with check(private.is_organization_member(organization_id,'admin'));
create policy campaign_recipients_read on public.campaign_recipients for select to authenticated using(private.is_organization_member(organization_id,null));
create policy campaign_recipients_insert on public.campaign_recipients for insert to authenticated with check(private.is_organization_member(organization_id,'admin'));
create policy campaign_recipients_update on public.campaign_recipients for update to authenticated using(private.is_organization_member(organization_id,'admin')) with check(private.is_organization_member(organization_id,'admin'));
create policy campaign_events_read on public.campaign_events for select to authenticated using(private.is_organization_member(organization_id,null));
create policy campaign_events_insert on public.campaign_events for insert to authenticated with check(private.is_organization_member(organization_id,'admin') and (actor_user_id is null or actor_user_id=auth.uid()));
insert into public.channel_message_templates(organization_id,channel,event_type,provider_template_name,language_code,status,variable_map)
select o.id,'whatsapp',x.event_type,x.template_name,'en','draft',jsonb_build_object('patient_name','{{1}}','business_name','{{2}}','message','{{3}}')
from public.organizations o cross join (values ('care_campaign','omnirelay_care_update'),('marketing_campaign','omnirelay_patient_news'),('emergency_notice','omnirelay_emergency_notice')) x(event_type,template_name)
on conflict do nothing;
create or replace function private.refresh_campaign_counts() returns trigger language plpgsql security definer set search_path='' as $$
declare target_id uuid:=coalesce(new.campaign_id,old.campaign_id); begin
 update public.campaigns c set total_count=s.total_count,eligible_count=s.eligible_count,sent_count=s.sent_count,delivered_count=s.delivered_count,read_count=s.read_count,failed_count=s.failed_count,skipped_count=s.skipped_count,updated_at=now()
 from (select count(*)::int total_count,count(*) filter(where status not in ('skipped','opted_out'))::int eligible_count,count(*) filter(where status in ('sent','delivered','read'))::int sent_count,count(*) filter(where status in ('delivered','read'))::int delivered_count,count(*) filter(where status='read')::int read_count,count(*) filter(where status='failed')::int failed_count,count(*) filter(where status in ('skipped','opted_out'))::int skipped_count from public.campaign_recipients where campaign_id=target_id)s where c.id=target_id;
 return coalesce(new,old); end $$;
create trigger refresh_campaign_counts_after_recipient after insert or update or delete on public.campaign_recipients for each row execute function private.refresh_campaign_counts();
revoke all on function private.refresh_campaign_counts() from public,anon,authenticated;
