alter table public.channel_message_templates
  drop constraint if exists channel_message_templates_event_type_check;
alter table public.channel_message_templates
  add constraint channel_message_templates_event_type_check check (event_type in (
    'confirmation','reminder_24h','reminder_2h','follow_up','cancellation',
    'reschedule','care_campaign','marketing_campaign','emergency_notice','booking_otp'
  ));

create table private.booking_phone_otp_challenges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  phone_hash bytea not null,
  code_hash bytea not null,
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  expires_at timestamptz not null,
  verified_at timestamptz,
  verification_token_hash bytea,
  verification_expires_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.appointments
  add column if not exists booking_phone_verified_at timestamptz,
  add column if not exists booking_phone_verification_id uuid;
create index booking_phone_otp_phone_created_idx
  on private.booking_phone_otp_challenges (organization_id, phone_hash, created_at desc);
alter table private.booking_phone_otp_challenges enable row level security;
revoke all on private.booking_phone_otp_challenges from public, anon, authenticated;
create policy booking_phone_otp_deny_direct_access
  on private.booking_phone_otp_challenges for all to public
  using (false) with check (false);

create or replace function public.create_booking_phone_otp_challenge(p_slug text,p_phone text)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
  org_id uuid; normalized text; pepper text; phone_digest bytea; challenge_id uuid;
  random_bytes bytea; otp_number bigint; otp_code text; recent_count integer;
begin
  if coalesce((select auth.jwt()->>'role'),'') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  select organization_id into org_id from public.booking_pages where slug=lower(trim(p_slug)) and active;
  normalized:=private.normalize_phone_identity(p_phone);
  if org_id is null or normalized is null then raise exception 'Invalid booking page or mobile number'; end if;
  if not exists(select 1 from public.channel_message_templates where organization_id=org_id and channel='whatsapp' and event_type='booking_otp' and status='approved') then
    raise exception 'WhatsApp verification template is not approved';
  end if;
  select decrypted_secret into pepper from vault.decrypted_secrets where name='edge_functions_token' limit 1;
  if nullif(pepper,'') is null then raise exception 'OTP protection is unavailable'; end if;
  phone_digest:=extensions.hmac(org_id::text||'|'||normalized,pepper,'sha256');
  select count(*) into recent_count from private.booking_phone_otp_challenges
    where organization_id=org_id and phone_hash=phone_digest and created_at>now()-interval '15 minutes';
  if recent_count>=3 then raise exception 'Too many verification codes requested. Please wait 15 minutes.'; end if;
  if exists(select 1 from private.booking_phone_otp_challenges where organization_id=org_id and phone_hash=phone_digest and created_at>now()-interval '60 seconds') then
    raise exception 'Please wait before requesting another code.';
  end if;
  challenge_id:=gen_random_uuid();random_bytes:=extensions.gen_random_bytes(4);
  otp_number:=(get_byte(random_bytes,0)::bigint*16777216+get_byte(random_bytes,1)::bigint*65536+get_byte(random_bytes,2)::bigint*256+get_byte(random_bytes,3))%1000000;
  otp_code:=lpad(otp_number::text,6,'0');
  insert into private.booking_phone_otp_challenges(id,organization_id,phone_hash,code_hash,expires_at)
  values(challenge_id,org_id,phone_digest,extensions.hmac(challenge_id::text||'|'||otp_code,pepper,'sha256'),now()+interval '5 minutes');
  return jsonb_build_object('challenge_id',challenge_id,'organization_id',org_id,'normalized_phone',normalized,'otp_code',otp_code,'expires_in',300);
end;$function$;

create or replace function public.verify_booking_phone_otp(p_challenge_id uuid,p_code text)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare row_data private.booking_phone_otp_challenges%rowtype;pepper text;token text;
begin
  if coalesce((select auth.jwt()->>'role'),'') <> 'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  select * into row_data from private.booking_phone_otp_challenges where id=p_challenge_id for update;
  if row_data.id is null then return jsonb_build_object('ok',false,'error','Verification request not found'); end if;
  if row_data.verified_at is not null then return jsonb_build_object('ok',false,'error','This code was already used'); end if;
  if row_data.expires_at<=now() then return jsonb_build_object('ok',false,'error','The code has expired'); end if;
  if row_data.attempt_count>=5 then return jsonb_build_object('ok',false,'error','Too many incorrect attempts'); end if;
  select decrypted_secret into pepper from vault.decrypted_secrets where name='edge_functions_token' limit 1;
  if row_data.code_hash<>extensions.hmac(row_data.id::text||'|'||trim(p_code),pepper,'sha256') then
    update private.booking_phone_otp_challenges set attempt_count=attempt_count+1 where id=row_data.id;
    return jsonb_build_object('ok',false,'error','Incorrect verification code','attempts_remaining',4-row_data.attempt_count);
  end if;
  token:=encode(extensions.gen_random_bytes(32),'hex');
  update private.booking_phone_otp_challenges set verified_at=now(),verification_token_hash=extensions.hmac(id::text||'|'||token,pepper,'sha256'),verification_expires_at=now()+interval '10 minutes' where id=row_data.id;
  return jsonb_build_object('ok',true,'verification_token',token,'expires_in',600);
end;$function$;

create or replace function public.consume_booking_phone_verification(
  p_challenge_id uuid,p_verification_token text,p_booking_reference text,p_manage_token text
)
returns boolean language plpgsql security definer set search_path=''
as $function$
declare challenge private.booking_phone_otp_challenges%rowtype;pepper text;appointment_row public.appointments%rowtype;appointment_id uuid;expected_phone_hash bytea;
begin
  if coalesce((select auth.jwt()->>'role'),'') <> 'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  select * into challenge from private.booking_phone_otp_challenges where id=p_challenge_id for update;
  if challenge.id is null or challenge.verified_at is null or challenge.consumed_at is not null or challenge.verification_expires_at<=now() then return false; end if;
  select decrypted_secret into pepper from vault.decrypted_secrets where name='edge_functions_token' limit 1;
  if challenge.verification_token_hash<>extensions.hmac(challenge.id::text||'|'||p_verification_token,pepper,'sha256') then return false; end if;
  select c.appointment_id into appointment_id from private.customer_booking_access c
    where c.booking_reference=upper(trim(p_booking_reference)) and c.token_hash=extensions.digest(convert_to(p_manage_token,'UTF8'),'sha256');
  select * into appointment_row from public.appointments where id=appointment_id and organization_id=challenge.organization_id for update;
  if appointment_row.id is null then return false; end if;
  expected_phone_hash:=extensions.hmac(challenge.organization_id::text||'|'||private.normalize_phone_identity(coalesce(appointment_row.booking_contact_phone,appointment_row.customer_phone)),pepper,'sha256');
  if expected_phone_hash<>challenge.phone_hash then return false; end if;
  update public.appointments set booking_phone_verified_at=now(),booking_phone_verification_id=challenge.id where id=appointment_row.id;
  update private.booking_phone_otp_challenges set consumed_at=now() where id=challenge.id;
  return true;
end;$function$;

revoke all on function public.create_booking_phone_otp_challenge(text,text) from public,anon,authenticated;
revoke all on function public.verify_booking_phone_otp(uuid,text) from public,anon,authenticated;
revoke all on function public.consume_booking_phone_verification(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.create_booking_phone_otp_challenge(text,text) to service_role;
grant execute on function public.verify_booking_phone_otp(uuid,text) to service_role;
grant execute on function public.consume_booking_phone_verification(uuid,text,text,text) to service_role;

create or replace function private.redact_dispatched_booking_otp()
returns trigger language plpgsql set search_path=''
as $function$
begin
  if new.external_id is not null
     and new.content#>>'{data,meta,purpose}'='booking_otp' then
    new.content:=jsonb_set(new.content,'{data,components}','[]'::jsonb,false);
  end if;
  return new;
end;$function$;
drop trigger if exists redact_dispatched_booking_otp on public.messages;
create trigger redact_dispatched_booking_otp
before update of external_id on public.messages
for each row execute function private.redact_dispatched_booking_otp();
revoke all on function private.redact_dispatched_booking_otp() from public,anon,authenticated;

select cron.schedule('cleanup-booking-phone-otp','29 3 * * *',$cron$delete from private.booking_phone_otp_challenges where created_at<now()-interval '24 hours'$cron$);
