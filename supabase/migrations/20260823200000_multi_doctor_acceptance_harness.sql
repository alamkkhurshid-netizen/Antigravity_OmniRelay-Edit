create or replace function public.get_multi_doctor_booking_acceptance(p_organization_id uuid)
returns table(check_key text,status text,evidence_summary text)
language plpgsql stable security definer set search_path='' as $$
declare
  v_mode text;
  v_departments integer;
  v_linked_providers integer;
  v_orphan_links integer;
  v_multi_provider_departments integer;
  v_bookable_assignments integer;
  v_payment_assignments integer;
  v_overlap_guard boolean;
begin
  if not private.is_organization_member(p_organization_id,'member') then
    raise exception 'Forbidden' using errcode='42501';
  end if;

  select coalesce(op.clinic_mode,'solo_practitioner') into v_mode
  from public.onboarding_profiles op where op.organization_id=p_organization_id;

  select count(*) into v_departments from public.clinic_departments d
  where d.organization_id=p_organization_id and d.active;

  select count(distinct pd.resource_id) into v_linked_providers
  from public.provider_departments pd
  join public.clinic_departments d on d.id=pd.department_id and d.organization_id=pd.organization_id and d.active
  join public.booking_resources r on r.id=pd.resource_id and r.organization_id=pd.organization_id and r.active
  where pd.organization_id=p_organization_id;

  select count(*) into v_orphan_links
  from public.provider_departments pd
  left join public.clinic_departments d on d.id=pd.department_id and d.organization_id=pd.organization_id and d.active
  left join public.booking_resources r on r.id=pd.resource_id and r.organization_id=pd.organization_id and r.active
  where pd.organization_id=p_organization_id and (d.id is null or r.id is null);

  select count(*) into v_multi_provider_departments from (
    select pd.department_id from public.provider_departments pd
    join public.clinic_departments d on d.id=pd.department_id and d.organization_id=pd.organization_id and d.active
    join public.booking_resources r on r.id=pd.resource_id and r.organization_id=pd.organization_id and r.active
    where pd.organization_id=p_organization_id group by pd.department_id having count(distinct pd.resource_id)>=2
  ) eligible;

  select count(*) into v_bookable_assignments
  from public.provider_location_assignments a
  where a.organization_id=p_organization_id and a.active and exists(
    select 1 from public.provider_location_services s where s.assignment_id=a.id and s.active
  );

  select count(*) into v_payment_assignments
  from public.provider_location_services s
  join public.provider_location_assignments a on a.id=s.assignment_id
  where a.organization_id=p_organization_id and a.active and s.active
    and coalesce(array_length(s.allowed_payment_modes,1),0)>0;

  select exists(
    select 1 from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid=c.conrelid
    join pg_catalog.pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public' and t.relname='appointments' and c.contype='x'
  ) into v_overlap_guard;

  if v_mode<>'multi_doctor_clinic' then
    return query values
      ('clinic_mode','not_applicable','Solo-practitioner mode is active; multi-doctor routing remains dormant.'),
      ('department_routing','not_applicable','Department selection is not required for this clinic mode.'),
      ('provider_resolution','not_applicable','Named-provider booking continues through the existing solo flow.'),
      ('any_available_doctor','not_applicable','Any-provider routing activates only after multi-doctor configuration.'),
      ('booking_safety',case when v_overlap_guard then 'passed' else 'failed' end,case when v_overlap_guard then 'Appointment overlap protection is active.' else 'Appointment overlap protection is missing.' end),
      ('payment_reschedule_cancel','not_applicable','Existing solo-clinic payment and appointment-management acceptance remains authoritative.');
    return;
  end if;

  return query values
    ('clinic_mode','passed','Multi-doctor clinic mode is active.'),
    ('department_routing',case when v_departments>0 then 'passed' else 'failed' end,case when v_departments>0 then v_departments||' active department(s) are available.' else 'Add at least one active department.' end),
    ('provider_resolution',case when v_linked_providers>0 and v_orphan_links=0 then 'passed' else 'failed' end,case when v_linked_providers>0 and v_orphan_links=0 then v_linked_providers||' active provider(s) resolve within tenant boundaries.' else 'Provider-to-department assignments are incomplete or stale.' end),
    ('any_available_doctor',case when v_multi_provider_departments>0 then 'passed' else 'pending' end,case when v_multi_provider_departments>0 then v_multi_provider_departments||' department(s) can route to any available doctor.' else 'At least one department needs two active providers for this route.' end),
    ('booking_safety',case when v_overlap_guard and v_bookable_assignments>=v_linked_providers then 'passed' else 'failed' end,case when v_overlap_guard and v_bookable_assignments>=v_linked_providers then 'Every linked provider has a bookable assignment and overlap protection is active.' else 'Complete provider schedules before pilot activation.' end),
    ('payment_reschedule_cancel',case when v_payment_assignments>=v_linked_providers then 'passed' else 'pending' end,case when v_payment_assignments>=v_linked_providers then 'Payment choices are configured for every linked provider; reschedule/cancel reuse the accepted appointment contract.' else 'Configure payment choices for every linked provider.' end);
end;
$$;

revoke all on function public.get_multi_doctor_booking_acceptance(uuid) from public,anon;
grant execute on function public.get_multi_doctor_booking_acceptance(uuid) to authenticated;
comment on function public.get_multi_doctor_booking_acceptance(uuid) is 'Read-only, identity-free acceptance matrix for multi-doctor booking configuration.';
