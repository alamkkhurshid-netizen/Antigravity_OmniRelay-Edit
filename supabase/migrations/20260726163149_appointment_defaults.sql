create or replace function private.initialize_booking_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resource_id uuid;
begin
  insert into public.booking_resources (
    organization_id, name, resource_type, timezone
  ) values (
    new.id,
    'Primary provider',
    case when new.extra->>'business_category' = 'Healthcare' then 'doctor' else 'staff' end,
    coalesce(new.extra->>'timezone', 'Asia/Kolkata')
  )
  on conflict (organization_id, name) do update set updated_at = now()
  returning id into resource_id;

  insert into public.availability_rules (
    organization_id, resource_id, weekday, start_time, end_time
  )
  select new.id, resource_id, weekday, '09:00'::time, '18:00'::time
  from generate_series(1, 6) as weekday
  on conflict do nothing;
  return new;
end;
$$;

revoke all on function private.initialize_booking_defaults()
  from public, anon, authenticated;

drop trigger if exists initialize_booking_defaults on public.organizations;
create trigger initialize_booking_defaults
after insert on public.organizations
for each row execute function private.initialize_booking_defaults();
