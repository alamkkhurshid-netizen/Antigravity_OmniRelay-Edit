alter table public.provider_profiles
  add column if not exists contact_phone text,
  add column if not exists contact_email text;

create table public.doctor_import_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_format text not null check (source_format in ('csv','json')),
  row_count integer not null check (row_count between 1 and 200),
  imported_count integer not null default 0 check (imported_count >= 0),
  status text not null check (status in ('completed','failed')),
  payload_hash text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index doctor_import_jobs_org_time_idx
  on public.doctor_import_jobs (organization_id, created_at desc);

alter table public.doctor_import_jobs enable row level security;
revoke all on public.doctor_import_jobs from public, anon;
grant select, insert on public.doctor_import_jobs to authenticated;

create policy "members read doctor import jobs"
on public.doctor_import_jobs for select to authenticated
using (private.is_organization_member(organization_id, 'member'));

create policy "admins create doctor import jobs"
on public.doctor_import_jobs for insert to authenticated
with check (
  private.is_organization_member(organization_id, 'admin')
  and created_by = auth.uid()
);

create or replace function public.import_doctor_roster(
  p_organization_id uuid,
  p_rows jsonb,
  p_commit boolean default false,
  p_source_format text default 'csv'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  item jsonb;
  row_number integer := 0;
  total_rows integer := 0;
  errors jsonb := '[]'::jsonb;
  normalized_rows jsonb := '[]'::jsonb;
  weekdays jsonb;
  weekday_item jsonb;
  doctor_name text;
  specialization text;
  contact_phone text;
  contact_email text;
  chamber_name text;
  start_text text;
  end_text text;
  slot_minutes integer;
  location_id uuid;
  resource_id uuid;
  assignment_id uuid;
  imported integer := 0;
begin
  if not private.is_organization_member(p_organization_id, 'admin') then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_source_format not in ('csv','json') then raise exception 'Unsupported import format'; end if;
  if jsonb_typeof(coalesce(p_rows, 'null'::jsonb)) <> 'array' then
    raise exception 'Import rows must be a JSON array';
  end if;
  total_rows := jsonb_array_length(p_rows);
  if total_rows not between 1 and 200 then
    raise exception 'Import must contain between 1 and 200 rows';
  end if;

  for item in select value from jsonb_array_elements(p_rows) loop
    row_number := row_number + 1;
    doctor_name := trim(coalesce(item->>'doctor_name',''));
    specialization := trim(coalesce(item->>'specialization',''));
    contact_phone := nullif(trim(coalesce(item->>'contact_phone','')), '');
    contact_email := lower(nullif(trim(coalesce(item->>'contact_email','')), ''));
    chamber_name := trim(coalesce(item->>'chamber',''));
    start_text := trim(coalesce(item->>'start_time',''));
    end_text := trim(coalesce(item->>'end_time',''));
    weekdays := coalesce(item->'weekdays','[]'::jsonb);

    begin slot_minutes := (item->>'slot_duration_minutes')::integer;
    exception when others then slot_minutes := 0; end;

    select l.id into location_id
    from public.business_locations l
    where l.organization_id = p_organization_id and l.active
      and lower(trim(l.name)) = lower(chamber_name)
    limit 1;

    if char_length(doctor_name) not between 2 and 120 then
      errors := errors || jsonb_build_array(jsonb_build_object('row',row_number,'field','doctor_name','message','Enter a doctor name between 2 and 120 characters.'));
    end if;
    if specialization = '' then
      errors := errors || jsonb_build_array(jsonb_build_object('row',row_number,'field','specialization','message','Specialization is required.'));
    end if;
    if location_id is null then
      errors := errors || jsonb_build_array(jsonb_build_object('row',row_number,'field','chamber','message','Chamber name does not match an active clinic location.'));
    end if;
    if start_text !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or end_text !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or start_text >= end_text then
      errors := errors || jsonb_build_array(jsonb_build_object('row',row_number,'field','time','message','Use 24-hour HH:MM values and ensure end time is later.'));
    end if;
    if slot_minutes not between 5 and 240 then
      errors := errors || jsonb_build_array(jsonb_build_object('row',row_number,'field','slot_duration_minutes','message','Slot duration must be between 5 and 240 minutes.'));
    end if;
    if jsonb_typeof(weekdays) <> 'array' or jsonb_array_length(weekdays) = 0 or exists (
      select 1 from jsonb_array_elements_text(weekdays) d where d !~ '^[0-6]$'
    ) then
      errors := errors || jsonb_build_array(jsonb_build_object('row',row_number,'field','weekdays','message','Choose at least one weekday using numbers 0 to 6.'));
    end if;
    if contact_email is not null and contact_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      errors := errors || jsonb_build_array(jsonb_build_object('row',row_number,'field','contact_email','message','Enter a valid email address.'));
    end if;
    if contact_phone is not null and private.normalize_phone_identity(contact_phone) is null then
      errors := errors || jsonb_build_array(jsonb_build_object('row',row_number,'field','contact_phone','message','Enter a valid mobile number.'));
    end if;
    if exists (select 1 from public.booking_resources r where r.organization_id=p_organization_id and lower(trim(r.name))=lower(doctor_name)) then
      errors := errors || jsonb_build_array(jsonb_build_object('row',row_number,'field','doctor_name','message','Doctor already exists; bulk import never overwrites an existing profile.'));
    end if;
    if (
      select count(*) from jsonb_array_elements(p_rows) other
      where lower(trim(other->>'doctor_name'))=lower(doctor_name)
    ) > 1 then
      errors := errors || jsonb_build_array(jsonb_build_object('row',row_number,'field','doctor_name','message','Doctor appears more than once in this import.'));
    end if;

    normalized_rows := normalized_rows || jsonb_build_array(jsonb_build_object(
      'row',row_number,'doctor_name',doctor_name,'specialization',specialization,
      'contact_phone',contact_phone,'contact_email',contact_email,'chamber',chamber_name,
      'weekdays',weekdays,'start_time',start_text,'end_time',end_text,
      'slot_duration_minutes',slot_minutes
    ));
  end loop;

  if jsonb_array_length(errors) > 0 or not p_commit then
    return jsonb_build_object(
      'valid', jsonb_array_length(errors)=0,
      'committed', false,
      'row_count', total_rows,
      'rows', normalized_rows,
      'errors', errors
    );
  end if;

  for item in select value from jsonb_array_elements(normalized_rows) loop
    doctor_name := item->>'doctor_name';
    chamber_name := item->>'chamber';
    select l.id into location_id from public.business_locations l
      where l.organization_id=p_organization_id and l.active and lower(trim(l.name))=lower(chamber_name)
      order by l.created_at, l.id
      limit 1;

    insert into public.booking_resources (organization_id,location_id,name,resource_type,timezone)
    select p_organization_id,location_id,doctor_name,'doctor',l.timezone
    from public.business_locations l where l.id=location_id
    returning id into resource_id;

    insert into public.provider_profiles (
      resource_id,organization_id,specialization,contact_phone,contact_email,languages
    ) values (
      resource_id,p_organization_id,item->>'specialization',item->>'contact_phone',item->>'contact_email','{}'::text[]
    );

    insert into public.provider_location_assignments (
      organization_id,resource_id,location_id,active,effective_from,booking_window_days
    ) values (p_organization_id,resource_id,location_id,true,current_date,60)
    returning id into assignment_id;

    insert into public.provider_location_services (organization_id,assignment_id,service_id,active)
    select p_organization_id,assignment_id,s.id,true
    from public.organization_services s
    where s.organization_id=p_organization_id and s.active and s.booking_enabled;

    for weekday_item in select value from jsonb_array_elements(item->'weekdays') loop
      insert into public.availability_rules (
        organization_id,resource_id,location_id,weekday,start_time,end_time,
        slot_interval_minutes,active,effective_from
      ) values (
        p_organization_id,resource_id,location_id,(weekday_item#>>'{}')::smallint,
        (item->>'start_time')::time,(item->>'end_time')::time,
        (item->>'slot_duration_minutes')::integer,true,current_date
      );
    end loop;
    imported := imported + 1;
  end loop;

  insert into public.doctor_import_jobs (
    organization_id,source_format,row_count,imported_count,status,payload_hash,created_by
  ) values (
    p_organization_id,p_source_format,total_rows,imported,'completed',
    encode(extensions.digest(convert_to(p_rows::text,'UTF8'),'sha256'),'hex'),auth.uid()
  );

  return jsonb_build_object('valid',true,'committed',true,'row_count',total_rows,'imported_count',imported,'errors','[]'::jsonb);
end;
$function$;

revoke all on function public.import_doctor_roster(uuid,jsonb,boolean,text) from public,anon;
grant execute on function public.import_doctor_roster(uuid,jsonb,boolean,text) to authenticated;

comment on function public.import_doctor_roster(uuid,jsonb,boolean,text) is
  'Preview-first atomic bulk onboarding for new clinic doctors, chamber assignments and recurring availability.';
