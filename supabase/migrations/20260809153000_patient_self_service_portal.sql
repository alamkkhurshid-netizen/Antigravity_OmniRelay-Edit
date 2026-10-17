-- Extend the one-time-link portal without widening browser database access.
create or replace function public.get_patient_portal(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_session private.patient_portal_sessions%rowtype; v_result jsonb;
begin
  select * into v_session from private.patient_portal_sessions s
  where s.access_token_hash=extensions.digest(convert_to(coalesce(p_token,''),'UTF8'),'sha256')
    and s.revoked_at is null and s.consumed_at is not null and s.expires_at>now();
  if v_session.id is null then raise exception 'This secure session is invalid or has expired'; end if;
  update private.patient_portal_sessions set last_accessed_at=now() where id=v_session.id;
  select jsonb_build_object(
    'scope',v_session.scope,'expires_at',v_session.expires_at,
    'patient',jsonb_build_object('id',p.id,'full_name',p.full_name,'age',p.age,'locality',p.locality,'pincode',p.pincode),
    'business',coalesce(op.business_name,o.name),
    'appointments',case when v_session.scope in ('bookings','all') then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',a.id,'starts_at',a.starts_at,'ends_at',a.ends_at,'status',a.status,'payment_status',a.payment_status,
        'service_id',a.service_id,'location_id',a.location_id,'resource_id',a.resource_id,
        'service',sv.name,'location',l.name,'provider',r.name,'slug',bp.slug,
        'payment',case when pay.id is null then null else jsonb_build_object(
          'mode',pay.payment_mode,'amount_paise',pay.amount_paise,'currency',pay.currency,
          'status',pay.status,'paid_at',pay.paid_at) end) order by a.starts_at desc)
      from public.appointments a join public.organization_services sv on sv.id=a.service_id
      join public.business_locations l on l.id=a.location_id join public.booking_resources r on r.id=a.resource_id
      left join public.booking_pages bp on bp.organization_id=a.organization_id and bp.active
      left join public.booking_payments pay on pay.appointment_id=a.id
      where a.organization_id=v_session.organization_id and a.patient_id=v_session.patient_id
        and a.starts_at>now()-interval '2 years'),'[]'::jsonb) else '[]'::jsonb end,
    'visits',case when v_session.scope in ('records','all') then coalesce((
      select jsonb_agg(jsonb_build_object('id',e.id,'occurred_at',e.occurred_at,'encounter_type',e.encounter_type,
        'follow_up_at',e.follow_up_at,'follow_up_status',e.follow_up_status) order by e.occurred_at desc)
      from (select * from public.patient_encounters where organization_id=v_session.organization_id
        and patient_id=v_session.patient_id order by occurred_at desc limit 20)e),'[]'::jsonb) else '[]'::jsonb end,
    'prescriptions',case when v_session.scope in ('records','all') then coalesce((
      select jsonb_agg(jsonb_build_object('id',rx.id,'prescription_number',rx.prescription_number,'issued_at',rx.issued_at,
        'diagnosis',rx.diagnosis,'advice',rx.advice,'tests_requested',rx.tests_requested,'follow_up_at',rx.follow_up_at,
        'items',coalesce((select jsonb_agg(jsonb_build_object('medicine_name',i.medicine_name,'dosage',i.dosage,
          'frequency',i.frequency,'duration',i.duration,'instructions',i.instructions) order by i.sort_order)
          from public.prescription_items i where i.prescription_id=rx.id),'[]'::jsonb)) order by rx.issued_at desc)
      from (select * from public.prescriptions where organization_id=v_session.organization_id
        and patient_id=v_session.patient_id and status='issued' order by issued_at desc limit 20)rx),'[]'::jsonb) else '[]'::jsonb end,
    -- Deliberately omit goals, instructions, staff assignments and task notes.
    'care_plans',case when v_session.scope in ('records','all') then coalesce((
      select jsonb_agg(jsonb_build_object('id',cp.id,'title',cp.title,'plan_type',cp.plan_type,'status',cp.status,
        'starts_on',cp.starts_on,'target_date',cp.target_date,'next_review_at',cp.next_review_at,
        'reminder_status',cr.status,'reminder_scheduled_for',cr.scheduled_for) order by cp.created_at desc)
      from (select * from public.patient_care_plans where organization_id=v_session.organization_id
        and patient_id=v_session.patient_id and status in ('active','paused','completed') order by created_at desc limit 20)cp
      left join public.care_reminders cr on cr.care_plan_id=cp.id),'[]'::jsonb) else '[]'::jsonb end
  ) into v_result from public.patient_profiles p join public.organizations o on o.id=p.organization_id
  left join public.onboarding_profiles op on op.organization_id=o.id
  where p.id=v_session.patient_id and p.organization_id=v_session.organization_id;
  return v_result;
end; $$;

create or replace function public.revoke_patient_portal_session(p_token text)
returns void language plpgsql security definer set search_path='' as $$
begin
  update private.patient_portal_sessions set revoked_at=coalesce(revoked_at,now())
  where access_token_hash=extensions.digest(convert_to(coalesce(p_token,''),'UTF8'),'sha256') and consumed_at is not null;
end; $$;

revoke all on function public.get_patient_portal(text) from public,anon,authenticated;
revoke all on function public.revoke_patient_portal_session(text) from public,anon,authenticated;
grant execute on function public.get_patient_portal(text) to service_role;
grant execute on function public.revoke_patient_portal_session(text) to service_role;
