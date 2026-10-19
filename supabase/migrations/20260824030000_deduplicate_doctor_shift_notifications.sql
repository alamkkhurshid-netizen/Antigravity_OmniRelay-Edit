create or replace function public.materialize_due_doctor_queue_dispatches(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path='' as $$
declare local_date date:=(p_now at time zone 'Asia/Kolkata')::date;inserted_count integer:=0;
begin
  with ranked_shifts as (
    select r.*,pp.contact_phone,
      ((local_date+r.start_time) at time zone 'Asia/Kolkata') as shift_at,
      row_number() over(
        partition by r.organization_id,r.resource_id,((local_date+r.start_time) at time zone 'Asia/Kolkata')
        order by (r.location_id is not null) desc,r.updated_at desc,r.id
      ) as shift_rank
    from public.availability_rules r
    join public.provider_profiles pp on pp.resource_id=r.resource_id and pp.organization_id=r.organization_id
    where r.active and r.weekday=extract(dow from local_date)::smallint
      and (r.effective_from is null or r.effective_from<=local_date)
      and (r.effective_to is null or r.effective_to>=local_date)
      and pp.queue_notifications_enabled and pp.whatsapp_queue_consent_at is not null
      and private.normalize_phone_identity(pp.contact_phone) is not null
  )
  insert into public.doctor_queue_dispatches(
    organization_id,resource_id,availability_rule_id,shift_date,shift_starts_at,
    scheduled_for,recipient_phone,booking_count,next_attempt_at
  )
  select r.organization_id,r.resource_id,r.id,local_date,r.shift_at,
    r.shift_at-interval '1 hour',private.normalize_phone_identity(r.contact_phone),
    (select count(*)::integer from public.appointments a
      where a.organization_id=r.organization_id and a.resource_id=r.resource_id
        and a.starts_at>=r.shift_at
        and a.starts_at<((local_date+r.end_time) at time zone 'Asia/Kolkata')
        and a.status<>'cancelled'),
    r.shift_at-interval '1 hour'
  from ranked_shifts r
  where r.shift_rank=1 and r.shift_at>p_now and r.shift_at<=p_now+interval '70 minutes'
    and not exists(
      select 1 from public.doctor_queue_dispatches existing
      where existing.organization_id=r.organization_id and existing.resource_id=r.resource_id
        and existing.shift_date=local_date and existing.shift_starts_at=r.shift_at
    )
  on conflict(organization_id,availability_rule_id,shift_date) do nothing;
  get diagnostics inserted_count=row_count;
  return inserted_count;
end;
$$;

revoke all on function public.materialize_due_doctor_queue_dispatches(timestamptz) from public,anon,authenticated;
grant execute on function public.materialize_due_doctor_queue_dispatches(timestamptz) to service_role;
comment on function public.materialize_due_doctor_queue_dispatches(timestamptz) is 'Creates at most one automatic doctor notification per provider and shift start, preferring explicit chamber rules over generic availability.';
