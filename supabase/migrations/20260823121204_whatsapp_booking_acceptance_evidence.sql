create table public.whatsapp_booking_acceptance_checks (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  check_key text not null check (check_key in ('consent_identity','new_returning_family','availability_isolation','concurrency_idempotency','reschedule_cancel','payments','reminders_commands_handoff','abandoned_recovery')),
  status text not null default 'pending' check (status in ('pending','passed','failed')),
  evidence_kind text not null default 'synthetic' check (evidence_kind in ('synthetic','production','controlled_channel')),
  evidence_summary text, evidence_reference text, tested_at timestamptz,
  recorded_by uuid references auth.users(id) on delete restrict, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, check_key)
);
create index whatsapp_booking_acceptance_org_status_idx on public.whatsapp_booking_acceptance_checks (organization_id, status, updated_at desc);
alter table public.whatsapp_booking_acceptance_checks enable row level security;
revoke all on public.whatsapp_booking_acceptance_checks from anon, authenticated;
grant select on public.whatsapp_booking_acceptance_checks to authenticated;
create policy "clinic members read booking acceptance evidence" on public.whatsapp_booking_acceptance_checks for select to authenticated
using (private.is_organization_member(organization_id, 'member'));

create or replace function public.get_whatsapp_booking_acceptance(p_organization_id uuid)
returns table (check_key text,status text,evidence_kind text,evidence_summary text,tested_at timestamptz)
language plpgsql security invoker set search_path = '' as $$ begin
  if not private.is_organization_member(p_organization_id, 'member') then raise exception 'Workspace access required' using errcode = '42501'; end if;
  return query select c.check_key,c.status,c.evidence_kind,c.evidence_summary,c.tested_at from public.whatsapp_booking_acceptance_checks c where c.organization_id=p_organization_id order by c.check_key;
end; $$;
revoke all on function public.get_whatsapp_booking_acceptance(uuid) from public, anon;
grant execute on function public.get_whatsapp_booking_acceptance(uuid) to authenticated;

create or replace function private.record_whatsapp_booking_acceptance(p_organization_id uuid,p_check_key text,p_status text,p_evidence_kind text,p_evidence_summary text,p_evidence_reference text default null)
returns public.whatsapp_booking_acceptance_checks language plpgsql security definer set search_path = '' as $$ declare result public.whatsapp_booking_acceptance_checks; begin
  if p_check_key not in ('consent_identity','new_returning_family','availability_isolation','concurrency_idempotency','reschedule_cancel','payments','reminders_commands_handoff','abandoned_recovery') or p_status not in ('pending','passed','failed') or p_evidence_kind not in ('synthetic','production','controlled_channel') then raise exception 'Invalid acceptance evidence' using errcode='22023'; end if;
  insert into public.whatsapp_booking_acceptance_checks(organization_id,check_key,status,evidence_kind,evidence_summary,evidence_reference,tested_at,updated_at)
  values(p_organization_id,p_check_key,p_status,p_evidence_kind,left(nullif(trim(p_evidence_summary),''),500),left(nullif(trim(p_evidence_reference),''),200),case when p_status='pending' then null else now() end,now())
  on conflict(organization_id,check_key) do update set status=excluded.status,evidence_kind=excluded.evidence_kind,evidence_summary=excluded.evidence_summary,evidence_reference=excluded.evidence_reference,tested_at=excluded.tested_at,updated_at=now()
  returning * into result; return result;
end; $$;
revoke all on function private.record_whatsapp_booking_acceptance(uuid,text,text,text,text,text) from public, anon, authenticated;
grant execute on function private.record_whatsapp_booking_acceptance(uuid,text,text,text,text,text) to service_role;

create or replace function private.whatsapp_booking_acceptance_ready(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$ select count(*)=8 and bool_and(status='passed') from public.whatsapp_booking_acceptance_checks where organization_id=p_organization_id; $$;
revoke all on function private.whatsapp_booking_acceptance_ready(uuid) from public, anon, authenticated;
grant execute on function private.whatsapp_booking_acceptance_ready(uuid) to service_role;
