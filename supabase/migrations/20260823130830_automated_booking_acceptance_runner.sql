create or replace function private.run_whatsapp_booking_acceptance(p_organization_id uuid)
returns table(check_key text,status text,evidence_summary text)
language plpgsql security definer set search_path = '' as $$
declare
  consent_ok boolean;
  path_ok boolean;
  availability_ok boolean;
  concurrency_ok boolean;
  confirmed_count bigint;
  relationship_count bigint;
begin
  select exists(
    select 1 from public.whatsapp_booking_consent_evidence c
    join public.patient_identity_verification_events i
      on i.organization_id=c.organization_id and i.conversation_id=c.conversation_id
    where c.organization_id=p_organization_id and c.action='accepted'
      and c.channel='whatsapp' and c.identity_verified_by_channel
      and i.identity_type='whatsapp' and i.verified_at is not null
  ) into consent_ok;

  select count(*),count(distinct coalesce(a.patient_relationship,'self'))
  into confirmed_count,relationship_count
  from public.appointments a
  where a.organization_id=p_organization_id and a.source='whatsapp'
    and a.status in ('confirmed','completed');
  path_ok := confirmed_count>0 and relationship_count>0;

  select
    exists(select 1 from public.booking_pages b where b.organization_id=p_organization_id and b.active)
    and exists(select 1 from public.availability_rules v where v.organization_id=p_organization_id and v.active)
    and not exists(
      select 1 from public.availability_rules v
      join public.booking_resources r on r.id=v.resource_id
      where v.organization_id=p_organization_id and r.organization_id<>v.organization_id
    )
    and not exists(
      select 1 from public.appointments a
      join public.booking_resources r on r.id=a.resource_id
      join public.business_locations l on l.id=a.location_id
      join public.organization_services s on s.id=a.service_id
      where a.organization_id=p_organization_id
        and (r.organization_id<>a.organization_id or l.organization_id<>a.organization_id or s.organization_id<>a.organization_id)
    ) into availability_ok;

  select exists(
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid='public.appointments'::regclass
      and c.contype='x' and pg_catalog.pg_get_constraintdef(c.oid) ilike '%tstzrange%'
  ) and not exists(
    select 1 from private.whatsapp_booking_handoffs h
    join public.messages m on m.conversation_id=h.conversation_id
      and m.status->>'source'='whatsapp_booking_handoff'
      and m.status->>'handoff_id'=h.id::text
    where h.organization_id=p_organization_id
    group by h.id having count(m.id)>1
  ) into concurrency_ok;

  perform private.record_whatsapp_booking_acceptance(p_organization_id,'consent_identity',case when consent_ok then 'passed' else 'pending' end,'production',case when consent_ok then 'Accepted consent and WhatsApp-possession evidence are linked.' else 'Waiting for one complete consent and WhatsApp-possession evidence pair.' end,'automated-runner-v1');
  perform private.record_whatsapp_booking_acceptance(p_organization_id,'new_returning_family',case when path_ok then 'passed' else 'pending' end,'production',case when path_ok then confirmed_count||' confirmed WhatsApp booking path(s) verified without reading patient identity.' else 'Waiting for a confirmed WhatsApp booking path.' end,'automated-runner-v1');
  perform private.record_whatsapp_booking_acceptance(p_organization_id,'availability_isolation',case when availability_ok then 'passed' else 'failed' end,'synthetic',case when availability_ok then 'Active booking configuration is tenant-consistent.' else 'Booking configuration is incomplete or contains a tenant mismatch.' end,'automated-runner-v1');
  perform private.record_whatsapp_booking_acceptance(p_organization_id,'concurrency_idempotency',case when concurrency_ok then 'passed' else 'failed' end,'synthetic',case when concurrency_ok then 'Overlap exclusion and duplicate-confirmation protections are active.' else 'Overlap or duplicate-confirmation protection failed verification.' end,'automated-runner-v1');

  return query select c.check_key,c.status,c.evidence_summary
  from public.whatsapp_booking_acceptance_checks c
  where c.organization_id=p_organization_id
    and c.check_key in ('consent_identity','new_returning_family','availability_isolation','concurrency_idempotency')
  order by c.check_key;
end; $$;

revoke all on function private.run_whatsapp_booking_acceptance(uuid) from public,anon,authenticated;
grant execute on function private.run_whatsapp_booking_acceptance(uuid) to service_role;
