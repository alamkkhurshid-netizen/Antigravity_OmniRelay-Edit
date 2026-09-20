


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "billing";


ALTER SCHEMA "billing" OWNER TO "postgres";


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "btree_gist" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "moddatetime" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "public";






CREATE TYPE "private"."shadow_finish_reason" AS ENUM (
    'STOP',
    'MAX_TOKENS',
    'SAFETY_BLOCK',
    'HTTP_ERROR',
    'NETWORK_ERROR',
    'TIMEOUT',
    'MALFORMED',
    'UNSUPPORTED'
);


ALTER TYPE "private"."shadow_finish_reason" OWNER TO "postgres";


CREATE TYPE "private"."shadow_provider" AS ENUM (
    'gemini',
    'openai_compatible'
);


ALTER TYPE "private"."shadow_provider" OWNER TO "postgres";


CREATE TYPE "public"."direction" AS ENUM (
    'incoming',
    'outgoing',
    'internal'
);


ALTER TYPE "public"."direction" OWNER TO "postgres";


CREATE TYPE "public"."log_level" AS ENUM (
    'info',
    'warning',
    'error'
);


ALTER TYPE "public"."log_level" OWNER TO "postgres";


CREATE TYPE "public"."role" AS ENUM (
    'owner',
    'admin',
    'member'
);


ALTER TYPE "public"."role" OWNER TO "postgres";


CREATE TYPE "public"."service" AS ENUM (
    'whatsapp',
    'instagram',
    'local',
    'slack',
    'discord',
    'teams',
    'whatsapp-web'
);


ALTER TYPE "public"."service" OWNER TO "postgres";


CREATE TYPE "public"."webhook_operation" AS ENUM (
    'insert',
    'update'
);


ALTER TYPE "public"."webhook_operation" OWNER TO "postgres";


CREATE TYPE "public"."webhook_table" AS ENUM (
    'messages',
    'conversations',
    'organizations_addresses',
    'contacts',
    'contacts_addresses',
    'logs'
);


ALTER TYPE "public"."webhook_table" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "billing"."change_plan"("_organization_id" "uuid", "_plan_id" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  _plan billing.plans%rowtype;
  _tier_id text;
  _pp record;
begin
  -- Get the plan
  select * into strict _plan
  from billing.plans p
  where p.id = _plan_id
    and p.active = true;

  -- Find the matching tier for this plan's min_tier level
  select t.id into _tier_id
  from billing.tiers t
  where t.level >= _plan.min_tier
    and t.active = true
  order by t.level asc
  limit 1;

  if _tier_id is null then
    raise exception 'No active tier found for plan %', _plan_id;
  end if;

  -- Update subscription
  update billing.subscriptions
  set tier_id = _tier_id,
      plan_id = _plan_id,
      current_period_start = now()
  where organization_id = _organization_id;

  -- Grant balance products included in the plan
  for _pp in
    select pp.product_id, pp.included
    from billing.plans_products pp
    join billing.products p on p.id = pp.product_id
    where pp.plan_id = _plan_id
      and p.kind = 'balance'
      and pp.included is not null
      and pp.included > 0
  loop
    insert into billing.ledger (organization_id, product_id, type, quantity)
    values (_organization_id, _pp.product_id, 'grant', _pp.included);
  end loop;
end;
$$;


ALTER FUNCTION "billing"."change_plan"("_organization_id" "uuid", "_plan_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "billing"."check_limit"("_organization_id" "uuid", "_product_id" "text", "_amount" numeric DEFAULT 1) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  _tier_id text;
  _kind text;
  _cap numeric;
  _interval text;
  _current numeric;
  _period date;
begin
  -- Get tier from subscription
  select s.tier_id into _tier_id
  from billing.subscriptions s
  where s.organization_id = _organization_id;

  -- No subscription = no billing = allow
  if not found then
    return true;
  end if;

  -- Get product kind
  select p.kind into _kind
  from billing.products p
  where p.id = _product_id;

  -- No product = no billing for this resource
  if not found then
    return true;
  end if;

  -- Get tier cap and interval
  select tp.cap, tp.interval
  into _cap, _interval
  from billing.tiers_products tp
  where tp.tier_id = _tier_id
    and tp.product_id = _product_id;

  -- No tier_product row = no limit for this product
  if not found then
    return true;
  end if;

  -- Cap is null = unlimited
  if _cap is null then
    return true;
  end if;

  -- Determine the period to check
  _period := case _interval
    when 'month' then date_trunc('month', current_date)::date
    when 'day' then current_date
    else '1970-01-01'::date
  end;

  -- Get current value
  select u.quantity into _current
  from billing.usage u
  where u.organization_id = _organization_id
    and u.product_id = _product_id
    and u.interval = _interval
    and u.period = _period;

  _current := coalesce(_current, 0);

  -- Balance products: cap is a floor (minimum allowed balance)
  -- e.g. cap=0 means no debt, cap=-5 allows up to $5 debt
  if _kind = 'balance' then
    if _current - _amount < _cap then
      raise exception 'Insufficient balance for %', _product_id;
    end if;
  else
    -- Counter/gauge: cap is a ceiling
    if _current + _amount > _cap then
      raise exception 'Usage limit reached for %', _product_id;
    end if;
  end if;

  return true;
end;
$_$;


ALTER FUNCTION "billing"."check_limit"("_organization_id" "uuid", "_product_id" "text", "_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "billing"."check_product_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform billing.check_limit(new.organization_id, tg_table_name);
  return new;
end;
$$;


ALTER FUNCTION "billing"."check_product_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "billing"."check_storage_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  _org_id uuid;
  _size_gb numeric;
begin
  _org_id := (string_to_array(new.name, '/'))[2]::uuid;
  _size_gb := coalesce((new.metadata->>'size')::numeric, 0) / 1000000000.0;

  perform billing.check_limit(_org_id, 'storage', _size_gb);
  return new;
end;
$$;


ALTER FUNCTION "billing"."check_storage_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "billing"."guard_ledger_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not exists (select 1 from billing.products where id = new.product_id) then
    return null;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "billing"."guard_ledger_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "billing"."initialize_subscription"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  _tier_id text;
  _plan_id text;
begin
  select t.id into _tier_id
  from billing.tiers t
  where t.active = true
  order by t.level asc
  limit 1;

  if not found then
    return new;
  end if;

  -- Create subscription with tier only
  insert into billing.subscriptions (organization_id, tier_id)
  values (new.id, _tier_id);

  -- Assign default plan if one exists
  select p.id into _plan_id
  from billing.plans p
  where p.is_default = true
    and p.active = true
  limit 1;

  if _plan_id is not null then
    perform billing.change_plan(new.id, _plan_id);
  end if;

  return new;
end;
$$;


ALTER FUNCTION "billing"."initialize_subscription"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "billing"."process_ledger_entry"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.billable is distinct from false then
    perform billing.update_usage(new.organization_id, new.product_id, new.quantity);
  end if;

  return new;
end;
$$;


ALTER FUNCTION "billing"."process_ledger_entry"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "billing"."update_product_usage"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  _kind text;
begin
  if tg_op = 'DELETE' then
    select p.kind into _kind
    from billing.products p
    where p.id = tg_table_name;

    if _kind = 'counter' then
      return old;
    end if;

    perform billing.update_usage(old.organization_id, tg_table_name, -1);
    return old;
  end if;

  perform billing.update_usage(new.organization_id, tg_table_name);
  return new;
end;
$$;


ALTER FUNCTION "billing"."update_product_usage"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "billing"."update_storage_usage"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  _org_id uuid;
  _size_gb numeric;
begin
  if tg_op = 'INSERT' then
    _org_id := (string_to_array(new.name, '/'))[2]::uuid;
    _size_gb := coalesce((new.metadata->>'size')::numeric, 0) / 1000000000.0;
    perform billing.update_usage(_org_id, 'storage', _size_gb);
    return new;
  elsif tg_op = 'DELETE' then
    _org_id := (string_to_array(old.name, '/'))[2]::uuid;
    -- Orphaned object: the org (and its billing rows) was already deleted and the
    -- storage-gc sweep is removing the leftover files. There is no usage to
    -- credit back, so skip accounting to avoid acting on a non-existent org.
    if not exists (select 1 from public.organizations where id = _org_id) then
      return old;
    end if;
    _size_gb := coalesce((old.metadata->>'size')::numeric, 0) / 1000000000.0;
    perform billing.update_usage(_org_id, 'storage', -_size_gb);
    return old;
  end if;

  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "billing"."update_storage_usage"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "billing"."update_usage"("_organization_id" "uuid", "_product_id" "text", "_quantity" numeric DEFAULT 1) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  _today date := current_date;
  _month date := date_trunc('month', current_date)::date;
begin
  -- No product = no billing for this resource
  if not exists (select 1 from billing.products where id = _product_id) then
    return;
  end if;

  -- Upsert day
  insert into billing.usage (organization_id, product_id, interval, period, quantity)
  values (_organization_id, _product_id, 'day', _today, _quantity)
  on conflict (organization_id, product_id, interval, period)
  do update set quantity = billing.usage.quantity + _quantity;

  -- Upsert month
  insert into billing.usage (organization_id, product_id, interval, period, quantity)
  values (_organization_id, _product_id, 'month', _month, _quantity)
  on conflict (organization_id, product_id, interval, period)
  do update set quantity = billing.usage.quantity + _quantity;

  -- Upsert lifetime
  insert into billing.usage (organization_id, product_id, interval, period, quantity)
  values (_organization_id, _product_id, 'lifetime', '1970-01-01', _quantity)
  on conflict (organization_id, product_id, interval, period)
  do update set quantity = billing.usage.quantity + _quantity;
end;
$$;


ALTER FUNCTION "billing"."update_usage"("_organization_id" "uuid", "_product_id" "text", "_quantity" numeric) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_acceptance_test_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "scenario_key" "text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "recipient_hash" "bytea",
    "recipient_last4" "text",
    "synthetic_label" "text" DEFAULT 'OmniRelay acceptance test'::"text" NOT NULL,
    "max_messages" integer DEFAULT 1 NOT NULL,
    "message_count" integer DEFAULT 0 NOT NULL,
    "expires_at" timestamp with time zone,
    "failure_summary" "text",
    "evidence_reference" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "started_at" timestamp with time zone,
    "lease_token" "uuid",
    "verified_message_id" "uuid",
    "subject_payment_id" "uuid",
    "checkout_url" "text",
    "dispatch_message_id" "uuid",
    "subject_acceptance_payment_id" "uuid",
    CONSTRAINT "whatsapp_acceptance_test_runs_max_messages_check" CHECK ((("max_messages" >= 1) AND ("max_messages" <= 3))),
    CONSTRAINT "whatsapp_acceptance_test_runs_message_count_check" CHECK (("message_count" >= 0)),
    CONSTRAINT "whatsapp_acceptance_test_runs_recipient_last4_check" CHECK ((("recipient_last4" IS NULL) OR ("recipient_last4" ~ '^[0-9]{4}$'::"text"))),
    CONSTRAINT "whatsapp_acceptance_test_runs_scenario_key_check" CHECK (("scenario_key" = ANY (ARRAY['deposit_payment'::"text", 'commands_handoff'::"text", 'abandoned_recovery'::"text"]))),
    CONSTRAINT "whatsapp_acceptance_test_runs_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'armed'::"text", 'running'::"text", 'passed'::"text", 'failed'::"text", 'cancelled'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."whatsapp_acceptance_test_runs" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."arm_whatsapp_acceptance_test"("p_organization_id" "uuid", "p_scenario_key" "text", "p_recipient_hash" "bytea", "p_recipient_last4" "text", "p_max_messages" integer DEFAULT 1) RETURNS "public"."whatsapp_acceptance_test_runs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare result public.whatsapp_acceptance_test_runs;
begin
  if p_scenario_key not in ('deposit_payment','commands_handoff','abandoned_recovery') or p_recipient_hash is null or p_recipient_last4 !~ '^[0-9]{4}$' or p_max_messages not between 1 and 3 then raise exception 'Invalid controlled test request' using errcode='22023'; end if;
  insert into public.whatsapp_acceptance_test_runs(organization_id,scenario_key,status,recipient_hash,recipient_last4,max_messages,message_count,expires_at,updated_at)
  values(p_organization_id,p_scenario_key,'armed',p_recipient_hash,p_recipient_last4,p_max_messages,0,now()+interval '30 minutes',now())
  on conflict(organization_id,scenario_key) do update set status='armed',recipient_hash=excluded.recipient_hash,recipient_last4=excluded.recipient_last4,max_messages=excluded.max_messages,message_count=0,expires_at=excluded.expires_at,failure_summary=null,evidence_reference=null,completed_at=null,updated_at=now()
  returning * into result; return result;
end; $_$;


ALTER FUNCTION "private"."arm_whatsapp_acceptance_test"("p_organization_id" "uuid", "p_scenario_key" "text", "p_recipient_hash" "bytea", "p_recipient_last4" "text", "p_max_messages" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."arm_whatsapp_acceptance_test_from_delivery"("p_organization_id" "uuid", "p_scenario_key" "text", "p_verified_message_id" "uuid", "p_max_messages" integer DEFAULT 1) RETURNS "public"."whatsapp_acceptance_test_runs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare verified_address text; safe_last4 text; result public.whatsapp_acceptance_test_runs;
begin
  if p_scenario_key not in ('deposit_payment','commands_handoff','abandoned_recovery') or p_max_messages not between 1 and 3 then
    raise exception 'Invalid controlled test request' using errcode='22023';
  end if;
  select m.contact_address into verified_address from public.messages m
  where m.id=p_verified_message_id and m.organization_id=p_organization_id
    and m.direction='outgoing' and m.service='whatsapp'
    and m.status ? 'delivered' and m.timestamp >= now()-interval '30 days';
  if verified_address is null then raise exception 'A recent delivered WhatsApp record is required' using errcode='22023'; end if;
  safe_last4:=right(regexp_replace(verified_address,'\D','','g'),4);
  if safe_last4 !~ '^[0-9]{4}$' then raise exception 'Verified recipient identity is invalid' using errcode='22023'; end if;
  insert into public.whatsapp_acceptance_test_runs(organization_id,scenario_key,status,recipient_hash,recipient_last4,verified_message_id,max_messages,message_count,expires_at,updated_at)
  values(p_organization_id,p_scenario_key,'armed',extensions.digest(regexp_replace(verified_address,'\D','','g'),'sha256'),safe_last4,p_verified_message_id,p_max_messages,0,now()+interval '30 minutes',now())
  on conflict(organization_id,scenario_key) do update set status='armed',recipient_hash=excluded.recipient_hash,recipient_last4=excluded.recipient_last4,verified_message_id=excluded.verified_message_id,max_messages=excluded.max_messages,message_count=0,expires_at=excluded.expires_at,failure_summary=null,evidence_reference=null,started_at=null,lease_token=null,completed_at=null,updated_at=now()
  returning * into result;
  return result;
end;
$_$;


ALTER FUNCTION "private"."arm_whatsapp_acceptance_test_from_delivery"("p_organization_id" "uuid", "p_scenario_key" "text", "p_verified_message_id" "uuid", "p_max_messages" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."attach_deposit_acceptance_payment"("p_run_id" "uuid", "p_lease_token" "uuid", "p_payment_id" "uuid") RETURNS "public"."whatsapp_acceptance_test_runs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare result public.whatsapp_acceptance_test_runs;
begin
  update public.whatsapp_acceptance_test_runs r
  set subject_payment_id=p_payment_id,updated_at=now()
  where r.id=p_run_id and r.scenario_key='deposit_payment'
    and r.status='running' and r.lease_token=p_lease_token
    and exists(select 1 from public.booking_payments p
      where p.id=p_payment_id and p.organization_id=r.organization_id
        and p.payment_mode='deposit_online'
        and p.status in ('pending','paid','failed','expired')
        and p.metadata->>'synthetic_acceptance'='true')
  returning * into result;
  if result.id is null then raise exception 'Deposit acceptance payment could not be attached' using errcode='P0001'; end if;
  return result;
end;
$$;


ALTER FUNCTION "private"."attach_deposit_acceptance_payment"("p_run_id" "uuid", "p_lease_token" "uuid", "p_payment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."attach_public_booking_identity_core"("p_booking_reference" "text", "p_manage_token" "text", "p_booking_contact_name" "text", "p_booking_contact_phone" "text", "p_patient_relationship" "text", "p_patient_date_of_birth" "date" DEFAULT NULL::"date") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_appointment_id uuid;
begin
  if p_patient_relationship not in ('self','child','parent','spouse','relative','other') then raise exception 'Choose a valid relationship'; end if;
  if length(trim(coalesce(p_booking_contact_name,'')))<2 then raise exception 'Booking contact name is required'; end if;
  if length(regexp_replace(coalesce(p_booking_contact_phone,''),'[^0-9]','','g'))<10 then raise exception 'Enter a valid booking contact mobile number'; end if;
  select c.appointment_id into v_appointment_id from private.customer_booking_access c
  where c.booking_reference=p_booking_reference
    and c.token_hash=extensions.digest(convert_to(p_manage_token,'UTF8'),'sha256');
  if v_appointment_id is null then raise exception 'Invalid booking access'; end if;
  update public.appointments set booking_contact_name=trim(p_booking_contact_name),booking_contact_phone=trim(p_booking_contact_phone),patient_relationship=p_patient_relationship,patient_date_of_birth=p_patient_date_of_birth where id=v_appointment_id;
end; $$;


ALTER FUNCTION "private"."attach_public_booking_identity_core"("p_booking_reference" "text", "p_manage_token" "text", "p_booking_contact_name" "text", "p_booking_contact_phone" "text", "p_patient_relationship" "text", "p_patient_date_of_birth" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."audit_patient_data_request"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare kind text; summary text;
begin
  if tg_op='INSERT' then kind:='submitted'; summary:='Patient data request submitted through '||new.source_channel||'.';
  elsif old.status is distinct from new.status then kind:='status_changed'; summary:='Request status changed from '||old.status||' to '||new.status||'.';
  else kind:='review_updated'; summary:='Retention or decision review updated.'; end if;
  insert into public.patient_data_request_events(organization_id,request_id,actor_user_id,event_type,from_status,to_status,safe_summary)
  values(new.organization_id,new.id,new.updated_by,kind,case when tg_op='UPDATE' then old.status end,new.status,summary);
  return new;
end $$;


ALTER FUNCTION "private"."audit_patient_data_request"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."audit_security_incident_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare event_kind text; event_summary text;
begin
  if tg_op = 'INSERT' then event_kind := 'created'; event_summary := 'Incident opened with severity ' || new.severity || '.';
  elsif old.status is distinct from new.status then event_kind := 'status_changed'; event_summary := 'Incident status changed from ' || old.status || ' to ' || new.status || '.';
  elsif old.owner_user_id is distinct from new.owner_user_id then event_kind := 'ownership_changed'; event_summary := 'Incident ownership changed.';
  else event_kind := 'details_updated'; event_summary := 'Incident details updated.'; end if;
  insert into public.security_incident_events (organization_id, incident_id, actor_user_id, event_type, from_status, to_status, safe_summary)
  values (new.organization_id, new.id, new.updated_by, event_kind, case when tg_op = 'UPDATE' then old.status else null end, new.status, event_summary);
  return new;
end;
$$;


ALTER FUNCTION "private"."audit_security_incident_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."authorize_prescription_medication_schedule"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.reminder_type = 'medication'
     and new.prescription_id is not null
     and new.prescription_item_id is not null then
    new.approval_mode := 'automatic';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."authorize_prescription_medication_schedule"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."cancel_customer_booking_core"("p_booking_reference" "text", "p_manage_token" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare appointment_uuid uuid; org_id uuid;
begin
  select ca.appointment_id,a.organization_id into appointment_uuid,org_id
  from private.customer_booking_access ca join public.appointments a on a.id=ca.appointment_id
  where ca.booking_reference=upper(trim(p_booking_reference))
    and ca.token_hash=extensions.digest(convert_to(p_manage_token,'UTF8'),'sha256')
    and a.status in ('pending','confirmed','rescheduling_required');
  if appointment_uuid is null then raise exception 'Booking cannot be cancelled'; end if;
  update public.appointments set status='cancelled',updated_at=now() where id=appointment_uuid;
  update public.reminder_events set status='cancelled',updated_at=now() where appointment_id=appointment_uuid and status='scheduled';
  insert into public.appointment_events(organization_id,appointment_id,event_type,actor_type) values(org_id,appointment_uuid,'cancelled','customer');
end;
$$;


ALTER FUNCTION "private"."cancel_customer_booking_core"("p_booking_reference" "text", "p_manage_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."cancel_whatsapp_acceptance_tests"("p_organization_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ declare affected integer; begin
  update public.whatsapp_acceptance_test_runs set status='cancelled',completed_at=now(),updated_at=now()
  where organization_id=p_organization_id and status in ('armed','running'); get diagnostics affected=row_count; return affected;
end; $$;


ALTER FUNCTION "private"."cancel_whatsapp_acceptance_tests"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."capture_care_reminder_response"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_response_text text;
  normalized text;
  v_response_kind text;
  matched_run public.care_reminder_runs%rowtype;
  matched_reminder public.care_reminders%rowtype;
  v_snoozed_until timestamptz;
begin
  if new.direction::text <> 'incoming' or new.service::text <> 'whatsapp' then return new; end if;

  v_response_text := btrim(coalesce(
    new.content->>'text',
    new.content#>>'{data,button_reply,title}',
    new.content#>>'{data,list_reply,title}',
    ''
  ));
  normalized := lower(regexp_replace(v_response_text, '[^a-z0-9]+', '', 'g'));
  v_response_kind := case
    when normalized in ('done','taken','yes','1') then 'confirmed'
    when normalized in ('skip','skipped','missed','no','2') then 'missed'
    when normalized in ('help','problem','unwell','3') then 'help'
    when normalized in ('snooze','later','remindme','4') then 'snoozed'
    else null
  end;
  if v_response_kind is null then return new; end if;

  select run.* into matched_run
  from public.care_reminder_runs run
  join public.care_reminders reminder on reminder.id = run.reminder_id
  join public.messages outbound on outbound.id::text = run.provider_response->>'message_id'
  where run.organization_id = new.organization_id
    and run.patient_id = reminder.patient_id
    and reminder.reminder_type in ('medication','follow_up','care','test')
    and outbound.conversation_id = new.conversation_id
    and outbound.direction::text = 'outgoing'
    and outbound.created_at >= now() - interval '48 hours'
    and run.response_received_at is null
    and run.status in ('sent','delivered','read')
  order by outbound.created_at desc
  limit 1;

  if matched_run.id is null then return new; end if;
  v_snoozed_until := case when v_response_kind = 'snoozed' then now() + interval '15 minutes' else null end;

  update public.care_reminder_runs
  set response_kind = v_response_kind,
      response_text = left(v_response_text, 500),
      response_received_at = coalesce(new.timestamp, new.created_at, now()),
      response_message_id = new.id,
      snoozed_until = v_snoozed_until,
      acknowledged_at = coalesce(acknowledged_at, now()),
      acknowledgement = case v_response_kind
        when 'confirmed' then 'Patient marked dose or care as taken'
        when 'missed' then 'Patient marked dose or care as skipped'
        when 'snoozed' then 'Patient snoozed reminder for 15 minutes'
        else 'Patient requested help via WhatsApp'
      end,
      updated_at = now()
  where id = matched_run.id;

  if v_response_kind = 'snoozed' then
    insert into public.care_reminder_runs (
      organization_id, reminder_id, patient_id, scheduled_for, channel,
      status, approved_by, approved_at, next_attempt_at
    ) values (
      matched_run.organization_id, matched_run.reminder_id, matched_run.patient_id,
      v_snoozed_until, matched_run.channel, 'approved', matched_run.approved_by,
      now(), v_snoozed_until
    ) on conflict (reminder_id, scheduled_for) do nothing;
  elsif v_response_kind in ('missed','help') then
    select * into matched_reminder from public.care_reminders where id = matched_run.reminder_id;
    insert into public.patient_care_tasks (
      organization_id, patient_id, encounter_id, care_plan_id, task_type, title,
      details, due_at, priority, status, created_by
    )
    select matched_run.organization_id, matched_run.patient_id, matched_reminder.encounter_id,
      matched_reminder.care_plan_id, 'call',
      case when v_response_kind = 'help' then 'Patient requested help after care reminder' else 'Review skipped patient medication or care' end,
      'Patient WhatsApp response: ' || left(v_response_text, 500) || E'\n\nReminder run: ' || matched_run.id::text,
      now(), case when v_response_kind = 'help' then 'urgent' else 'high' end, 'open', matched_reminder.created_by
    where not exists (
      select 1 from public.patient_care_tasks task
      where task.organization_id = matched_run.organization_id
        and task.details like '%' || matched_run.id::text || '%'
        and task.status in ('open','in_progress')
    );
  end if;

  return new;
end;
$$;


ALTER FUNCTION "private"."capture_care_reminder_response"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."capture_patient_consent_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  event_source text := coalesce(
    nullif(current_setting('omnirelay.consent_source', true), ''),
    case
      when tg_op = 'INSERT' then 'patient_created:' || coalesce(new.source, 'unknown')
      else 'patient_profile_sync'
    end
  );
  event_note text := nullif(current_setting('omnirelay.consent_note', true), '');
begin
  if tg_op = 'INSERT' or old.care_communications_consent is distinct from new.care_communications_consent then
    insert into public.patient_consent_events (
      organization_id,
      patient_id,
      consent_type,
      previous_status,
      new_status,
      source,
      captured_by,
      note
    ) values (
      new.organization_id,
      new.id,
      'care_communications',
      case when tg_op = 'INSERT' then null else old.care_communications_consent end,
      new.care_communications_consent,
      event_source,
      auth.uid(),
      event_note
    );
  end if;

  if tg_op = 'INSERT' or old.marketing_consent is distinct from new.marketing_consent then
    insert into public.patient_consent_events (
      organization_id,
      patient_id,
      consent_type,
      previous_status,
      new_status,
      source,
      captured_by,
      note
    ) values (
      new.organization_id,
      new.id,
      'marketing',
      case when tg_op = 'INSERT' then null else old.marketing_consent end,
      new.marketing_consent,
      event_source,
      auth.uid(),
      event_note
    );
  end if;

  return new;
end;
$$;


ALTER FUNCTION "private"."capture_patient_consent_changes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."capture_whatsapp_delivery_failure"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  provider_error jsonb;
  provider_code text;
  safe_message text;
  recent_failures integer;
begin
  if new.direction::text <> 'outgoing'
    or not (coalesce(new.status, '{}'::jsonb) ? 'failed')
    or (tg_op = 'UPDATE' and coalesce(old.status, '{}'::jsonb) ? 'failed') then
    return new;
  end if;

  provider_error := coalesce(new.status->'errors'->0->'error', new.status->'errors'->0, '{}'::jsonb);
  provider_code := left(coalesce(provider_error->>'code', 'provider_error'), 100);
  safe_message := case provider_code
    when '131047' then 'WhatsApp blocked a free-form reply because the 24-hour customer-service window is closed.'
    when '131030' then 'The recipient is not enabled for the connected Meta test number.'
    when '131026' then 'WhatsApp could not deliver to the recipient.'
    when '131042' then 'The WhatsApp Business billing setup needs attention.'
    when '131048' then 'Meta temporarily limited message activity for sender quality protection.'
    when '131049' then 'Meta delivery pacing temporarily withheld the message.'
    when '130429' then 'The WhatsApp Cloud API rate limit was reached.'
    when '80007' then 'The Meta business account rate limit was reached.'
    when '132000' then 'The approved template variable count does not match.'
    when '132001' then 'The approved template or language was not found.'
    when '132012' then 'A template parameter does not match the approved format.'
    when '190' then 'The connected Meta access token is invalid or expired.'
    when '10' then 'The connected Meta account is missing a required permission.'
    when '200' then 'The connected Meta account is missing a required permission.'
    when '100' then 'Meta rejected an invalid recipient or template field.'
    else 'Meta returned a WhatsApp delivery error that needs staff review.'
  end;

  insert into public.operational_events (
    organization_id, event_source, severity, error_code, safe_message, metadata
  ) values (
    new.organization_id,
    'whatsapp_delivery',
    case when provider_code in ('190','10','200','131042') then 'critical' else 'error' end,
    provider_code,
    safe_message,
    jsonb_build_object('message_id', new.id, 'conversation_id', new.conversation_id, 'provider_code', provider_code)
  ) on conflict do nothing;

  select count(*) into recent_failures
  from public.operational_events e
  where e.organization_id = new.organization_id
    and e.event_source = 'whatsapp_delivery'
    and e.created_at >= now() - interval '15 minutes';

  if recent_failures >= 3 then
    insert into public.app_notifications (
      organization_id, recipient_user_id, notification_type, title, body,
      href, entity_type, entity_id
    )
    select
      new.organization_id,
      a.user_id,
      'system',
      'Repeated WhatsApp delivery failures',
      recent_failures || ' delivery failures were recorded in the last 15 minutes. Review provider diagnostics before retrying.',
      '/app/operations',
      'whatsapp_delivery_cluster',
      new.id
    from public.agents a
    where a.organization_id = new.organization_id
      and a.ai = false
      and a.user_id is not null
      and coalesce(a.extra->>'role', 'member') in ('owner','admin')
      and coalesce(a.extra->>'status', 'active') <> 'inactive'
      and not exists (
        select 1 from public.app_notifications n
        where n.organization_id = new.organization_id
          and n.recipient_user_id = a.user_id
          and n.entity_type = 'whatsapp_delivery_cluster'
          and n.created_at >= now() - interval '1 hour'
      );
  end if;

  return new;
end;
$$;


ALTER FUNCTION "private"."capture_whatsapp_delivery_failure"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."capture_whatsapp_opt_out"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  normalized_text text;
  matched_patient uuid;
begin
  if new.direction <> 'incoming' or new.service <> 'whatsapp' then return new; end if;
  normalized_text := lower(trim(coalesce(new.content->>'text', '')));
  if normalized_text not in ('stop','unsubscribe','cancel subscription','opt out','opt-out') then return new; end if;

  select id into matched_patient
  from public.patient_profiles
  where organization_id = new.organization_id
    and regexp_replace(coalesce(phone,''), '\D', '', 'g') = regexp_replace(new.contact_address, '\D', '', 'g')
  order by updated_at desc limit 1;

  insert into public.communication_opt_outs(organization_id,patient_id,channel,address,scope,source,reason)
  values(new.organization_id,matched_patient,'whatsapp',regexp_replace(new.contact_address,'\D','','g'),'all','whatsapp_keyword','Customer sent ' || upper(normalized_text))
  on conflict(organization_id,channel,address,scope)
  do update set opted_out_at=now(),reason=excluded.reason,patient_id=coalesce(excluded.patient_id,public.communication_opt_outs.patient_id);

  if matched_patient is not null then
    update public.patient_profiles set care_communications_consent=false,marketing_consent=false,updated_at=now() where id=matched_patient;
  end if;

  update public.campaign_recipients
  set status='opted_out',failure_reason='Customer opted out on WhatsApp.',updated_at=now()
  where organization_id=new.organization_id
    and regexp_replace(recipient_address,'\D','','g')=regexp_replace(new.contact_address,'\D','','g')
    and status in ('pending','approved','queued');
  return new;
end;
$$;


ALTER FUNCTION "private"."capture_whatsapp_opt_out"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."automation_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "workflow_id" "uuid" NOT NULL,
    "trigger_key" "text" NOT NULL,
    "idempotency_key" "text" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "max_attempts" integer DEFAULT 3 NOT NULL,
    "next_attempt_at" timestamp with time zone,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "failure_code" "text",
    "failure_summary" "text",
    "provider_execution_id" "text",
    "safe_context" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source_type" "text",
    "source_id" "uuid",
    "observed_message_id" "uuid",
    "delivery_status" "text",
    CONSTRAINT "automation_runs_attempt_count_check" CHECK (("attempt_count" >= 0)),
    CONSTRAINT "automation_runs_delivery_status_check" CHECK (("delivery_status" = ANY (ARRAY['observed'::"text", 'accepted'::"text", 'sent'::"text", 'delivered'::"text", 'read'::"text", 'failed'::"text"]))),
    CONSTRAINT "automation_runs_failure_summary_check" CHECK ((("failure_summary" IS NULL) OR ("char_length"("failure_summary") <= 500))),
    CONSTRAINT "automation_runs_max_attempts_check" CHECK ((("max_attempts" >= 1) AND ("max_attempts" <= 10))),
    CONSTRAINT "automation_runs_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'processing'::"text", 'succeeded'::"text", 'retrying'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."automation_runs" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."claim_due_automation_runs"("p_limit" integer DEFAULT 20) RETURNS SETOF "public"."automation_runs"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  with due as (
    select r.id from public.automation_runs r join public.automation_workflows w on w.id=r.workflow_id
    where r.status in ('queued','retrying') and coalesce(r.next_attempt_at,r.created_at)<=now() and w.status='active'
    order by coalesce(r.next_attempt_at,r.created_at),r.created_at for update of r skip locked
    limit greatest(1,least(p_limit,100))
  )
  update public.automation_runs r set status='processing',attempt_count=r.attempt_count+1,started_at=now(),updated_at=now()
  from due where r.id=due.id returning r.*;
$$;


ALTER FUNCTION "private"."claim_due_automation_runs"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."claim_due_device_push_deliveries"("p_limit" integer DEFAULT 20) RETURNS TABLE("delivery_id" "uuid", "subscription_id" "uuid", "endpoint" "text", "p256dh_key" "text", "auth_key" "text", "title" "text", "body" "text", "href" "text", "notification_id" "uuid", "attempts" integer, "max_attempts" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private'
    AS $$
begin
  return query
  with claimed as (
    select d.id
    from public.device_push_deliveries d
    join public.device_push_subscriptions s on s.id = d.subscription_id and s.status = 'active'
    where d.status = 'queued' and d.next_attempt_at <= now()
    order by d.next_attempt_at, d.created_at
    for update of d skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 50))
  ), updated as (
    update public.device_push_deliveries d
    set status = 'processing', attempts = d.attempts + 1, claimed_at = now(), updated_at = now()
    from claimed c where d.id = c.id
    returning d.*
  )
  select u.id, s.id, s.endpoint, s.p256dh_key, s.auth_key,
    n.title, coalesce(n.body, ''), coalesce(n.href, '/app/action-centre'), n.id, u.attempts, u.max_attempts
  from updated u
  join public.device_push_subscriptions s on s.id = u.subscription_id
  join public.app_notifications n on n.id = u.notification_id;
end;
$$;


ALTER FUNCTION "private"."claim_due_device_push_deliveries"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."claim_whatsapp_acceptance_test"("p_organization_id" "uuid", "p_scenario_key" "text") RETURNS "public"."whatsapp_acceptance_test_runs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ declare result public.whatsapp_acceptance_test_runs; begin
  update public.whatsapp_acceptance_test_runs set status='expired',completed_at=now(),updated_at=now() where organization_id=p_organization_id and status='armed' and expires_at<=now();
  update public.whatsapp_acceptance_test_runs set status='running',message_count=message_count+1,started_at=now(),lease_token=gen_random_uuid(),updated_at=now() where organization_id=p_organization_id and scenario_key=p_scenario_key and status='armed' and expires_at>now() and message_count<max_messages returning * into result;
  if result.id is null then raise exception 'Controlled test is not armed or has reached its message limit' using errcode='P0002'; end if;
  insert into public.whatsapp_acceptance_test_events(organization_id,run_id,scenario_key,event_type,safe_summary) values(result.organization_id,result.id,result.scenario_key,'claimed','Controlled synthetic test claimed within its bounded lease.'); return result;
end; $$;


ALTER FUNCTION "private"."claim_whatsapp_acceptance_test"("p_organization_id" "uuid", "p_scenario_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."complete_whatsapp_acceptance_test"("p_run_id" "uuid", "p_lease_token" "uuid", "p_passed" boolean, "p_evidence_reference" "text", "p_failure_summary" "text" DEFAULT NULL::"text") RETURNS "public"."whatsapp_acceptance_test_runs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ declare result public.whatsapp_acceptance_test_runs;gate_key text;summary text; begin
  update public.whatsapp_acceptance_test_runs set status=case when p_passed then 'passed' else 'failed' end,evidence_reference=left(nullif(trim(p_evidence_reference),''),200),failure_summary=case when p_passed then null else left(coalesce(nullif(trim(p_failure_summary),''),'Controlled test failed.'),500) end,completed_at=now(),lease_token=null,updated_at=now() where id=p_run_id and status='running' and lease_token=p_lease_token and message_count<=max_messages returning * into result;
  if result.id is null then raise exception 'Controlled test lease is invalid or already completed' using errcode='P0002'; end if;
  gate_key:=case result.scenario_key when 'deposit_payment' then 'payments' when 'commands_handoff' then 'reminders_commands_handoff' when 'abandoned_recovery' then 'abandoned_recovery' end;
  summary:=case when p_passed then 'Controlled synthetic '||replace(result.scenario_key,'_',' ')||' test passed.' else result.failure_summary end;
  perform private.record_whatsapp_booking_acceptance(result.organization_id,gate_key,case when p_passed then 'passed' else 'failed' end,'controlled_channel',summary,result.evidence_reference);
  insert into public.whatsapp_acceptance_test_events(organization_id,run_id,scenario_key,event_type,safe_summary) values(result.organization_id,result.id,result.scenario_key,case when p_passed then 'passed' else 'failed' end,summary); return result;
end; $$;


ALTER FUNCTION "private"."complete_whatsapp_acceptance_test"("p_run_id" "uuid", "p_lease_token" "uuid", "p_passed" boolean, "p_evidence_reference" "text", "p_failure_summary" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."consume_public_request_limit"("p_bucket" "text", "p_scope" "text", "p_limit" integer, "p_window_seconds" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  claims jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  headers jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  caller_role text;
  client_signal text;
  pepper text;
  digest_hex text;
  actor_id uuid;
  window_start timestamptz;
  current_hits integer;
begin
  caller_role := claims ->> 'role';

  -- Direct trusted database work and service-role workers are not public
  -- requests. Public PostgREST calls carry anon/authenticated JWT claims.
  if caller_role is null or caller_role = 'service_role' then
    return;
  end if;

  if p_bucket not in (
      'public_booking_page',
      'public_booking_slots',
      'public_booking_manage_lookup',
      'public_booking_identity',
      'public_booking_cancel',
      'public_booking_reschedule'
    )
    or p_limit < 1 or p_limit > 500
    or p_window_seconds < 60 or p_window_seconds > 3600
    or nullif(trim(coalesce(p_scope, '')), '') is null then
    raise exception 'Invalid public request limit';
  end if;

  client_signal := coalesce(
    nullif(headers ->> 'cf-connecting-ip', ''),
    nullif(headers ->> 'x-real-ip', ''),
    nullif(split_part(coalesce(headers ->> 'x-forwarded-for', ''), ',', 1), ''),
    'unavailable'
  );

  select decrypted_secret into pepper
  from vault.decrypted_secrets
  where name = 'edge_functions_token'
  limit 1;
  if nullif(pepper, '') is null then
    raise exception 'Public request protection is temporarily unavailable';
  end if;

  digest_hex := encode(
    extensions.hmac(
      p_bucket || '|' || lower(trim(p_scope)) || '|' || trim(client_signal),
      pepper,
      'sha256'
    ),
    'hex'
  );
  actor_id := (
    substr(digest_hex, 1, 8) || '-' ||
    substr(digest_hex, 9, 4) || '-' ||
    substr(digest_hex, 13, 4) || '-' ||
    substr(digest_hex, 17, 4) || '-' ||
    substr(digest_hex, 21, 12)
  )::uuid;
  window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into private.api_rate_limits(actor_user_id, bucket, window_started_at)
  values(actor_id, p_bucket, window_start)
  on conflict(actor_user_id, bucket, window_started_at)
  do update set hit_count = private.api_rate_limits.hit_count + 1, updated_at = now()
  returning hit_count into current_hits;

  if current_hits > p_limit then
    raise exception 'Too many requests. Please wait before trying again.';
  end if;
end;
$$;


ALTER FUNCTION "private"."consume_public_request_limit"("p_bucket" "text", "p_scope" "text", "p_limit" integer, "p_window_seconds" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "private"."consume_public_request_limit"("p_bucket" "text", "p_scope" "text", "p_limit" integer, "p_window_seconds" integer) IS 'Pseudonymous rate limiter for public booking reads and manage-token actions; stores HMAC-derived identifiers only.';



CREATE OR REPLACE FUNCTION "private"."dispatch_whatsapp_concierge_job"("p_dispatch_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  dispatch_row public.whatsapp_concierge_dispatches%rowtype;
  new_request_id bigint;
begin
  select * into dispatch_row
  from public.whatsapp_concierge_dispatches
  where id = p_dispatch_id and status = 'pending'
  for update skip locked;

  if not found or dispatch_row.attempts >= 3 then
    return;
  end if;

  new_request_id := net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_url') || '/whatsapp-booking-concierge',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_token')
    ),
    body := jsonb_build_object('message_id', dispatch_row.message_id),
    timeout_milliseconds := 10000
  );

  update public.whatsapp_concierge_dispatches
  set attempts = attempts + 1,
      request_id = new_request_id,
      next_attempt_at = now() + make_interval(secs => 15 * (2 ^ attempts)::integer),
      last_error = null,
      updated_at = now()
  where id = p_dispatch_id;
exception when others then
  update public.whatsapp_concierge_dispatches
  set last_error = left(sqlerrm, 500),
      next_attempt_at = now() + interval '15 seconds',
      updated_at = now()
  where id = p_dispatch_id;
end;
$$;


ALTER FUNCTION "private"."dispatch_whatsapp_concierge_job"("p_dispatch_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."enforce_assignee_task_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if not private.is_organization_member(new.organization_id, 'admin') then
    if old.assigned_to is distinct from (select auth.uid())
      or new.assigned_to is distinct from old.assigned_to
      or new.organization_id is distinct from old.organization_id
      or new.patient_id is distinct from old.patient_id
      or new.encounter_id is distinct from old.encounter_id
      or new.appointment_id is distinct from old.appointment_id
      or new.task_type is distinct from old.task_type
      or new.title is distinct from old.title
      or new.details is distinct from old.details
      or new.due_at is distinct from old.due_at
      or new.priority is distinct from old.priority
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at then
      raise exception 'assignees may only change task status';
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."enforce_assignee_task_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."enforce_public_booking_rate_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  claims jsonb;
  caller_role text;
  normalized_phone text;
  contact_identity text;
  pepper text;
  digest_hex text;
  contact_actor uuid;
  contact_window timestamptz;
  organization_window timestamptz;
  current_hits integer;
begin
  if new.source is distinct from 'web'
     or new.status not in ('confirmed', 'payment_pending') then
    return new;
  end if;

  claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  caller_role := claims->>'role';

  if caller_role is null or caller_role = 'service_role' then
    return new;
  end if;

  normalized_phone := private.normalize_phone_identity(new.customer_phone);
  contact_identity := coalesce(
    nullif(normalized_phone, ''),
    nullif(lower(trim(coalesce(new.customer_email, ''))), '')
  );
  if contact_identity is null then
    raise exception 'A valid mobile number or email is required';
  end if;

  select decrypted_secret into pepper
  from vault.decrypted_secrets
  where name = 'edge_functions_token'
  limit 1;
  if nullif(pepper, '') is null then
    raise exception 'Public booking protection is temporarily unavailable';
  end if;

  digest_hex := encode(
    extensions.hmac(
      new.organization_id::text || '|' || contact_identity,
      pepper,
      'sha256'
    ),
    'hex'
  );
  contact_actor := (
    substr(digest_hex, 1, 8) || '-' ||
    substr(digest_hex, 9, 4) || '-' ||
    substr(digest_hex, 13, 4) || '-' ||
    substr(digest_hex, 17, 4) || '-' ||
    substr(digest_hex, 21, 12)
  )::uuid;

  contact_window := date_trunc('hour', now());
  insert into private.api_rate_limits (
    actor_user_id, bucket, window_started_at
  ) values (
    contact_actor, 'public_booking_contact', contact_window
  )
  on conflict (actor_user_id, bucket, window_started_at)
  do update set
    hit_count = private.api_rate_limits.hit_count + 1,
    updated_at = now()
  returning hit_count into current_hits;

  if current_hits > 5 then
    raise exception 'Too many booking attempts. Please wait before trying again.';
  end if;

  organization_window := to_timestamp(
    floor(extract(epoch from now()) / 600) * 600
  );
  insert into private.api_rate_limits (
    actor_user_id, bucket, window_started_at
  ) values (
    new.organization_id, 'public_booking_organization', organization_window
  )
  on conflict (actor_user_id, bucket, window_started_at)
  do update set
    hit_count = private.api_rate_limits.hit_count + 1,
    updated_at = now()
  returning hit_count into current_hits;

  if current_hits > 60 then
    raise exception 'This booking page is receiving unusually high traffic. Please try again shortly.';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "private"."enforce_public_booking_rate_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."enqueue_automation_event"("p_organization_id" "uuid", "p_trigger_key" "text", "p_event_key" "text", "p_safe_context" "jsonb" DEFAULT '{}'::"jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$ declare inserted_count integer; begin
 insert into public.automation_runs(organization_id,workflow_id,trigger_key,idempotency_key,status,max_attempts,next_attempt_at,completed_at,safe_context,source_type,source_id,delivery_status)
 select w.organization_id,w.id,w.trigger_key,p_trigger_key||':'||p_event_key,case when w.configuration->>'execution_mode'='observe' then 'succeeded' else 'queued' end,w.max_attempts,case when w.configuration->>'execution_mode'='observe' then null else now() end,case when w.configuration->>'execution_mode'='observe' then now() else null end,coalesce(p_safe_context,'{}'::jsonb)||jsonb_build_object('execution_mode',coalesce(w.configuration->>'execution_mode','managed')),nullif(p_safe_context->>'source',''),case when coalesce(p_safe_context->>'source_id','')~*'^[0-9a-f-]{36}$' then (p_safe_context->>'source_id')::uuid else null end,case when w.configuration->>'execution_mode'='observe' then 'observed' else null end
 from public.automation_workflows w where w.organization_id=p_organization_id and w.trigger_key=p_trigger_key and w.status='active'
 on conflict(organization_id,idempotency_key) do nothing; get diagnostics inserted_count=row_count; return inserted_count; end $_$;


ALTER FUNCTION "private"."enqueue_automation_event"("p_organization_id" "uuid", "p_trigger_key" "text", "p_event_key" "text", "p_safe_context" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."escalate_failed_care_plan_reminder"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  linked_reminder public.care_reminders%rowtype;
begin
  if new.status <> 'failed' or new.attempt_count < new.max_attempts then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'failed' and old.attempt_count = new.attempt_count then
    return new;
  end if;

  select * into linked_reminder
  from public.care_reminders
  where id = new.reminder_id and care_plan_id is not null;

  if linked_reminder.id is null then return new; end if;

  update public.patient_care_tasks
    set task_type = 'call',
        title = left('Resolve failed patient reminder: ' || linked_reminder.title, 160),
        details = concat_ws(E'\n\n', linked_reminder.instructions, 'Delivery failure: ' || coalesce(new.failure_reason, 'Unknown provider failure.')),
        due_at = now(),
        priority = 'high',
        status = 'open',
        completed_by = null,
        completed_at = null,
        updated_at = now()
    where care_plan_id = linked_reminder.care_plan_id;

  return new;
end;
$$;


ALTER FUNCTION "private"."escalate_failed_care_plan_reminder"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."expire_stale_payment_holds"("p_resource_id" "uuid" DEFAULT NULL::"uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare affected integer;
begin
  update public.booking_payments p
  set status='expired',updated_at=now()
  from public.appointments a
  where p.appointment_id=a.id
    and p.status='created'
    and a.status='payment_pending'
    and a.hold_expires_at<=now()
    and (p_resource_id is null or a.resource_id=p_resource_id);
  update public.appointments
  set status='cancelled',payment_status='failed',updated_at=now()
  where status='payment_pending' and hold_expires_at<=now()
    and (p_resource_id is null or resource_id=p_resource_id);
  get diagnostics affected=row_count;
  return affected;
end;
$$;


ALTER FUNCTION "private"."expire_stale_payment_holds"("p_resource_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."expire_waitlist_offers"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_offer public.waitlist_offers%rowtype;
  v_count integer := 0;
begin
  for v_offer in
    select * from public.waitlist_offers
    where status='pending' and expires_at<=now()
    order by expires_at for update skip locked
  loop
    update public.waitlist_offers set status='expired',responded_at=now(),updated_at=now() where id=v_offer.id;
    update public.appointment_waitlist set status='expired',offer_expires_at=null,updated_at=now() where id=v_offer.waitlist_id;
    perform private.queue_waitlist_offer(v_offer.organization_id,v_offer.service_id,v_offer.location_id,v_offer.resource_id,v_offer.starts_at,v_offer.ends_at);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;


ALTER FUNCTION "private"."expire_waitlist_offers"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_customer_booking_core"("p_booking_reference" "text", "p_manage_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare result jsonb;
begin
  select jsonb_build_object(
    'booking_reference',ca.booking_reference,'slug',bp.slug,'appointment_id',a.id,
    'resource_id',a.resource_id,'location_id',a.location_id,'service_id',a.service_id,
    'customer_name',a.customer_name,'customer_phone',a.customer_phone,'customer_email',a.customer_email,
    'starts_at',a.starts_at,'ends_at',a.ends_at,'status',a.status,'notes',a.notes,
    'service',s.name,'location',l.name,'location_address',l.address,'provider',r.name,
    'business',coalesce(op.business_name,o.name),'timezone',r.timezone)
  into result
  from private.customer_booking_access ca
  join public.appointments a on a.id=ca.appointment_id
  join public.booking_pages bp on bp.organization_id=a.organization_id
  join public.organization_services s on s.id=a.service_id
  join public.business_locations l on l.id=a.location_id
  join public.booking_resources r on r.id=a.resource_id
  join public.organizations o on o.id=a.organization_id
  left join public.onboarding_profiles op on op.organization_id=o.id
  where ca.booking_reference=upper(trim(p_booking_reference))
    and ca.token_hash=extensions.digest(convert_to(p_manage_token,'UTF8'),'sha256');
  if result is null then raise exception 'Booking link is invalid or expired'; end if;
  return result;
end;$$;


ALTER FUNCTION "private"."get_customer_booking_core"("p_booking_reference" "text", "p_manage_token" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "private"."get_customer_booking_core"("p_booking_reference" "text", "p_manage_token" "text") IS 'Intentional patient self-service RPC protected by booking reference plus hashed high-entropy manage token.';



CREATE OR REPLACE FUNCTION "private"."get_public_booking_page_core"("p_slug" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare result jsonb;
begin
  select jsonb_build_object(
    'slug',bp.slug,'headline',bp.headline,'description',coalesce(bp.description,op.description),'accent_color',bp.accent_color,
    'business',jsonb_build_object('name',coalesce(op.business_name,o.name),'category',op.business_category,'phone',op.primary_phone,'email',op.email,'timezone',coalesce(op.timezone,'Asia/Kolkata')),
    'locations',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'type',l.location_type,'address',l.address,'phone',l.phone,'timezone',l.timezone) order by l.created_at) from public.business_locations l where l.organization_id=o.id and l.active),'[]'::jsonb),
    'services',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'description',s.description,'duration_minutes',s.duration_minutes,'buffer_minutes',s.buffer_minutes,'price_paise',s.price_paise,'currency',s.currency) order by s.created_at) from public.organization_services s where s.organization_id=o.id and s.active and s.booking_enabled),'[]'::jsonb),
    'resources',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'type',r.resource_type,'location_id',r.location_id,'timezone',r.timezone,'photo_path',pp.photo_path,'specialization',pp.specialization,'qualifications',pp.qualifications,'experience_years',pp.experience_years,'languages',pp.languages,'biography',pp.biography) order by r.created_at) from public.booking_resources r left join public.provider_profiles pp on pp.resource_id=r.id where r.organization_id=o.id and r.active),'[]'::jsonb),
    'payments_enabled',exists(select 1 from public.payment_gateway_connections g where g.organization_id=o.id and g.provider='razorpay' and g.status in ('test','live')),
    'assignments',coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'resource_id',a.resource_id,'location_id',a.location_id,'effective_from',a.effective_from,'effective_to',a.effective_to,'booking_window_days',a.booking_window_days,
      'services',coalesce((select jsonb_agg(jsonb_build_object(
        'service_id',x.service_id,'duration_minutes',coalesce(x.duration_minutes,s.duration_minutes),'buffer_minutes',coalesce(x.buffer_minutes,s.buffer_minutes),
        'price_paise',coalesce(x.price_paise,s.price_paise),'payment_mode',x.payment_mode,'allowed_payment_modes',x.allowed_payment_modes,'deposit_paise',x.deposit_paise
      )) from public.provider_location_services x join public.organization_services s on s.id=x.service_id where x.assignment_id=a.id and x.active),'[]'::jsonb)
    ) order by a.created_at) from public.provider_location_assignments a where a.organization_id=o.id and a.active),'[]'::jsonb)
  ) into result
  from public.booking_pages bp join public.organizations o on o.id=bp.organization_id left join public.onboarding_profiles op on op.organization_id=o.id
  where bp.slug=lower(trim(p_slug)) and bp.active;
  if result is null then raise exception 'Booking page not found'; end if;
  return result;
end;
$$;


ALTER FUNCTION "private"."get_public_booking_page_core"("p_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_public_booking_slots_core"("p_slug" "text", "p_service_id" "uuid", "p_location_id" "uuid", "p_resource_id" "uuid", "p_date" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  org_id uuid;service_duration int;service_buffer int;rule record;resource_tz text;
  cursor_time timestamp;end_local timestamp;slot_start timestamptz;result jsonb:='[]'::jsonb;
  v_assignment_id uuid;window_days int;exact_rules boolean;
begin
  select organization_id into org_id from public.booking_pages where slug=lower(trim(p_slug)) and active;
  if org_id is null then raise exception 'Booking page not found'; end if;
  select a.id,a.booking_window_days into v_assignment_id,window_days from public.provider_location_assignments a
  where a.organization_id=org_id and a.resource_id=p_resource_id and a.location_id=p_location_id and a.active and p_date>=a.effective_from and (a.effective_to is null or p_date<=a.effective_to);
  if v_assignment_id is null then return result; end if;
  if p_date<(now() at time zone 'Asia/Kolkata')::date or p_date>(now() at time zone 'Asia/Kolkata')::date+window_days then raise exception 'Date is outside the booking window'; end if;
  select coalesce(x.duration_minutes,s.duration_minutes),coalesce(x.buffer_minutes,s.buffer_minutes) into service_duration,service_buffer
  from public.provider_location_services x join public.organization_services s on s.id=x.service_id
  where x.assignment_id=v_assignment_id and x.service_id=p_service_id and x.active and s.active and s.booking_enabled;
  select timezone into resource_tz from public.booking_resources where id=p_resource_id and organization_id=org_id and active;
  if service_duration is null or resource_tz is null then raise exception 'Invalid booking selection'; end if;
  exact_rules:=exists(select 1 from public.availability_rules where organization_id=org_id and resource_id=p_resource_id and location_id=p_location_id and active and weekday=extract(dow from p_date)::int and (effective_from is null or p_date>=effective_from) and (effective_to is null or p_date<=effective_to));
  for rule in select * from public.availability_rules where organization_id=org_id and resource_id=p_resource_id and active and weekday=extract(dow from p_date)::int
    and ((exact_rules and location_id=p_location_id) or (not exact_rules and location_id is null))
    and (effective_from is null or p_date>=effective_from) and (effective_to is null or p_date<=effective_to) order by start_time
  loop
    cursor_time:=p_date+rule.start_time;end_local:=p_date+rule.end_time;
    while cursor_time+make_interval(mins=>service_duration+service_buffer)<=end_local loop
      slot_start:=cursor_time at time zone resource_tz;
      if slot_start>now()
        and not exists(select 1 from public.appointments a where a.resource_id=p_resource_id
          and (a.status in ('pending','confirmed') or (a.status='payment_pending' and a.hold_expires_at>now()))
          and tstzrange(a.starts_at,a.ends_at,'[)')&&tstzrange(slot_start,slot_start+make_interval(mins=>service_duration+service_buffer),'[)'))
        and not exists(select 1 from public.schedule_exceptions e where e.organization_id=org_id and e.status='active' and (e.resource_id is null or e.resource_id=p_resource_id) and (e.location_id is null or e.location_id=p_location_id) and tstzrange(e.starts_at,e.ends_at,'[)')&&tstzrange(slot_start,slot_start+make_interval(mins=>service_duration+service_buffer),'[)'))
      then result:=result||jsonb_build_array(jsonb_build_object('starts_at',slot_start,'label',to_char(cursor_time,'HH12:MI AM')));end if;
      cursor_time:=cursor_time+make_interval(mins=>rule.slot_interval_minutes);
    end loop;
  end loop;
  return result;
end;
$$;


ALTER FUNCTION "private"."get_public_booking_slots_core"("p_slug" "text", "p_service_id" "uuid", "p_location_id" "uuid", "p_resource_id" "uuid", "p_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."initialize_booking_defaults"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ declare resource_id uuid; begin insert into public.booking_resources (organization_id,name,resource_type,timezone) values (new.id,'Primary provider',case when new.extra->>'business_category'='Healthcare' then 'doctor' else 'staff' end,coalesce(new.extra->>'timezone','Asia/Kolkata')) on conflict (organization_id,name) do update set updated_at=now() returning id into resource_id; insert into public.availability_rules (organization_id,resource_id,weekday,start_time,end_time) select new.id,resource_id,weekday,'09:00'::time,'18:00'::time from generate_series(1,6) as weekday on conflict do nothing; return new; end; $$;


ALTER FUNCTION "private"."initialize_booking_defaults"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."initialize_omnirelay_workspace"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  business_category text := coalesce(new.extra->>'business_category', 'Other');
  location_count integer := greatest(1, least(coalesce((new.extra->>'location_count')::integer, 1), 5));
  workspace_timezone text := coalesce(new.extra->>'timezone', 'Asia/Kolkata');
  inferred_location_type text;
  starter_service_name text;
  location_label text;
begin
  inferred_location_type := case when business_category = 'Healthcare' then 'chamber' when business_category = 'Restaurants & hospitality' then 'restaurant' else 'branch' end;
  starter_service_name := case business_category
    when 'Healthcare' then 'Consultation'
    when 'Restaurants & hospitality' then 'Reservation'
    when 'Coaching & education' then 'Counselling session'
    when 'Beauty & wellness' then 'Service appointment'
    when 'Real estate' then 'Property consultation'
    when 'Automotive services' then 'Service booking'
    when 'Home services' then 'Service visit'
    else 'Discovery call'
  end;
  location_label := case business_category when 'Healthcare' then 'Chamber' when 'Restaurants & hospitality' then 'Restaurant' when 'Coaching & education' then 'Centre' when 'Beauty & wellness' then 'Outlet' else 'Location' end;

  insert into public.onboarding_profiles (organization_id, business_category, business_name, timezone, services_offered)
  values (new.id, business_category, new.name, workspace_timezone, jsonb_build_array(starter_service_name))
  on conflict (organization_id) do nothing;

  insert into public.business_locations (organization_id, name, location_type, timezone, created_by)
  select new.id, location_label || ' ' || series_number, inferred_location_type, workspace_timezone, (select auth.uid())
  from generate_series(1, location_count) as series_number
  on conflict (organization_id, name) do nothing;

  insert into public.organization_services (organization_id, name, service_type, duration_minutes)
  values (new.id, starter_service_name, lower(replace(business_category, ' ', '_')), case when business_category = 'Restaurants & hospitality' then 90 else 30 end)
  on conflict (organization_id, name) do nothing;

  insert into public.entitlements (organization_id, plan_id, max_workspaces, max_seats, conversations_quota, channels, features, white_label, status, trial_started_at, trial_ends_at)
  values (new.id, 'launch', 1, 2, 500, '["whatsapp"]'::jsonb, '["appointments","basic_rag","starter_workflows"]'::jsonb, false, 'trialing', now(), now() + interval '7 days')
  on conflict (organization_id) do nothing;
  return new;
end;
$$;


ALTER FUNCTION "private"."initialize_omnirelay_workspace"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."initialize_operational_billing_workspace"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into public.operational_billing_settings(organization_id) values(new.id) on conflict do nothing;
  insert into public.operational_wallets(organization_id) values(new.id) on conflict do nothing;
  return new;
end;
$$;


ALTER FUNCTION "private"."initialize_operational_billing_workspace"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."invoke_whatsapp_agent_harness"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_binding_id uuid;
  v_dispatch_id uuid;
begin
  if new.direction <> 'incoming' or new.service::text <> 'whatsapp' then
    return new;
  end if;

  select binding.id into v_binding_id
  from public.ai_agent_channel_bindings binding
  join public.ai_agent_profiles profile
    on profile.organization_id = binding.organization_id
   and profile.role = binding.agent_role
  where binding.organization_id = new.organization_id
    and binding.service = 'whatsapp'
    and binding.organization_address = new.organization_address
    and binding.delivery_mode in ('shadow', 'live')
    and profile.status = 'live'
  limit 1;

  if v_binding_id is null then
    return new;
  end if;

  insert into public.ai_agent_dispatches (organization_id, binding_id, conversation_id, message_id)
  values (new.organization_id, v_binding_id, new.conversation_id, new.id)
  on conflict (message_id) do nothing
  returning id into v_dispatch_id;

  if v_dispatch_id is not null then
    perform net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_url') || '/whatsapp-agent-harness',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_token')
      ),
      body := jsonb_build_object('dispatch_id', v_dispatch_id),
      timeout_milliseconds := 10000
    );
  end if;
  return new;
exception when others then
  return new;
end;
$$;


ALTER FUNCTION "private"."invoke_whatsapp_agent_harness"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."invoke_whatsapp_booking_concierge"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  dispatch_id uuid;
begin
  if new.direction <> 'incoming' or new.service::text <> 'whatsapp' then
    return new;
  end if;

  insert into public.whatsapp_concierge_dispatches (
    organization_id, conversation_id, message_id
  ) values (
    new.organization_id, new.conversation_id, new.id
  )
  on conflict (message_id) do nothing
  returning id into dispatch_id;

  if dispatch_id is not null then
    perform private.dispatch_whatsapp_concierge_job(dispatch_id);
  end if;
  return new;
exception when others then
  return new;
end;
$$;


ALTER FUNCTION "private"."invoke_whatsapp_booking_concierge"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."invoke_whatsapp_sales_rag"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  dispatch_id uuid;
begin
  if new.direction <> 'incoming'
     or new.service::text <> 'whatsapp'
     or new.organization_id <> 'ba7793cc-70e5-4b1a-b95e-335ae2be262b'::uuid
     -- Exact Cloud API phone ID for +91 93304 83304. New OmniRelay numbers
     -- never inherit this automated prospect responder.
     or new.organization_address <> '1237389856134357' then
    return new;
  end if;

  insert into public.whatsapp_sales_rag_dispatches (organization_id, conversation_id, message_id)
  values (new.organization_id, new.conversation_id, new.id)
  on conflict (message_id) do nothing
  returning id into dispatch_id;

  if dispatch_id is not null then
    perform net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_url') || '/whatsapp-sales-rag',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_token')
      ),
      body := jsonb_build_object('dispatch_id', dispatch_id),
      timeout_milliseconds := 10000
    );
  end if;
  return new;
exception when others then
  return new;
end;
$$;


ALTER FUNCTION "private"."invoke_whatsapp_sales_rag"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_organization_member"("target_organization_id" "uuid", "minimum_role" "text" DEFAULT 'member'::"text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.agents a
      where a.organization_id = target_organization_id
        and a.user_id = (select auth.uid())
        and coalesce(a.extra->>'status', 'active') = 'active'
        and case coalesce(a.extra->>'role', 'member')
          when 'owner' then 30
          when 'admin' then 20
          else 10
        end >= case minimum_role
          when 'owner' then 30
          when 'admin' then 20
          else 10
        end
    );
$$;


ALTER FUNCTION "private"."is_organization_member"("target_organization_id" "uuid", "minimum_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_platform_operator"("required_role" "text" DEFAULT NULL::"text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from private.platform_operators po
      where po.user_id = (select auth.uid())
        and po.active
        and (required_role is null or po.role = required_role)
    );
$$;


ALTER FUNCTION "private"."is_platform_operator"("required_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."issue_saas_invoice_after_payment"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if new.status='paid' and old.status is distinct from 'paid' then
    insert into public.saas_invoices(
      organization_id,billing_order_id,invoice_number,plan_id,
      subtotal_paise,total_paise,currency,period_start,period_end,metadata
    ) values (
      new.organization_id,new.id,
      'ORI-'||to_char(new.paid_at at time zone 'Asia/Kolkata','YYYYMM')||'-'||lpad(nextval('private.saas_invoice_number_seq')::text,6,'0'),
      new.plan_id,new.amount_paise,new.amount_paise,new.currency,new.period_start,new.period_end,
      jsonb_build_object('provider',new.provider,'provider_payment_id',new.provider_payment_id)
    ) on conflict (billing_order_id) do nothing;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."issue_saas_invoice_after_payment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."link_booking_request_consent"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.appointment_id is not null and new.booking_consent_evidence_id is not null then
    update public.appointments a set booking_consent_evidence_id=new.booking_consent_evidence_id
    where a.id=new.appointment_id and a.organization_id=new.organization_id
      and a.booking_consent_evidence_id is null
      and exists(select 1 from public.whatsapp_booking_consent_evidence e where e.id=new.booking_consent_evidence_id and e.organization_id=new.organization_id and e.action='accepted');
  end if;
  return new;
end;$$;


ALTER FUNCTION "private"."link_booking_request_consent"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."managed_booking_rollout_ready"("p_organization_id" "uuid", "p_workflow_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    exists (
      select 1
      from public.automation_workflows w
      where w.id = p_workflow_id
        and w.organization_id = p_organization_id
        and w.trigger_key = 'booking_confirmed'
        and w.status = 'active'
        and w.configuration->>'rollout_review' = 'approved'
    )
    and private.whatsapp_booking_acceptance_ready(p_organization_id)
    and (
      select count(*) >= 5
      from public.automation_runs r
      where r.workflow_id = p_workflow_id
        and r.organization_id = p_organization_id
        and r.created_at >= now() - interval '30 days'
        and r.safe_context->>'execution_mode' = 'observe'
    )
    and not exists (
      select 1
      from public.automation_runs r
      where r.workflow_id = p_workflow_id
        and r.organization_id = p_organization_id
        and r.created_at >= now() - interval '30 days'
        and (r.status = 'failed' or r.delivery_status = 'failed')
    );
$$;


ALTER FUNCTION "private"."managed_booking_rollout_ready"("p_organization_id" "uuid", "p_workflow_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."mark_due_patient_follow_ups"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.follow_up_at is not null
     and new.follow_up_at <= now()
     and new.follow_up_status = 'scheduled' then
    new.follow_up_status := 'due';
  end if;
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "private"."mark_due_patient_follow_ups"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."materialize_billing_notices"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_count integer := 0; v_added integer := 0;
begin
  insert into public.billing_notice_events(organization_id,notice_type,channel,recipient,scheduled_for,metadata)
  select e.organization_id, x.notice_type, 'in_app', null, x.scheduled_for,
    jsonb_build_object('trial_ends_at',e.trial_ends_at)
  from public.entitlements e
  cross join lateral (values
    ('trial_3_days'::text, date_trunc('minute',e.trial_ends_at-interval '3 days')),
    ('trial_1_day'::text, date_trunc('minute',e.trial_ends_at-interval '1 day')),
    ('trial_expired'::text, date_trunc('minute',e.trial_ends_at))
  ) x(notice_type,scheduled_for)
  where e.status='trialing' and e.trial_ends_at is not null and x.scheduled_for <= now()+interval '4 days'
  on conflict do nothing;
  get diagnostics v_count = row_count;

  insert into public.billing_notice_events(organization_id,notice_type,channel,recipient,scheduled_for,metadata)
  select e.organization_id,'renewal_due','in_app',null,
    date_trunc('minute',e.current_period_end-interval '3 days'),
    jsonb_build_object('current_period_end',e.current_period_end,'grace_ends_at',e.grace_ends_at)
  from public.entitlements e
  where e.status in ('active','past_due') and e.current_period_end is not null
    and e.current_period_end-interval '3 days' <= now()+interval '4 days'
  on conflict do nothing;
  get diagnostics v_added = row_count;
  v_count := v_count + v_added;

  update public.entitlements set status='expired',updated_at=now()
  where status='trialing' and trial_ends_at < now();
  update public.entitlements set status='past_due',
    grace_ends_at=greatest(coalesce(grace_ends_at,current_period_end+interval '3 days'),current_period_end+interval '3 days'),
    updated_at=now()
  where status='active' and current_period_end < now();
  update public.entitlements set status='expired',updated_at=now()
  where status='past_due' and grace_ends_at < now();
  return v_count;
end;
$$;


ALTER FUNCTION "private"."materialize_billing_notices"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."materialize_due_care_reminders"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  created_count integer := 0;
begin
  with due as (
    select r.*
    from public.care_reminders r
    where r.status = 'active'
      and r.next_run_at <= now()
      and r.next_run_at >= now() - interval '24 hours'
    for update skip locked
  ), inserted as (
    insert into public.care_reminder_runs (
      organization_id, reminder_id, patient_id, scheduled_for, channel,
      status, approved_by, approved_at, next_attempt_at
    )
    select
      d.organization_id,
      d.id,
      d.patient_id,
      d.next_run_at,
      d.channel,
      case
        when not d.consent_snapshot then 'skipped'
        when d.approval_mode = 'automatic' then 'approved'
        else 'ready'
      end,
      case when d.consent_snapshot and d.approval_mode = 'automatic' then d.created_by else null end,
      case when d.consent_snapshot and d.approval_mode = 'automatic' then now() else null end,
      case when d.consent_snapshot and d.approval_mode = 'automatic' then now() else null end
    from due d
    on conflict (reminder_id, scheduled_for) do nothing
    returning 1
  ), advanced as (
    update public.care_reminders r
    set
      last_run_at = r.next_run_at,
      next_run_at = case
        when r.schedule_kind = 'daily' then r.next_run_at + interval '1 day'
        else r.next_run_at
      end,
      status = case
        when r.schedule_kind = 'one_time' then 'completed'
        when r.ends_on is not null
          and ((r.next_run_at + interval '1 day') at time zone r.timezone)::date > r.ends_on
          then 'completed'
        else r.status
      end,
      updated_at = now()
    from due d
    where r.id = d.id
    returning r.id
  )
  select count(*) into created_count from inserted;

  return created_count;
end;
$$;


ALTER FUNCTION "private"."materialize_due_care_reminders"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."normalize_patient_care_plan"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.title := btrim(new.title);
  new.goal := nullif(btrim(coalesce(new.goal, '')), '');
  new.instructions := nullif(btrim(coalesce(new.instructions, '')), '');
  new.updated_at := now();
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    new.completed_at := now();
    new.completed_by := auth.uid();
  elsif new.status <> 'completed' then
    new.completed_at := null;
    new.completed_by := null;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."normalize_patient_care_plan"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."normalize_patient_care_task"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.title := trim(new.title);
  new.details := nullif(trim(coalesce(new.details, '')), '');
  new.updated_at := now();
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    new.completed_by := (select auth.uid());
    new.completed_at := now();
  elsif new.status <> 'completed' then
    new.completed_by := null;
    new.completed_at := null;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."normalize_patient_care_task"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."normalize_phone_identity"("p_phone" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE STRICT
    SET "search_path" TO ''
    AS $$
declare
  digits text;
begin
  digits := regexp_replace(p_phone, '[^0-9]', '', 'g');
  if digits = '' then return null; end if;

  if left(digits, 2) = '00' then
    digits := substr(digits, 3);
  end if;

  if length(digits) = 11 and left(digits, 1) = '0' then
    digits := right(digits, 10);
  end if;

  if length(digits) = 10 then
    digits := '91' || digits;
  end if;

  if length(digits) < 8 or length(digits) > 15 then
    return null;
  end if;

  return digits;
end;
$$;


ALTER FUNCTION "private"."normalize_phone_identity"("p_phone" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."notify_patient_care_task"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.assigned_to is not null and (
    tg_op = 'INSERT'
    or old.assigned_to is distinct from new.assigned_to
    or old.status is distinct from new.status
  ) then
    insert into public.app_notifications (
      organization_id, recipient_user_id, notification_type, title, body,
      href, entity_type, entity_id
    ) values (
      new.organization_id,
      new.assigned_to,
      case when tg_op = 'INSERT' or old.assigned_to is distinct from new.assigned_to then 'task_assigned' else 'task_updated' end,
      case when tg_op = 'INSERT' or old.assigned_to is distinct from new.assigned_to then 'Care task assigned' else 'Care task updated' end,
      new.title,
      '/app/team',
      'patient_care_task',
      new.id
    );
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."notify_patient_care_task"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."notify_whatsapp_booking_action"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.status = 'pending_approval'
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    insert into public.app_notifications (
      organization_id, recipient_user_id, notification_type, title, body,
      href, entity_type, entity_id
    )
    select
      new.organization_id,
      a.user_id,
      'serious_action',
      'Booking approval required',
      coalesce(nullif(trim(new.patient_name),''),'A patient') ||
        ' is waiting for the clinic to approve, waitlist or reject the requested appointment.',
      '/app/booking-concierge#booking-requests',
      'whatsapp_booking_request',
      new.id
    from public.agents a
    where a.organization_id = new.organization_id
      and a.ai = false
      and a.user_id is not null
      and coalesce(a.extra->>'role','member') in ('owner','admin')
      and coalesce(a.extra->>'status','active') <> 'inactive'
    on conflict (recipient_user_id, entity_type, entity_id)
      where read_at is null and entity_type = 'whatsapp_booking_request'
      do nothing;
  elsif tg_op = 'UPDATE'
        and old.status = 'pending_approval'
        and new.status <> 'pending_approval' then
    update public.app_notifications
    set read_at = coalesce(read_at, now())
    where organization_id = new.organization_id
      and entity_type = 'whatsapp_booking_request'
      and entity_id = new.id
      and read_at is null;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."notify_whatsapp_booking_action"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."observe_abandoned_recovery_acceptance"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  inbound public.messages;
  run public.whatsapp_acceptance_test_runs;
  fixture public.whatsapp_recovery_acceptance_fixtures;
  normalized_address text;
  current_lease uuid;
begin
  if new.direction <> 'outgoing'
     or new.service <> 'whatsapp'
     or coalesce(new.status->>'source', '') <> 'booking_concierge'
     or lower(coalesce(new.content->>'text', '')) not like '%previous booking session expired%' then
    return new;
  end if;

  select m.* into inbound
  from public.messages m
  where m.organization_id = new.organization_id
    and m.conversation_id = new.conversation_id
    and m.direction = 'incoming'
    and m.service = 'whatsapp'
    and lower(trim(coalesce(m.content->>'text', ''))) = 'menu'
    and m.timestamp <= new.timestamp
  order by m.timestamp desc
  limit 1;
  if inbound.id is null then return new; end if;

  normalized_address := regexp_replace(coalesce(new.contact_address, ''), '\D', '', 'g');
  select r.* into run
  from public.whatsapp_acceptance_test_runs r
  join public.whatsapp_recovery_acceptance_fixtures f on f.run_id = r.id
  where r.organization_id = new.organization_id
    and r.scenario_key = 'abandoned_recovery'
    and r.status = 'armed'
    and r.expires_at > now()
    and r.recipient_hash = extensions.digest(normalized_address, 'sha256')
    and f.conversation_id = new.conversation_id
    and f.status = 'prepared'
  for update of r;

  if run.id is null then return new; end if;

  select f.* into fixture
  from public.whatsapp_recovery_acceptance_fixtures f
  where f.run_id = run.id
    and f.conversation_id = new.conversation_id
    and f.status = 'prepared'
  for update;
  if fixture.id is null then return new; end if;

  current_lease := gen_random_uuid();
  update public.whatsapp_acceptance_test_runs
  set status = 'running', message_count = 1, started_at = now(),
      lease_token = current_lease, dispatch_message_id = new.id, updated_at = now()
  where id = run.id and status = 'armed' and message_count < max_messages;

  update public.whatsapp_recovery_acceptance_fixtures
  set status = 'passed', completed_at = now()
  where id = fixture.id and status = 'prepared';

  perform private.complete_whatsapp_acceptance_test(
    run.id,
    current_lease,
    true,
    'controlled-abandoned-recovery:' || new.id::text,
    null
  );

  return new;
end;
$$;


ALTER FUNCTION "private"."observe_abandoned_recovery_acceptance"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."observe_appointment_reminder_automation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform private.enqueue_automation_event(
    new.organization_id,'appointment_reminder',new.id::text,
    jsonb_build_object('source','appointment_reminder','event_type',new.event_type,
      'scheduled_for',new.scheduled_for,'channel',new.channel,'status',new.status)
  );
  return new;
end; $$;


ALTER FUNCTION "private"."observe_appointment_reminder_automation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."observe_care_reminder_automation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare reminder_kind text;
begin
  select reminder_type into reminder_kind from public.care_reminders where id=new.reminder_id and organization_id=new.organization_id;
  perform private.enqueue_automation_event(
    new.organization_id,
    case when reminder_kind='medication' then 'medication_reminder' else 'follow_up_due' end,
    new.id::text,
    jsonb_build_object('source','care_reminder_run','reminder_type',coalesce(reminder_kind,'care'),
      'scheduled_for',new.scheduled_for,'channel',new.channel,'status',new.status)
  );
  return new;
end; $$;


ALTER FUNCTION "private"."observe_care_reminder_automation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."observe_doctor_queue_automation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform private.enqueue_automation_event(
    new.organization_id,'doctor_queue',new.id::text,
    jsonb_build_object('source','doctor_queue','scheduled_for',new.scheduled_for,
      'shift_date',new.shift_date,'resource_id',new.resource_id,'status',new.status)
  );
  return new;
end; $$;


ALTER FUNCTION "private"."observe_doctor_queue_automation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."observe_emergency_recipient_automation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ declare campaign_kind text; begin
 select campaign_type into campaign_kind from public.campaigns where id=new.campaign_id and organization_id=new.organization_id;
 if campaign_kind='emergency' then perform private.enqueue_automation_event(new.organization_id,'emergency_notice',new.id::text,jsonb_build_object('source','emergency_recipient','source_id',new.id,'scheduled_for',new.scheduled_for,'status',new.status)); end if; return new; end $$;


ALTER FUNCTION "private"."observe_emergency_recipient_automation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."observe_pilot_appointment_automation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare event_key text;
begin
  if new.status = 'confirmed' and old.status is distinct from new.status then
    perform private.enqueue_automation_event(
      new.organization_id,
      'booking_confirmed',
      new.id::text || ':' || new.status,
      jsonb_build_object(
        'source', 'appointment',
        'source_id', new.id,
        'status', new.status,
        'starts_at', new.starts_at,
        'location_id', new.location_id,
        'resource_id', new.resource_id
      )
    );
  end if;

  if old.status is distinct from new.status
    or old.starts_at is distinct from new.starts_at
    or old.location_id is distinct from new.location_id
    or old.resource_id is distinct from new.resource_id then
    event_key := new.id::text || ':' || new.status || ':' || new.starts_at::text || ':'
      || coalesce(new.location_id::text, '') || ':' || coalesce(new.resource_id::text, '');
    perform private.enqueue_automation_event(
      new.organization_id,
      'appointment_changed',
      event_key,
      jsonb_build_object(
        'source', 'appointment',
        'source_id', new.id,
        'status', new.status,
        'starts_at', new.starts_at,
        'location_id', new.location_id,
        'resource_id', new.resource_id
      )
    );
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."observe_pilot_appointment_automation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."observe_pilot_appointment_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.status = 'confirmed' then
    perform private.enqueue_automation_event(
      new.organization_id,
      'booking_confirmed',
      new.id::text || ':' || new.status,
      jsonb_build_object(
        'source', 'appointment',
        'source_id', new.id,
        'status', new.status,
        'starts_at', new.starts_at,
        'location_id', new.location_id,
        'resource_id', new.resource_id
      )
    );
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."observe_pilot_appointment_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."observe_shadow_campaign_usage"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.provider_message_id is not null and new.status in ('sent','delivered','read','failed') then
    perform private.record_shadow_operational_usage(new.organization_id,'campaign',new.id,new.provider_message_id,'marketing',new.status,coalesce(new.sent_at,new.updated_at,now()));
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."observe_shadow_campaign_usage"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."observe_shadow_doctor_queue_usage"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.provider_message_id is not null and new.status in ('sent','delivered','read','failed') then
    perform private.record_shadow_operational_usage(new.organization_id,'doctor_queue',new.id,new.provider_message_id,'utility',new.status,coalesce(new.sent_at,new.updated_at,now()));
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."observe_shadow_doctor_queue_usage"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."observe_shadow_reminder_usage"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.provider_message_id is not null and new.status in ('sent','delivered','read','failed') then
    perform private.record_shadow_operational_usage(new.organization_id,'appointment_reminder',new.id,new.provider_message_id,'utility',new.status,coalesce(new.sent_at,new.updated_at,now()));
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."observe_shadow_reminder_usage"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."observe_whatsapp_command_acceptance"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  body_text text;
  expected_inputs text[];
  observed_keys text[];
  inbound public.messages;
  run public.whatsapp_acceptance_test_runs;
  normalized_address text;
  current_lease uuid;
  observed_count integer;
begin
  if new.direction <> 'outgoing'
     or new.service <> 'whatsapp'
     or coalesce(new.status->>'source', '') <> 'booking_concierge' then
    return new;
  end if;

  body_text := lower(trim(coalesce(new.content->>'text', '')));
  if body_text like '%opted out of omnirelay whatsapp messages%' then
    expected_inputs := array['stop','unsubscribe','cancel subscription','opt out','opt-out'];
    observed_keys := array['stop'];
  elsif body_text like '%clinic booking and care messages are active again%' then
    expected_inputs := array['start'];
    -- START restores care communication and renders the deterministic MENU in
    -- the same verified response, so one reply proves both observations.
    observed_keys := array['start','menu'];
  elsif body_text like '%automated concierge is now paused%' then
    expected_inputs := array['9'];
    observed_keys := array['handoff'];
  else
    return new;
  end if;

  select m.* into inbound
  from public.messages m
  where m.organization_id = new.organization_id
    and m.conversation_id = new.conversation_id
    and m.direction = 'incoming'
    and m.service = 'whatsapp'
    and m.timestamp <= new.timestamp
    and lower(trim(coalesce(m.content->>'text', ''))) = any(expected_inputs)
  order by m.timestamp desc
  limit 1;

  if inbound.id is null then return new; end if;
  normalized_address := regexp_replace(coalesce(new.contact_address, ''), '\D', '', 'g');

  select r.* into run
  from public.whatsapp_acceptance_test_runs r
  where r.organization_id = new.organization_id
    and r.scenario_key = 'commands_handoff'
    and r.status in ('armed','running')
    and r.expires_at > now()
    and r.verified_message_id is not null
    and r.recipient_hash = extensions.digest(normalized_address, 'sha256')
  for update;

  if run.id is null then return new; end if;

  if run.status = 'armed' then
    current_lease := gen_random_uuid();
    update public.whatsapp_acceptance_test_runs
    set status = 'running', started_at = now(), lease_token = current_lease, updated_at = now()
    where id = run.id and status = 'armed';
  else
    current_lease := run.lease_token;
  end if;

  insert into public.whatsapp_acceptance_observations(
    organization_id, run_id, source_message_id, response_message_id,
    observation_key, safe_summary
  )
  select run.organization_id, run.id, inbound.id, new.id, key,
    case key
      when 'stop' then 'Verified STOP response and clinic-care opt-out.'
      when 'start' then 'Verified START response and care communication restoration.'
      when 'menu' then 'Verified deterministic booking MENU rendered after START.'
      when 'handoff' then 'Verified human-assistance response and concierge pause.'
    end
  from unnest(observed_keys) key
  on conflict (run_id, observation_key) do nothing;

  select count(*) into observed_count
  from public.whatsapp_acceptance_observations o
  where o.run_id = run.id;

  update public.whatsapp_acceptance_test_runs
  set message_count = least(max_messages, case when observed_count = 4 then 3 else observed_count end),
      updated_at = now()
  where id = run.id and status = 'running';

  if observed_count = 4 then
    perform private.complete_whatsapp_acceptance_test(
      run.id,
      current_lease,
      true,
      'controlled-command-cycle:' || run.id::text,
      null
    );
  end if;

  return new;
end;
$$;


ALTER FUNCTION "private"."observe_whatsapp_command_acceptance"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."offer_released_appointment_slot"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if old.starts_at > now()
    and old.status in ('pending','payment_pending','confirmed')
    and (
      new.status not in ('pending','payment_pending','confirmed')
      or new.starts_at is distinct from old.starts_at
      or new.ends_at is distinct from old.ends_at
      or new.resource_id is distinct from old.resource_id
      or new.location_id is distinct from old.location_id
      or new.service_id is distinct from old.service_id
    )
  then
    perform private.queue_waitlist_offer(old.organization_id,old.service_id,old.location_id,old.resource_id,old.starts_at,old.ends_at);
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."offer_released_appointment_slot"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."prepare_patient_data_request_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if new.organization_id is distinct from old.organization_id or new.patient_id is distinct from old.patient_id or new.reference is distinct from old.reference or new.request_type is distinct from old.request_type or new.source_channel is distinct from old.source_channel or new.identity_method is distinct from old.identity_method or new.identity_verified_at is distinct from old.identity_verified_at or new.created_at is distinct from old.created_at then raise exception 'immutable data request identity'; end if;
  if old.status in ('completed','rejected','cancelled') and new.status is distinct from old.status then raise exception 'closed data request cannot be reopened'; end if;
  new.updated_at:=now();
  if new.status='completed' and old.status is distinct from new.status then new.completed_at:=now(); end if;
  return new;
end $$;


ALTER FUNCTION "private"."prepare_patient_data_request_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."prepare_security_incident_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if new.organization_id is distinct from old.organization_id
    or new.reference is distinct from old.reference
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at then
    raise exception 'immutable incident identity';
  end if;
  if new.owner_user_id is not null and not exists (
    select 1 from public.agents a
    where a.organization_id = new.organization_id
      and a.user_id = new.owner_user_id
      and coalesce(a.extra->>'status', 'active') = 'active'
  ) then
    raise exception 'incident owner must be an active organization member';
  end if;
  new.updated_at := now();
  if new.status = 'contained' and old.status is distinct from new.status then new.contained_at := coalesce(new.contained_at, now()); end if;
  if new.status = 'resolved' and old.status is distinct from new.status then new.resolved_at := coalesce(new.resolved_at, now()); end if;
  if new.status = 'closed' and old.status is distinct from new.status then new.resolved_at := coalesce(new.resolved_at, now()); new.closed_at := coalesce(new.closed_at, now()); end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."prepare_security_incident_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."prevent_evidence_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if pg_trigger_depth()<=1 and current_setting('omnirelay.allow_compliance_erasure',true) is distinct from 'on' then
    raise exception 'Identity and consent evidence is append-only';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;$$;


ALTER FUNCTION "private"."prevent_evidence_mutation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."process_whatsapp_concierge_dispatches"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  dispatch_row record;
begin
  update public.whatsapp_concierge_dispatches d
  set status = 'processed', processed_at = now(), updated_at = now(), last_error = null
  from public.whatsapp_booking_sessions s,
       public.messages processed_message,
       public.messages dispatched_message
  where d.status = 'pending'
    and s.organization_id = d.organization_id
    and s.conversation_id = d.conversation_id
    and processed_message.id = s.last_message_id
    and dispatched_message.id = d.message_id
    and processed_message.organization_id = d.organization_id
    and processed_message.conversation_id = d.conversation_id
    and dispatched_message.organization_id = d.organization_id
    and dispatched_message.conversation_id = d.conversation_id
    and processed_message.created_at >= dispatched_message.created_at;

  update public.whatsapp_concierge_dispatches d
  set last_error = left(coalesce(r.error_msg, 'HTTP ' || r.status_code::text), 500),
      updated_at = now()
  from net._http_response r
  where d.status = 'pending'
    and d.request_id = r.id
    and (r.error_msg is not null or r.status_code >= 400);

  update public.whatsapp_concierge_dispatches
  set status = 'exhausted',
      last_error = coalesce(last_error, 'Concierge dispatch did not complete after 3 attempts'),
      updated_at = now()
  where status = 'pending' and attempts >= 3 and next_attempt_at <= now();

  for dispatch_row in
    select id
    from public.whatsapp_concierge_dispatches
    where status = 'pending' and attempts < 3 and next_attempt_at <= now()
    order by next_attempt_at
    limit 25
    for update skip locked
  loop
    perform private.dispatch_whatsapp_concierge_job(dispatch_row.id);
  end loop;
end;
$$;


ALTER FUNCTION "private"."process_whatsapp_concierge_dispatches"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."queue_appointment_reminders"("p_appointment_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare a public.appointments%rowtype; channel_name text; recipient_value text;
begin
  select * into a from public.appointments where id=p_appointment_id;
  if a.id is null then return; end if;
  channel_name := case when a.customer_phone is not null then 'whatsapp' else 'email' end;
  recipient_value := coalesce(a.customer_phone,a.customer_email);
  if recipient_value is null then return; end if;
  insert into public.reminder_events(organization_id,appointment_id,event_type,scheduled_for,channel,recipient)
  values(a.organization_id,a.id,'confirmation',now(),channel_name,recipient_value)
  on conflict (appointment_id,event_type,channel) do update set scheduled_for=excluded.scheduled_for,status='scheduled',updated_at=now();
  if a.starts_at > now()+interval '24 hours' then
    insert into public.reminder_events(organization_id,appointment_id,event_type,scheduled_for,channel,recipient)
    values(a.organization_id,a.id,'reminder_24h',a.starts_at-interval '24 hours',channel_name,recipient_value)
    on conflict (appointment_id,event_type,channel) do update set scheduled_for=excluded.scheduled_for,status='scheduled',updated_at=now();
  end if;
  if a.starts_at > now()+interval '2 hours' then
    insert into public.reminder_events(organization_id,appointment_id,event_type,scheduled_for,channel,recipient)
    values(a.organization_id,a.id,'reminder_2h',a.starts_at-interval '2 hours',channel_name,recipient_value)
    on conflict (appointment_id,event_type,channel) do update set scheduled_for=excluded.scheduled_for,status='scheduled',updated_at=now();
  end if;
end;$$;


ALTER FUNCTION "private"."queue_appointment_reminders"("p_appointment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."queue_device_push_deliveries"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private'
    AS $$
begin
  if new.notification_type <> 'serious_action' then return new; end if;
  insert into public.device_push_deliveries(organization_id, notification_id, subscription_id)
  select new.organization_id, new.id, s.id
  from public.device_push_subscriptions s
  where s.organization_id = new.organization_id
    and s.user_id = new.recipient_user_id
    and s.status = 'active'
  on conflict (notification_id, subscription_id) do nothing;
  return new;
end;
$$;


ALTER FUNCTION "private"."queue_device_push_deliveries"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."queue_waitlist_offer"("p_organization_id" "uuid", "p_service_id" "uuid", "p_location_id" "uuid", "p_resource_id" "uuid", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_wait public.appointment_waitlist%rowtype;
  v_conversation public.conversations%rowtype;
  v_offer_id uuid;
  v_message_id uuid;
  v_minutes integer;
  v_expires timestamptz;
  v_body text;
begin
  if p_starts_at <= now() then return null; end if;
  if exists (
    select 1 from public.appointments a
    where a.organization_id=p_organization_id and a.resource_id=p_resource_id
      and a.status in ('pending','payment_pending','confirmed')
      and tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(p_starts_at,p_ends_at,'[)')
  ) then return null; end if;
  if exists (
    select 1 from public.waitlist_offers o
    where o.organization_id=p_organization_id and o.resource_id=p_resource_id
      and o.starts_at=p_starts_at and o.ends_at=p_ends_at and o.status='pending'
  ) then return null; end if;

  select w.* into v_wait
  from public.appointment_waitlist w
  where w.organization_id=p_organization_id and w.service_id=p_service_id
    and w.status='waiting'
    and (w.location_id is null or w.location_id=p_location_id)
    and (w.resource_id is null or w.resource_id=p_resource_id)
    and (w.preferred_date is null or w.preferred_date=p_starts_at::date)
    and (w.preferred_starts_at is null or w.preferred_starts_at=p_starts_at)
  order by w.priority asc, w.created_at asc
  for update skip locked
  limit 1;
  if v_wait.id is null then return null; end if;

  select coalesce(s.waitlist_offer_minutes,30) into v_minutes
  from public.whatsapp_booking_settings s where s.organization_id=p_organization_id;
  v_minutes := coalesce(v_minutes,30);
  v_expires := now() + make_interval(mins => v_minutes);

  select c.* into v_conversation
  from public.whatsapp_booking_requests r
  join public.conversations c on c.id=r.conversation_id
  where r.id=v_wait.booking_request_id and c.organization_id=p_organization_id
  limit 1;
  if v_conversation.id is null then
    select c.* into v_conversation from public.conversations c
    where c.organization_id=p_organization_id and c.service='whatsapp'
      and regexp_replace(c.contact_address,'[^0-9]','','g')=regexp_replace(v_wait.patient_phone,'[^0-9]','','g')
    order by c.updated_at desc limit 1;
  end if;

  insert into public.waitlist_offers(
    organization_id,waitlist_id,service_id,location_id,resource_id,starts_at,ends_at,expires_at
  ) values (
    p_organization_id,v_wait.id,p_service_id,p_location_id,p_resource_id,p_starts_at,p_ends_at,v_expires
  ) returning id into v_offer_id;

  update public.appointment_waitlist
  set status='offered',offer_expires_at=v_expires,updated_at=now()
  where id=v_wait.id;

  if v_conversation.id is not null then
    v_body := format(
      'Hello %s, an appointment slot is now available on %s. Reply ACCEPT within %s minutes to confirm it, or DECLINE to pass it to the next patient.',
      coalesce(v_wait.patient_name,'there'),
      to_char(p_starts_at at time zone 'Asia/Kolkata','Dy, DD Mon at HH12:MI AM'),
      v_minutes
    );
    insert into public.messages(
      organization_id,conversation_id,organization_address,contact_address,service,direction,content,status,"timestamp"
    ) values (
      p_organization_id,v_conversation.id,v_conversation.organization_address,v_conversation.contact_address,
      'whatsapp','outgoing',jsonb_build_object('version','1','type','text','kind','text','text',v_body),
      jsonb_build_object('status','queued','source','waitlist_recovery'),now()
    ) returning id into v_message_id;
    update public.waitlist_offers set message_id=v_message_id where id=v_offer_id;
  end if;
  return v_offer_id;
end;
$$;


ALTER FUNCTION "private"."queue_waitlist_offer"("p_organization_id" "uuid", "p_service_id" "uuid", "p_location_id" "uuid", "p_resource_id" "uuid", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."reconcile_automation_message_delivery"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ declare resolved_status text; begin
 if new.direction<>'outgoing' then return new; end if;
 resolved_status:=case when new.status?'failed' then 'failed' when new.status?'read' then 'read' when new.status?'delivered' then 'delivered' when new.status?'sent' then 'sent' when new.status?'accepted' then 'accepted' else null end;
 if resolved_status is null then return new; end if;
 update public.automation_runs r set observed_message_id=new.id,delivery_status=resolved_status,status=case when resolved_status='failed' then 'failed' else r.status end,failure_code=case when resolved_status='failed' then left(coalesce(new.status->'errors'->0->'error'->>'code','provider_error'),100) else null end,failure_summary=case when resolved_status='failed' then 'WhatsApp delivery failed. Review Operations health before retrying.' else null end,completed_at=coalesce(r.completed_at,now()),updated_at=now()
 where r.organization_id=new.organization_id and ((r.source_type='appointment_reminder' and exists(select 1 from public.reminder_events e where e.id=r.source_id and e.message_id=new.id)) or (r.source_type='doctor_queue' and exists(select 1 from public.doctor_queue_dispatches d where d.id=r.source_id and d.message_id=new.id)) or (r.source_type='emergency_recipient' and exists(select 1 from public.campaign_recipients c where c.id=r.source_id and c.message_id=new.id)));
 return new; end $$;


ALTER FUNCTION "private"."reconcile_automation_message_delivery"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."reconcile_automation_worker_alerts"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  inserted_count integer := 0;
begin
  -- Close an operational alert as soon as its run no longer needs attention.
  update public.app_notifications n
  set read_at = now()
  where n.entity_type = 'automation_worker_attention'
    and n.read_at is null
    and not exists (
      select 1
      from public.automation_runs r
      where r.id = n.entity_id
        and r.organization_id = n.organization_id
        and (
          (r.status = 'processing' and r.started_at < now() - interval '15 minutes')
          or (r.status in ('queued', 'retrying') and r.next_attempt_at < now() - interval '5 minutes')
        )
    );

  insert into public.app_notifications (
    organization_id, recipient_user_id, notification_type, title, body,
    href, entity_type, entity_id, priority, escalation_level
  )
  select
    r.organization_id,
    a.user_id,
    'serious_action',
    'Automation worker needs attention',
    'A clinic automation is delayed or still processing. Review worker health before reminders become failures.',
    '/app/automations',
    'automation_worker_attention',
    r.id,
    'high',
    1
  from public.automation_runs r
  join public.agents a
    on a.organization_id = r.organization_id
   and a.ai = false
   and a.user_id is not null
  where (
      (r.status = 'processing' and r.started_at < now() - interval '15 minutes')
      or (r.status in ('queued', 'retrying') and r.next_attempt_at < now() - interval '5 minutes')
    )
    and coalesce(a.extra->>'role', 'member') in ('owner', 'admin')
    and coalesce(a.extra->>'status', 'active') <> 'inactive'
    and not exists (
      select 1
      from public.app_notifications n
      where n.organization_id = r.organization_id
        and n.recipient_user_id = a.user_id
        and n.entity_type = 'automation_worker_attention'
        and n.entity_id = r.id
        and n.read_at is null
    );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;


ALTER FUNCTION "private"."reconcile_automation_worker_alerts"() OWNER TO "postgres";


COMMENT ON FUNCTION "private"."reconcile_automation_worker_alerts"() IS 'Minute-by-minute, privacy-safe worker health notifications for organization owners and administrators.';



CREATE OR REPLACE FUNCTION "private"."reconcile_deposit_acceptance_payment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare run public.whatsapp_acceptance_test_runs;
begin
  if new.status not in ('paid','failed','expired') or new.status is not distinct from old.status then return new; end if;
  select * into run from public.whatsapp_acceptance_test_runs
  where subject_payment_id=new.id and scenario_key='deposit_payment' and status='running' for update;
  if run.id is null then return new; end if;
  perform private.complete_whatsapp_acceptance_test(
    run.id,run.lease_token,new.status='paid','deposit-payment:'||new.id::text,
    case when new.status='paid' then null else 'Synthetic deposit payment ended as '||new.status||'.' end);
  return new;
end;
$$;


ALTER FUNCTION "private"."reconcile_deposit_acceptance_payment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."reconcile_isolated_acceptance_payment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare run public.whatsapp_acceptance_test_runs;
begin
  if new.status not in ('paid','failed','expired') or new.status is not distinct from old.status then return new; end if;
  select * into run from public.whatsapp_acceptance_test_runs where subject_acceptance_payment_id=new.id and scenario_key='deposit_payment' and status='running' for update;
  if run.id is null then return new; end if;
  perform private.complete_whatsapp_acceptance_test(run.id,run.lease_token,new.status='paid','acceptance-payment:'||new.id::text,case when new.status='paid' then null else 'Synthetic deposit payment ended as '||new.status||'.' end);
  return new;
end;
$$;


ALTER FUNCTION "private"."reconcile_isolated_acceptance_payment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."record_shadow_operational_usage"("p_organization_id" "uuid", "p_source_type" "text", "p_source_id" "uuid", "p_provider_message_id" "text", "p_category" "text", "p_status" "text", "p_occurred_at" timestamp with time zone DEFAULT "now"()) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_rate public.whatsapp_rate_cards%rowtype;
begin
  -- Shadow usage intentionally writes no wallet ledger and never checks balance.
  select * into v_rate from public.whatsapp_rate_cards
  where channel='whatsapp' and country_code='IN' and message_category=p_category
    and active and effective_at <= p_occurred_at and (expires_at is null or expires_at > p_occurred_at)
  order by effective_at desc limit 1;

  insert into public.operational_usage_events(
    organization_id,source_type,source_id,provider_message_id,message_category,delivery_status,
    rate_card_id,base_cost_paise,platform_fee_paise,estimated_total_paise,occurred_at,updated_at,
    metadata
  ) values (
    p_organization_id,p_source_type,p_source_id,nullif(p_provider_message_id,''),p_category,p_status,
    v_rate.id,coalesce(v_rate.base_rate_paise,0),coalesce(v_rate.platform_fee_paise,0),
    coalesce(v_rate.base_rate_paise,0)+coalesce(v_rate.platform_fee_paise,0),p_occurred_at,now(),
    jsonb_build_object('billing_mode','shadow','rate_status',case when v_rate.id is null then 'unconfigured' else 'estimated' end)
  ) on conflict(source_type,source_id) do update set
    provider_message_id=coalesce(excluded.provider_message_id,public.operational_usage_events.provider_message_id),
    delivery_status=excluded.delivery_status,
    updated_at=now();
end;
$$;


ALTER FUNCTION "private"."record_shadow_operational_usage"("p_organization_id" "uuid", "p_source_type" "text", "p_source_id" "uuid", "p_provider_message_id" "text", "p_category" "text", "p_status" "text", "p_occurred_at" timestamp with time zone) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_booking_acceptance_checks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "check_key" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "evidence_kind" "text" DEFAULT 'synthetic'::"text" NOT NULL,
    "evidence_summary" "text",
    "evidence_reference" "text",
    "tested_at" timestamp with time zone,
    "recorded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "whatsapp_booking_acceptance_checks_check_key_check" CHECK (("check_key" = ANY (ARRAY['consent_identity'::"text", 'new_returning_family'::"text", 'availability_isolation'::"text", 'concurrency_idempotency'::"text", 'reschedule_cancel'::"text", 'payments'::"text", 'reminders_commands_handoff'::"text", 'abandoned_recovery'::"text"]))),
    CONSTRAINT "whatsapp_booking_acceptance_checks_evidence_kind_check" CHECK (("evidence_kind" = ANY (ARRAY['synthetic'::"text", 'production'::"text", 'controlled_channel'::"text"]))),
    CONSTRAINT "whatsapp_booking_acceptance_checks_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'passed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."whatsapp_booking_acceptance_checks" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."record_whatsapp_booking_acceptance"("p_organization_id" "uuid", "p_check_key" "text", "p_status" "text", "p_evidence_kind" "text", "p_evidence_summary" "text", "p_evidence_reference" "text" DEFAULT NULL::"text") RETURNS "public"."whatsapp_booking_acceptance_checks"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ declare result public.whatsapp_booking_acceptance_checks; begin
  if p_check_key not in ('consent_identity','new_returning_family','availability_isolation','concurrency_idempotency','reschedule_cancel','payments','reminders_commands_handoff','abandoned_recovery') or p_status not in ('pending','passed','failed') or p_evidence_kind not in ('synthetic','production','controlled_channel') then raise exception 'Invalid acceptance evidence' using errcode='22023'; end if;
  insert into public.whatsapp_booking_acceptance_checks(organization_id,check_key,status,evidence_kind,evidence_summary,evidence_reference,tested_at,updated_at)
  values(p_organization_id,p_check_key,p_status,p_evidence_kind,left(nullif(trim(p_evidence_summary),''),500),left(nullif(trim(p_evidence_reference),''),200),case when p_status='pending' then null else now() end,now())
  on conflict(organization_id,check_key) do update set status=excluded.status,evidence_kind=excluded.evidence_kind,evidence_summary=excluded.evidence_summary,evidence_reference=excluded.evidence_reference,tested_at=excluded.tested_at,updated_at=now()
  returning * into result; return result;
end; $$;


ALTER FUNCTION "private"."record_whatsapp_booking_acceptance"("p_organization_id" "uuid", "p_check_key" "text", "p_status" "text", "p_evidence_kind" "text", "p_evidence_summary" "text", "p_evidence_reference" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."recover_stale_whatsapp_acceptance_tests"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ declare affected integer; begin
  with stale as(update public.whatsapp_acceptance_test_runs set status='failed',failure_summary='Controlled test lease timed out.',completed_at=now(),lease_token=null,updated_at=now() where status='running' and started_at<now()-interval '10 minutes' returning *) insert into public.whatsapp_acceptance_test_events(organization_id,run_id,scenario_key,event_type,safe_summary) select organization_id,id,scenario_key,'failed','Controlled test lease timed out.' from stale;
  get diagnostics affected=row_count; return affected;
end; $$;


ALTER FUNCTION "private"."recover_stale_whatsapp_acceptance_tests"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."redact_dispatched_booking_otp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if new.external_id is not null
     and new.content#>>'{data,meta,purpose}'='booking_otp' then
    new.content:=jsonb_set(new.content,'{data,components}','[]'::jsonb,false);
  end if;
  return new;
end;$$;


ALTER FUNCTION "private"."redact_dispatched_booking_otp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."refresh_automation_workflow_health"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ begin
 update public.automation_workflows set last_run_at=coalesce(new.started_at,new.created_at),last_success_at=case when new.status='succeeded' then coalesce(new.completed_at,now()) else last_success_at end,last_failure_at=case when new.status='failed' then coalesce(new.completed_at,now()) else last_failure_at end,updated_at=now() where id=new.workflow_id and organization_id=new.organization_id; return new; end $$;


ALTER FUNCTION "private"."refresh_automation_workflow_health"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."refresh_campaign_counts"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare target_id uuid:=coalesce(new.campaign_id,old.campaign_id);
begin
 update public.campaigns c set
  total_count=s.total_count,eligible_count=s.eligible_count,sent_count=s.sent_count,delivered_count=s.delivered_count,
  read_count=s.read_count,failed_count=s.failed_count,skipped_count=s.skipped_count,
  status=case when c.status not in ('cancelled','paused') and s.total_count>0 and s.open_count=0 then 'completed' else c.status end,
  updated_at=now()
 from (
  select count(*)::int total_count,count(*) filter(where status not in ('skipped','opted_out'))::int eligible_count,
   count(*) filter(where status in ('sent','delivered','read'))::int sent_count,
   count(*) filter(where status in ('delivered','read'))::int delivered_count,count(*) filter(where status='read')::int read_count,
   count(*) filter(where status='failed')::int failed_count,count(*) filter(where status in ('skipped','opted_out'))::int skipped_count,
   count(*) filter(where status in ('pending','approved','queued'))::int open_count
  from public.campaign_recipients where campaign_id=target_id
 ) s where c.id=target_id;
 return coalesce(new,old);
end $$;


ALTER FUNCTION "private"."refresh_campaign_counts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."reschedule_customer_booking_core"("p_booking_reference" "text", "p_manage_token" "text", "p_starts_at" timestamp with time zone) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare a public.appointments%rowtype; duration_mins int; buffer_mins int; tz text; local_start timestamp; rule record;
begin
  select ap.* into a from private.customer_booking_access ca join public.appointments ap on ap.id=ca.appointment_id
  where ca.booking_reference=upper(trim(p_booking_reference))
    and ca.token_hash=extensions.digest(convert_to(p_manage_token,'UTF8'),'sha256')
    and ap.status in ('pending','confirmed','rescheduling_required');
  if a.id is null or p_starts_at<=now() then raise exception 'Booking cannot be rescheduled'; end if;
  select duration_minutes,buffer_minutes into duration_mins,buffer_mins from public.organization_services where id=a.service_id and active and booking_enabled;
  select timezone into tz from public.booking_resources where id=a.resource_id and active;
  local_start:=p_starts_at at time zone tz;
  select * into rule from public.availability_rules where organization_id=a.organization_id and resource_id=a.resource_id and active and weekday=extract(dow from local_start)::int and (location_id=a.location_id or location_id is null) order by location_id nulls last limit 1;
  if rule.id is null or local_start::time<rule.start_time or local_start::time+make_interval(mins=>duration_mins+buffer_mins)>rule.end_time or mod(extract(epoch from (local_start::time-rule.start_time))::int/60,rule.slot_interval_minutes)<>0 then raise exception 'Selected time is not available'; end if;
  update public.appointments set starts_at=p_starts_at,ends_at=p_starts_at+make_interval(mins=>duration_mins+buffer_mins),status='confirmed',updated_at=now() where id=a.id;
  update public.reminder_events set status='cancelled',updated_at=now() where appointment_id=a.id and status='scheduled';
  perform private.queue_appointment_reminders(a.id);
  insert into public.appointment_events(organization_id,appointment_id,event_type,actor_type,details) values(a.organization_id,a.id,'rescheduled','customer',jsonb_build_object('old_starts_at',a.starts_at,'new_starts_at',p_starts_at));
exception when exclusion_violation then raise exception 'That time was just booked. Please choose another slot';
end;
$$;


ALTER FUNCTION "private"."reschedule_customer_booking_core"("p_booking_reference" "text", "p_manage_token" "text", "p_starts_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."respond_waitlist_offer"("p_organization_id" "uuid", "p_patient_phone" "text", "p_action" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_offer public.waitlist_offers%rowtype;
  v_wait public.appointment_waitlist%rowtype;
  v_slug text;
  v_booking jsonb;
begin
  if lower(p_action) not in ('accept','decline') then return jsonb_build_object('handled',false); end if;
  select o.* into v_offer
  from public.waitlist_offers o
  join public.appointment_waitlist w on w.id=o.waitlist_id
  where o.organization_id=p_organization_id and o.status='pending'
    and regexp_replace(w.patient_phone,'[^0-9]','','g')=regexp_replace(p_patient_phone,'[^0-9]','','g')
  order by o.created_at desc for update of o skip locked limit 1;
  if v_offer.id is null then
    return jsonb_build_object('handled',true,'reply','There is no active waitlist offer for this number. Reply MENU to view booking options.');
  end if;
  select * into v_wait from public.appointment_waitlist where id=v_offer.waitlist_id for update;

  if v_offer.expires_at <= now() then
    update public.waitlist_offers set status='expired',responded_at=now(),updated_at=now() where id=v_offer.id;
    update public.appointment_waitlist set status='expired',offer_expires_at=null,updated_at=now() where id=v_wait.id;
    perform private.queue_waitlist_offer(v_offer.organization_id,v_offer.service_id,v_offer.location_id,v_offer.resource_id,v_offer.starts_at,v_offer.ends_at);
    return jsonb_build_object('handled',true,'reply','That waitlist offer has expired and was passed to the next patient. Reply MENU to start a new booking.');
  end if;

  if lower(p_action)='decline' then
    update public.waitlist_offers set status='declined',responded_at=now(),updated_at=now() where id=v_offer.id;
    update public.appointment_waitlist set status='cancelled',offer_expires_at=null,updated_at=now() where id=v_wait.id;
    perform private.queue_waitlist_offer(v_offer.organization_id,v_offer.service_id,v_offer.location_id,v_offer.resource_id,v_offer.starts_at,v_offer.ends_at);
    return jsonb_build_object('handled',true,'reply','Thank you. The slot was released to the next patient. Reply MENU if you want to make another booking.');
  end if;

  if exists (
    select 1 from public.appointments a where a.organization_id=v_offer.organization_id
      and a.resource_id=v_offer.resource_id and a.status in ('pending','payment_pending','confirmed')
      and tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(v_offer.starts_at,v_offer.ends_at,'[)')
  ) then
    update public.waitlist_offers set status='revoked',responded_at=now(),updated_at=now() where id=v_offer.id;
    update public.appointment_waitlist set status='expired',offer_expires_at=null,updated_at=now() where id=v_wait.id;
    return jsonb_build_object('handled',true,'reply','That slot has just been taken. Your clinic team can help you find another available time.');
  end if;

  select b.slug into v_slug from public.booking_pages b
  where b.organization_id=v_offer.organization_id and b.active=true limit 1;
  v_booking := public.create_public_appointment_v2(
    v_slug,v_offer.resource_id,v_offer.location_id,v_offer.service_id,
    v_wait.patient_name,v_wait.patient_phone,'',v_offer.starts_at,
    'Accepted automated waitlist offer',jsonb_build_object('care_communications_consent',true,'marketing_consent',false)
  );
  update public.waitlist_offers set status='accepted',appointment_id=(v_booking->>'appointment_id')::uuid,responded_at=now(),updated_at=now() where id=v_offer.id;
  update public.appointment_waitlist set status='booked',offer_expires_at=null,updated_at=now() where id=v_wait.id;
  update public.whatsapp_booking_requests set status='confirmed',appointment_id=(v_booking->>'appointment_id')::uuid,decided_at=now(),decision_note='Accepted automated waitlist offer',updated_at=now() where id=v_wait.booking_request_id;
  return jsonb_build_object('handled',true,'accepted',true,'appointment_id',v_booking->>'appointment_id','reply',format('Appointment confirmed. Reference: %s. Reply MENU for booking options.',v_booking->>'booking_reference'));
exception when exclusion_violation or unique_violation then
  update public.waitlist_offers set status='revoked',responded_at=now(),updated_at=now() where id=v_offer.id;
  update public.appointment_waitlist set status='expired',offer_expires_at=null,updated_at=now() where id=v_wait.id;
  return jsonb_build_object('handled',true,'reply','That slot has just been taken. Please reply MENU to choose another available time.');
end;
$$;


ALTER FUNCTION "private"."respond_waitlist_offer"("p_organization_id" "uuid", "p_patient_phone" "text", "p_action" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."run_whatsapp_booking_acceptance"("p_organization_id" "uuid") RETURNS TABLE("check_key" "text", "status" "text", "evidence_summary" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "private"."run_whatsapp_booking_acceptance"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."run_whatsapp_booking_acceptance_closure"("p_organization_id" "uuid") RETURNS TABLE("check_key" "text", "status" "text", "evidence_summary" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  reschedules bigint; cancellations bigint; pay_at_clinic bigint; full_paid bigint; full_expired bigint; deposit_paid bigint;
  reminder_count bigint; command_count bigint; handoff_count bigint; abandoned_count bigint; recovered_count bigint;
  deposit_test_ok boolean; commands_test_ok boolean; recovery_test_ok boolean;
  reschedule_ok boolean; payment_ok boolean; commands_ok boolean; recovery_ok boolean;
begin
  select count(*) filter(where event_type='rescheduled'),count(*) filter(where event_type='cancelled') into reschedules,cancellations from public.appointment_events where organization_id=p_organization_id and actor_type='customer' and details->>'source'='whatsapp';
  reschedule_ok:=reschedules>0 and cancellations>0;
  select count(*) into pay_at_clinic from public.appointments where organization_id=p_organization_id and source='whatsapp' and payment_status='not_required';
  select count(*) filter(where p.payment_mode='full_online' and p.status='paid'),count(*) filter(where p.payment_mode='full_online' and p.status='expired'),count(*) filter(where p.payment_mode='deposit_online' and p.status='paid') into full_paid,full_expired,deposit_paid from public.booking_payments p where p.organization_id=p_organization_id;
  select exists(select 1 from public.whatsapp_acceptance_test_runs r where r.organization_id=p_organization_id and r.scenario_key='deposit_payment' and r.status='passed') into deposit_test_ok;
  payment_ok:=(pay_at_clinic>0 and full_paid>0 and full_expired>0 and deposit_paid>0) or deposit_test_ok;
  select count(*) into reminder_count from public.reminder_events where organization_id=p_organization_id;
  select count(*) into command_count from public.whatsapp_preference_events where organization_id=p_organization_id;
  select count(*) into handoff_count from public.whatsapp_booking_sessions where organization_id=p_organization_id and coalesce((context->>'ai_paused')::boolean,false);
  select exists(select 1 from public.whatsapp_acceptance_test_runs r where r.organization_id=p_organization_id and r.scenario_key='commands_handoff' and r.status='passed') into commands_test_ok;
  commands_ok:=(reminder_count>0 and command_count>0 and handoff_count>0) or (reminder_count>0 and commands_test_ok);
  select count(*) into abandoned_count from private.whatsapp_booking_handoffs where organization_id=p_organization_id and consumed_at is null and expires_at<=now();
  select count(*) into recovered_count from private.whatsapp_booking_handoffs h where h.organization_id=p_organization_id and h.consumed_at is not null and h.appointment_id is not null;
  select exists(select 1 from public.whatsapp_acceptance_test_runs r where r.organization_id=p_organization_id and r.scenario_key='abandoned_recovery' and r.status='passed') into recovery_test_ok;
  recovery_ok:=(abandoned_count>0 and recovered_count>0) or recovery_test_ok;
  perform private.record_whatsapp_booking_acceptance(p_organization_id,'reschedule_cancel',case when reschedule_ok then 'passed' else 'pending' end,'production',case when reschedule_ok then reschedules||' WhatsApp reschedule and '||cancellations||' cancellation event(s) verified.' else 'Waiting for both a WhatsApp reschedule and cancellation event.' end,'closure-runner-v2');
  perform private.record_whatsapp_booking_acceptance(p_organization_id,'payments',case when payment_ok then 'passed' else 'pending' end,case when deposit_test_ok then 'controlled_channel' else 'production' end,case when deposit_test_ok then 'Completed bounded ₹1 deposit acceptance test verified.' else 'Evidence: pay at clinic '||pay_at_clinic||', full paid '||full_paid||', full expired '||full_expired||', deposit paid '||deposit_paid||'.' end,'closure-runner-v2');
  perform private.record_whatsapp_booking_acceptance(p_organization_id,'reminders_commands_handoff',case when commands_ok then 'passed' else 'pending' end,'controlled_channel',case when commands_test_ok then 'Completed bounded STOP, START, MENU and human-handoff acceptance test verified; reminders '||reminder_count||'.' else 'Evidence: reminders '||reminder_count||', command preference events '||command_count||', human handoffs '||handoff_count||'.' end,'closure-runner-v2');
  perform private.record_whatsapp_booking_acceptance(p_organization_id,'abandoned_recovery',case when recovery_ok then 'passed' else 'pending' end,'controlled_channel',case when recovery_test_ok then 'Completed bounded abandoned-booking recovery acceptance test verified.' else 'Evidence: expired unconsumed handoffs '||abandoned_count||', completed handoff recoveries '||recovered_count||'.' end,'closure-runner-v2');
  return query select c.check_key,c.status,c.evidence_summary from public.whatsapp_booking_acceptance_checks c where c.organization_id=p_organization_id and c.check_key in ('reschedule_cancel','payments','reminders_commands_handoff','abandoned_recovery') order by c.check_key;
end; $$;


ALTER FUNCTION "private"."run_whatsapp_booking_acceptance_closure"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."stage_operational_rate_card"("p_organization_id" "uuid", "p_channel" "text", "p_country" "text", "p_category" "text", "p_rate" numeric, "p_source_url" "text", "p_source_version" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_id uuid;
begin
  if not private.is_organization_member(p_organization_id,'owner') then raise exception 'Owner access required'; end if;
  insert into public.whatsapp_rate_cards(channel,country_code,message_category,base_rate_paise,platform_fee_paise,currency,source_url,source_version,effective_at,active,verification_status)
  values(p_channel,p_country,p_category,p_rate,0,'INR',p_source_url,p_source_version,now(),false,'draft') returning id into v_id;
  insert into public.operational_rate_card_audit(organization_id,rate_card_id,action,source_url,source_version,actor_id) values(p_organization_id,v_id,'draft_created',p_source_url,p_source_version,(select auth.uid()));
  return v_id;
end; $$;


ALTER FUNCTION "private"."stage_operational_rate_card"("p_organization_id" "uuid", "p_channel" "text", "p_country" "text", "p_category" "text", "p_rate" numeric, "p_source_url" "text", "p_source_version" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."sync_campaign_delivery_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  provider_status text;
begin
  provider_status := case
    when new.status ? 'read' then 'read'
    when new.status ? 'delivered' then 'delivered'
    when new.status ? 'sent' or new.status ? 'accepted' then 'sent'
    when new.status ? 'failed' then 'failed'
    else null
  end;
  if provider_status is null then return new; end if;

  update public.campaign_recipients
  set
    provider_message_id = coalesce(provider_message_id, new.external_id),
    status = provider_status,
    sent_at = case when provider_status in ('sent','delivered','read') then coalesce(sent_at, now()) else sent_at end,
    delivered_at = case when provider_status in ('delivered','read') then coalesce(delivered_at, now()) else delivered_at end,
    read_at = case when provider_status = 'read' then coalesce(read_at, now()) else read_at end,
    failure_reason = case when provider_status = 'failed' then coalesce(new.status#>>'{errors,0,error,message}', new.status#>>'{failed,error,message}', 'WhatsApp delivery failed') else null end,
    updated_at = now()
  where message_id = new.id
     or (new.external_id is not null and provider_message_id = new.external_id);
  return new;
end;
$$;


ALTER FUNCTION "private"."sync_campaign_delivery_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."sync_care_plan_patient_reminder"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if new.status = 'active' and new.next_review_at is not null then
    update public.care_reminders
      set status = 'active',
          scheduled_for = new.next_review_at,
          next_run_at = new.next_review_at,
          updated_at = now()
      where care_plan_id = new.id;
  elsif new.status = 'paused' then
    update public.care_reminders
      set status = 'paused', updated_at = now()
      where care_plan_id = new.id and status not in ('completed', 'cancelled');
  elsif new.status = 'completed' then
    update public.care_reminders
      set status = 'completed', updated_at = now()
      where care_plan_id = new.id and status <> 'cancelled';
  elsif new.status = 'cancelled' or new.next_review_at is null then
    update public.care_reminders
      set status = 'cancelled', updated_at = now()
      where care_plan_id = new.id and status <> 'completed';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."sync_care_plan_patient_reminder"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."sync_care_plan_review_task"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  task_details text;
begin
  task_details := nullif(concat_ws(E'\n\n', new.goal, new.instructions), '');

  if new.status = 'active' and new.next_review_at is not null then
    insert into public.patient_care_tasks (
      organization_id,
      patient_id,
      encounter_id,
      care_plan_id,
      task_type,
      title,
      details,
      due_at,
      priority,
      status,
      assigned_to,
      created_by
    ) values (
      new.organization_id,
      new.patient_id,
      new.encounter_id,
      new.id,
      'follow_up',
      left('Review care plan: ' || new.title, 160),
      task_details,
      new.next_review_at,
      'normal',
      'open',
      new.assigned_to,
      new.created_by
    )
    on conflict (care_plan_id) where care_plan_id is not null
    do update set
      patient_id = excluded.patient_id,
      encounter_id = excluded.encounter_id,
      title = excluded.title,
      details = excluded.details,
      due_at = excluded.due_at,
      assigned_to = excluded.assigned_to,
      status = 'open';
  elsif new.status in ('paused', 'cancelled') or new.next_review_at is null then
    update public.patient_care_tasks
      set status = 'cancelled'
      where care_plan_id = new.id
        and status <> 'completed';
  elsif new.status = 'completed' then
    update public.patient_care_tasks
      set status = 'completed'
      where care_plan_id = new.id
        and status <> 'completed';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "private"."sync_care_plan_review_task"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."sync_care_reminder_delivery_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.external_id is null then
    return new;
  end if;

  update public.care_reminder_runs
  set
    provider_message_id = coalesce(provider_message_id, new.external_id),
    status = case
      when new.status ? 'read' then 'read'
      when new.status ? 'delivered' then 'delivered'
      when new.status ? 'sent' or new.status ? 'accepted' then 'sent'
      when new.status ? 'failed' then 'failed'
      else status
    end,
    sent_at = coalesce(sent_at, nullif(new.status->>'sent', '')::timestamptz, nullif(new.status->>'accepted', '')::timestamptz),
    delivered_at = coalesce(delivered_at, nullif(new.status->>'delivered', '')::timestamptz),
    read_at = coalesce(read_at, nullif(new.status->>'read', '')::timestamptz),
    failure_reason = case
      when new.status ? 'failed' then coalesce(new.status#>>'{errors,0,error,message}', 'WhatsApp delivery failed')
      else failure_reason
    end,
    provider_response = new.status,
    updated_at = now()
  where provider_message_id = new.external_id
     or provider_response->>'message_id' = new.id::text;

  return new;
end;
$$;


ALTER FUNCTION "private"."sync_care_reminder_delivery_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."sync_care_reminder_run_from_message"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private'
    AS $$
declare
  provider_status text;
begin
  provider_status := lower(coalesce(new.status ->> 'status', ''));

  if provider_status not in ('sent', 'delivered', 'read', 'failed') then
    return new;
  end if;

  update public.care_reminder_runs
  set
    provider_message_id = coalesce(new.external_id, provider_message_id),
    status = provider_status,
    sent_at = case
      when provider_status in ('sent', 'delivered', 'read') then coalesce(sent_at, now())
      else sent_at
    end,
    delivered_at = case
      when provider_status in ('delivered', 'read') then coalesce(delivered_at, now())
      else delivered_at
    end,
    read_at = case
      when provider_status = 'read' then coalesce(read_at, now())
      else read_at
    end,
    failed_at = case
      when provider_status = 'failed' then coalesce(failed_at, now())
      else null
    end,
    failure_reason = case
      when provider_status = 'failed'
        then coalesce(new.status ->> 'error_message', new.status ->> 'error', 'WhatsApp delivery failed')
      else null
    end,
    updated_at = now()
  where
    (new.external_id is not null and provider_message_id = new.external_id)
    or provider_response ->> 'message_id' = new.id::text;

  return new;
end;
$$;


ALTER FUNCTION "private"."sync_care_reminder_run_from_message"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."sync_doctor_queue_dispatch_from_message"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  update public.doctor_queue_dispatches d
  set
    provider_message_id=coalesce(new.external_id,d.provider_message_id),
    status=case
      when new.status ? 'read' then 'read'
      when new.status ? 'delivered' then 'delivered'
      when new.status ? 'sent' or new.status ? 'accepted' then 'sent'
      when new.status ? 'failed' then 'failed'
      else d.status
    end,
    sent_at=coalesce(d.sent_at,nullif(new.status->>'sent','')::timestamptz,nullif(new.status->>'accepted','')::timestamptz),
    delivered_at=coalesce(d.delivered_at,nullif(new.status->>'delivered','')::timestamptz),
    read_at=coalesce(d.read_at,nullif(new.status->>'read','')::timestamptz),
    failure_reason=case when new.status ? 'failed' then coalesce(new.status#>>'{errors,0,error,message}','WhatsApp delivery failed') else d.failure_reason end,
    provider_response=new.status,
    next_attempt_at=case when new.status ? 'failed' and d.attempts<d.max_attempts then now()+interval '10 minutes' else d.next_attempt_at end,
    updated_at=now()
  where d.message_id=new.id or (new.external_id is not null and d.provider_message_id=new.external_id);
  return new;
end;
$$;


ALTER FUNCTION "private"."sync_doctor_queue_dispatch_from_message"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."sync_patient_appointment_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if coalesce(current_setting('omnirelay.defer_patient_sync',true),'off') <> 'on' then
    perform private.sync_patient_from_appointment(new.id);
  end if;
  return new;
end;$$;


ALTER FUNCTION "private"."sync_patient_appointment_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."sync_patient_from_appointment"("p_appointment_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  a public.appointments%rowtype;
  v_patient_id uuid;
  normalized_patient_phone text;
  normalized_guardian_phone text;
begin
  select * into a from public.appointments where id = p_appointment_id;
  if a.id is null then return null; end if;

  normalized_patient_phone := private.normalize_phone_identity(a.customer_phone);
  normalized_guardian_phone := private.normalize_phone_identity(coalesce(a.booking_contact_phone, a.customer_phone));

  if a.patient_relationship = 'self' then
    select p.id into v_patient_id
    from public.patient_profiles p
    where p.organization_id = a.organization_id
      and (
        (normalized_patient_phone is not null and p.normalized_phone = normalized_patient_phone)
        or (a.customer_email is not null and lower(p.email) = lower(a.customer_email))
      )
    order by p.created_at
    limit 1;
  else
    select p.id into v_patient_id
    from public.patient_guardian_links g
    join public.patient_profiles p on p.id = g.patient_id
    where g.organization_id = a.organization_id
      and g.normalized_phone = normalized_guardian_phone
      and lower(p.full_name) = lower(a.customer_name)
      and (a.patient_date_of_birth is null or p.date_of_birth = a.patient_date_of_birth)
    order by p.created_at
    limit 1;
  end if;

  if v_patient_id is null then
    insert into public.patient_profiles (
      organization_id, full_name, phone, email, age, date_of_birth,
      primary_contact_phone, health_concern, locality, pincode, patient_summary,
      care_communications_consent, marketing_consent, source, first_seen_at, last_seen_at
    )
    values (
      a.organization_id, a.customer_name,
      case when a.patient_relationship = 'self' then a.customer_phone end,
      a.customer_email, a.patient_age, a.patient_date_of_birth,
      coalesce(a.booking_contact_phone, a.customer_phone), a.health_concern,
      a.patient_locality, a.patient_pincode, a.patient_summary,
      a.care_communications_consent, a.marketing_consent, a.source,
      coalesce(a.created_at, now()),
      greatest(coalesce(a.starts_at, now()), coalesce(a.created_at, now()))
    )
    returning id into v_patient_id;
  else
    update public.patient_profiles
    set full_name = a.customer_name,
        email = coalesce(a.customer_email, email),
        age = coalesce(a.patient_age, age),
        date_of_birth = coalesce(a.patient_date_of_birth, date_of_birth),
        primary_contact_phone = coalesce(a.booking_contact_phone, a.customer_phone, primary_contact_phone),
        health_concern = coalesce(nullif(a.health_concern, ''), health_concern),
        locality = coalesce(nullif(a.patient_locality, ''), locality),
        pincode = coalesce(nullif(a.patient_pincode, ''), pincode),
        patient_summary = coalesce(nullif(a.patient_summary, ''), patient_summary),
        care_communications_consent = a.care_communications_consent,
        marketing_consent = marketing_consent or a.marketing_consent,
        last_seen_at = greatest(last_seen_at, coalesce(a.starts_at, now()), coalesce(a.updated_at, now())),
        updated_at = now()
    where id = v_patient_id;
  end if;

  if normalized_guardian_phone is not null then
    insert into public.patient_guardian_links (
      organization_id, patient_id, guardian_name, guardian_phone, relationship
    )
    values (
      a.organization_id, v_patient_id,
      coalesce(nullif(a.booking_contact_name, ''), a.customer_name),
      coalesce(a.booking_contact_phone, a.customer_phone),
      a.patient_relationship
    )
    on conflict (organization_id, patient_id, normalized_phone)
    do update set guardian_name = excluded.guardian_name,
                  guardian_phone = excluded.guardian_phone,
                  relationship = excluded.relationship,
                  updated_at = now();
  end if;

  update public.appointments
  set patient_id = v_patient_id
  where id = a.id and patient_id is distinct from v_patient_id;

  return v_patient_id;
end;
$$;


ALTER FUNCTION "private"."sync_patient_from_appointment"("p_appointment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."sync_reminder_event_from_message"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_now timestamptz := now();
begin
  update public.reminder_events r
  set provider_message_id = coalesce(new.external_id, r.provider_message_id),
      sent_at = case when new.status ? 'sent' or new.status ? 'accepted' then coalesce(r.sent_at, v_now) else r.sent_at end,
      delivered_at = case when new.status ? 'delivered' then coalesce(r.delivered_at, v_now) else r.delivered_at end,
      read_at = case when new.status ? 'read' then coalesce(r.read_at, v_now) else r.read_at end,
      status = case when new.status ? 'failed' then 'failed' else 'sent' end,
      failure_reason = case when new.status ? 'failed' then coalesce(new.status->'errors'->0->>'message', 'WhatsApp rejected the message.') else null end,
      provider_response = coalesce(r.provider_response, '{}'::jsonb) || jsonb_build_object('message_status', new.status),
      updated_at = v_now
  where r.message_id = new.id;
  return new;
end;
$$;


ALTER FUNCTION "private"."sync_reminder_event_from_message"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."validate_chamber_availability"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if new.active and new.location_id is not null and exists (
    select 1
    from public.availability_rules other
    where other.id <> coalesce(new.id, gen_random_uuid())
      and other.resource_id = new.resource_id
      and other.location_id is not null
      and other.active
      and other.weekday = new.weekday
      and other.start_time < new.end_time
      and other.end_time > new.start_time
      and coalesce(other.effective_to, 'infinity'::date) >= coalesce(new.effective_from, '-infinity'::date)
      and coalesce(new.effective_to, 'infinity'::date) >= coalesce(other.effective_from, '-infinity'::date)
  ) then
    raise exception 'This provider already has overlapping chamber hours on that day';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."validate_chamber_availability"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."whatsapp_booking_acceptance_ready"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ select count(*)=8 and bool_and(status='passed') from public.whatsapp_booking_acceptance_checks where organization_id=p_organization_id; $$;


ALTER FUNCTION "private"."whatsapp_booking_acceptance_ready"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_workspace_invitations"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  accepted_count integer;
  current_email text;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required';
  end if;

  select lower(email) into current_email from auth.users where id = (select auth.uid());
  if current_email is null then return 0; end if;

  update public.agents
  set user_id = (select auth.uid()),
      extra = jsonb_set(coalesce(extra, '{}'::jsonb), '{invitation,status}', '"accepted"'::jsonb, true),
      updated_at = now()
  where user_id is null
    and ai = false
    and lower(extra->'invitation'->>'email') = current_email
    and extra->'invitation'->>'status' = 'pending';

  get diagnostics accepted_count = row_count;
  return accepted_count;
end;
$$;


ALTER FUNCTION "public"."accept_workspace_invitations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."acquire_shadow_provider_slot"("p_provider_config_key" "text", "p_max_requests_per_minute" integer DEFAULT 5) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare s private.ai_provider_state%rowtype;
begin
  insert into private.ai_provider_state (provider_config_key) values (p_provider_config_key) on conflict do nothing;
  select * into s from private.ai_provider_state where provider_config_key = p_provider_config_key for update;
  if s.state = 'open' and s.open_until > now() then return jsonb_build_object('allowed', false, 'reason', 'circuit_open'); end if;
  if s.state = 'open' then update private.ai_provider_state set state='half_open', half_open_probe_in_flight=true, updated_at=now() where provider_config_key=p_provider_config_key; return jsonb_build_object('allowed', true, 'reason', 'half_open_probe'); end if;
  if s.state = 'half_open' and s.half_open_probe_in_flight then return jsonb_build_object('allowed', false, 'reason', 'half_open_busy'); end if;
  if s.window_started_at < now() - interval '1 minute' then
    update private.ai_provider_state set window_started_at=now(), window_request_count=1, updated_at=now() where provider_config_key=p_provider_config_key;
    return jsonb_build_object('allowed', true, 'reason', 'allowed');
  end if;
  if s.window_request_count >= p_max_requests_per_minute then return jsonb_build_object('allowed', false, 'reason', 'local_rate_limit'); end if;
  update private.ai_provider_state set window_request_count=window_request_count+1, updated_at=now() where provider_config_key=p_provider_config_key;
  return jsonb_build_object('allowed', true, 'reason', 'allowed');
end $$;


ALTER FUNCTION "public"."acquire_shadow_provider_slot"("p_provider_config_key" "text", "p_max_requests_per_minute" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."activate_medicine_catalog_release"("p_release_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare active_count bigint;
begin
  select count(*) into active_count from public.medicine_catalog_entries where release_id = p_release_id and status = 'active';
  if active_count = 0 then raise exception 'A medicine release cannot be activated without active entries'; end if;
  update public.medicine_catalog_releases set status = 'superseded' where status = 'active' and id <> p_release_id;
  update public.medicine_catalog_releases set status = 'active', activated_at = now() where id = p_release_id and status = 'staged';
  if not found then raise exception 'The staged medicine release was not found'; end if;
end;
$$;


ALTER FUNCTION "public"."activate_medicine_catalog_release"("p_release_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."activate_saas_subscription"("p_provider_order_id" "text", "p_provider_payment_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_order public.saas_billing_orders%rowtype;
  v_plan public.saas_plans%rowtype;
  v_start timestamptz := now();
  v_end timestamptz := now() + interval '1 month';
begin
  select * into v_order from public.saas_billing_orders
  where provider_order_id = p_provider_order_id for update;
  if v_order.id is null then raise exception 'Billing order not found'; end if;
  if v_order.status = 'paid' then
    if v_order.provider_payment_id <> p_provider_payment_id then raise exception 'Payment reference mismatch'; end if;
    return jsonb_build_object('status','active','plan_id',v_order.plan_id,'period_end',v_order.period_end);
  end if;
  if v_order.status <> 'pending' then raise exception 'Billing order is not payable'; end if;
  if exists (select 1 from public.saas_billing_orders where provider_payment_id=p_provider_payment_id and id<>v_order.id) then
    raise exception 'Payment reference already used';
  end if;
  select * into v_plan from public.saas_plans where id=v_order.plan_id and active;
  if v_plan.id is null then raise exception 'Plan is unavailable'; end if;

  update public.saas_billing_orders set status='paid',provider_payment_id=p_provider_payment_id,
    paid_at=v_start,period_start=v_start,period_end=v_end,updated_at=v_start where id=v_order.id;
  update public.entitlements set plan_id=v_plan.id,max_workspaces=v_plan.max_locations,
    max_seats=v_plan.max_seats,conversations_quota=v_plan.conversations_quota,
    channels=v_plan.channels,features=v_plan.features,status='active',
    current_period_end=v_end,grace_ends_at=v_end+interval '3 days',cancel_at_period_end=false,updated_at=v_start
  where organization_id=v_order.organization_id;
  if not found then
    insert into public.entitlements(organization_id,plan_id,max_workspaces,max_seats,conversations_quota,channels,features,status,current_period_end,grace_ends_at)
    values(v_order.organization_id,v_plan.id,v_plan.max_locations,v_plan.max_seats,v_plan.conversations_quota,v_plan.channels,v_plan.features,'active',v_end,v_end+interval '3 days');
  end if;
  return jsonb_build_object('status','active','plan_id',v_plan.id,'plan_name',v_plan.name,'period_start',v_start,'period_end',v_end);
end;
$$;


ALTER FUNCTION "public"."activate_saas_subscription"("p_provider_order_id" "text", "p_provider_payment_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."after_insert_on_organizations"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  user_id uuid := auth.uid();
  user_name text;
begin
  insert into public.organizations_addresses (organization_id, service, address)
    values (new.id, 'local', new.id::text);

  if user_id is not null then
    select coalesce(raw_user_meta_data->>'full_name', email, '?') into user_name
    from auth.users
    where id = user_id;

    insert into public.agents (organization_id, user_id, name, ai, extra)
    values (new.id, user_id, user_name, false, '{"role": "owner"}');
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."after_insert_on_organizations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."agent_update_by_owner_rules"("p_id" "uuid", "p_user_id" "uuid", "p_organization_id" "uuid", "p_ai" boolean, "p_extra" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  return exists (
    select 1 from public.agents
    where id = p_id
      -- updating user_id is not allowed
      and user_id is not distinct from p_user_id
      -- prevent from smuggling into another org
      and organization_id = p_organization_id
      -- once created, ai/human cannot be changed
      and ai = p_ai
      -- sent invitations can only be updated by the receiver
      and extra->'invitation' is not distinct from p_extra->'invitation'
  );
end;
$$;


ALTER FUNCTION "public"."agent_update_by_owner_rules"("p_id" "uuid", "p_user_id" "uuid", "p_organization_id" "uuid", "p_ai" boolean, "p_extra" "jsonb") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."automation_rollout_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "workflow_id" "uuid" NOT NULL,
    "decision" "text" NOT NULL,
    "observation_count" integer NOT NULL,
    "failure_count" integer NOT NULL,
    "actor_user_id" "uuid" NOT NULL,
    "evidence_window_started_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "automation_rollout_reviews_decision_check" CHECK (("decision" = ANY (ARRAY['approved'::"text", 'blocked'::"text"]))),
    CONSTRAINT "automation_rollout_reviews_failure_count_check" CHECK (("failure_count" >= 0)),
    CONSTRAINT "automation_rollout_reviews_observation_count_check" CHECK (("observation_count" >= 0))
);


ALTER TABLE "public"."automation_rollout_reviews" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_automation_rollout"("p_organization_id" "uuid", "p_workflow_id" "uuid") RETURNS "public"."automation_rollout_reviews"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  actor uuid := (select auth.uid());
  assessment record;
  result public.automation_rollout_reviews;
begin
  if actor is null or not private.is_organization_member(p_organization_id, 'admin') then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  perform 1
  from public.automation_workflows
  where id = p_workflow_id
    and organization_id = p_organization_id
    and status = 'active'
    and configuration->>'execution_mode' = 'observe'
  for update;
  if not found then
    raise exception 'Observe-only workflow not found' using errcode = 'P0002';
  end if;

  select * into assessment
  from public.get_automation_rollout_readiness(p_organization_id)
  where workflow_id = p_workflow_id;

  if assessment.ready is distinct from true then
    insert into public.automation_rollout_reviews (
      organization_id, workflow_id, decision, observation_count, failure_count,
      actor_user_id, evidence_window_started_at
    ) values (
      p_organization_id, p_workflow_id, 'blocked',
      coalesce(assessment.observation_count, 0), coalesce(assessment.failure_count, 0),
      actor, now() - interval '30 days'
    ) returning * into result;
    return result;
  end if;

  update public.automation_workflows
  set configuration = configuration || jsonb_build_object(
    'rollout_review', 'approved',
    'rollout_reviewed_at', now(),
    'rollout_reviewed_by', actor
  ), updated_at = now()
  where id = p_workflow_id and organization_id = p_organization_id;

  insert into public.automation_rollout_reviews (
    organization_id, workflow_id, decision, observation_count, failure_count,
    actor_user_id, evidence_window_started_at
  ) values (
    p_organization_id, p_workflow_id, 'approved',
    assessment.observation_count, assessment.failure_count,
    actor, now() - interval '30 days'
  ) returning * into result;
  return result;
end;
$$;


ALTER FUNCTION "public"."approve_automation_rollout"("p_organization_id" "uuid", "p_workflow_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_appointment_queue_token"("p_organization_id" "uuid", "p_appointment_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare a public.appointments%rowtype; queue_day date; next_token integer; existing public.appointment_queue_entries%rowtype;
begin
  if not private.is_organization_member(p_organization_id,'admin') then raise exception 'Administrator access required'; end if;
  select * into a from public.appointments where id=p_appointment_id and organization_id=p_organization_id for update;
  if a.id is null then raise exception 'Appointment not found'; end if;
  if a.status not in ('confirmed','arrived','in_consultation') then raise exception 'Only active appointments can join today''s queue'; end if;
  select * into existing from public.appointment_queue_entries where appointment_id=a.id;
  if existing.id is not null then return jsonb_build_object('token_number',existing.token_number,'queue_status',existing.queue_status,'already_assigned',true); end if;
  queue_day := (a.starts_at at time zone 'Asia/Kolkata')::date;
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':'||a.resource_id::text||':'||a.location_id::text||':'||queue_day::text,0));
  select coalesce(max(token_number),0)+1 into next_token from public.appointment_queue_entries where organization_id=p_organization_id and resource_id=a.resource_id and location_id=a.location_id and queue_date=queue_day;
  insert into public.appointment_queue_entries(organization_id,appointment_id,resource_id,location_id,queue_date,token_number)
  values(p_organization_id,a.id,a.resource_id,a.location_id,queue_day,next_token);
  insert into public.appointment_events(organization_id,appointment_id,event_type,actor_type,actor_id,details)
  values(p_organization_id,a.id,'queue_token_assigned','staff',auth.uid(),jsonb_build_object('token_number',next_token));
  return jsonb_build_object('token_number',next_token,'queue_status','waiting','already_assigned',false);
end; $$;


ALTER FUNCTION "public"."assign_appointment_queue_token"("p_organization_id" "uuid", "p_appointment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."attach_public_booking_identity"("p_booking_reference" "text", "p_manage_token" "text", "p_booking_contact_name" "text", "p_booking_contact_phone" "text", "p_patient_relationship" "text", "p_patient_date_of_birth" "date" DEFAULT NULL::"date") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform private.consume_public_request_limit('public_booking_identity',p_booking_reference,10,600);
  perform private.attach_public_booking_identity_core(
    p_booking_reference,p_manage_token,p_booking_contact_name,p_booking_contact_phone,
    p_patient_relationship,p_patient_date_of_birth
  );
end; $$;


ALTER FUNCTION "public"."attach_public_booking_identity"("p_booking_reference" "text", "p_manage_token" "text", "p_booking_contact_name" "text", "p_booking_contact_phone" "text", "p_patient_relationship" "text", "p_patient_date_of_birth" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."attach_public_payment_order"("p_booking_reference" "text", "p_manage_token" "text", "p_provider_order_id" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_appointment_id uuid;
begin
  select c.appointment_id into v_appointment_id from private.customer_booking_access c
  where c.booking_reference=upper(trim(p_booking_reference))
    and c.token_hash=extensions.digest(convert_to(p_manage_token,'UTF8'),'sha256');
  if v_appointment_id is null or length(trim(p_provider_order_id))<5 then raise exception 'Payment hold not found'; end if;
  update public.booking_payments p set provider_order_id=trim(p_provider_order_id),updated_at=now()
  from public.appointments a
  where p.appointment_id=v_appointment_id and a.id=p.appointment_id and p.status='created'
    and a.status='payment_pending' and a.hold_expires_at>now();
  if not found then raise exception 'Payment hold has expired'; end if;
end;
$$;


ALTER FUNCTION "public"."attach_public_payment_order"("p_booking_reference" "text", "p_manage_token" "text", "p_provider_order_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."before_insert_on_conversations"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  _existing_address text;
begin
  -- Validate that external services require either contact_address or group_address
  if new.service <> 'local' and new.contact_address is null and new.group_address is null then
    raise exception 'Conversations with external services require either contact_address or group_address';
  end if;

  if new.contact_address is null then
    return new;
  end if;

  select address into _existing_address
  from public.contacts_addresses
  where organization_id = new.organization_id
    and service = new.service
    and address = new.contact_address
  order by created_at desc
  limit 1;

  if _existing_address is null then
    insert into public.contacts_addresses (
      organization_id,
      address,
      service
    ) values (
      new.organization_id,
      new.contact_address,
      new.service
    );
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."before_insert_on_conversations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."before_insert_on_messages"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  -- If conversation_id is already provided, proceed as is
  if new.conversation_id is not null then
    return new;
  end if;

  -- Look up conversation_id from conversation table. Group conversations
  -- are keyed by group_address alone (contact_address null on the
  -- conversation; the per-message sender lives on messages.contact_address).
  if new.group_address is not null then
    select id into new.conversation_id
    from public.conversations
    where organization_address = new.organization_address
      and group_address = new.group_address
      and service = new.service
      and status = 'active'
    order by created_at desc
    limit 1;
  else
    select id into new.conversation_id
    from public.conversations
    where organization_address = new.organization_address
      and contact_address is not distinct from new.contact_address
      and group_address is null
      and service = new.service
      and status = 'active'
    order by created_at desc
    limit 1;
  end if;

  -- Create conversation if it doesn't exist
  if new.conversation_id is null then
    insert into public.conversations (
      organization_id,
      organization_address,
      contact_address,
      group_address,
      service
    ) values (
      new.organization_id,
      new.organization_address,
      case when new.group_address is null then new.contact_address end,
      new.group_address,
      new.service
    )
    returning id into new.conversation_id;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."before_insert_on_messages"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_customer_booking"("p_booking_reference" "text", "p_manage_token" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform private.consume_public_request_limit('public_booking_cancel',p_booking_reference,10,600);
  perform private.cancel_customer_booking_core(p_booking_reference,p_manage_token);
end; $$;


ALTER FUNCTION "public"."cancel_customer_booking"("p_booking_reference" "text", "p_manage_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_deposit_acceptance_dispatch"("p_organization_id" "uuid") RETURNS "public"."whatsapp_acceptance_test_runs"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare result public.whatsapp_acceptance_test_runs;
begin
  update public.whatsapp_acceptance_test_runs set status='running',message_count=message_count+1,started_at=now(),lease_token=gen_random_uuid(),updated_at=now()
  where organization_id=p_organization_id and scenario_key='deposit_payment' and status='armed' and expires_at>now() and message_count<max_messages
    and verified_message_id is not null and (subject_payment_id is not null or subject_acceptance_payment_id is not null)
    and checkout_url ~ '^https://omnirelay-light\.alam-kkhurshid\.chatgpt\.site/' returning * into result;
  if result.id is not null then insert into public.whatsapp_acceptance_test_events(organization_id,run_id,scenario_key,event_type,safe_summary) values(result.organization_id,result.id,result.scenario_key,'claimed','Controlled deposit dispatcher claimed one verified message.'); end if;
  return result;
end;
$$;


ALTER FUNCTION "public"."claim_deposit_acceptance_dispatch"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reminder_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "appointment_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "scheduled_for" timestamp with time zone NOT NULL,
    "channel" "text" NOT NULL,
    "recipient" "text" NOT NULL,
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "provider_response" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "provider_message_id" "text",
    "connection_id" "uuid",
    "last_attempt_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "read_at" timestamp with time zone,
    "message_id" "uuid",
    "next_attempt_at" timestamp with time zone,
    "max_attempts" integer DEFAULT 5 NOT NULL,
    "failure_reason" "text",
    CONSTRAINT "reminder_events_attempts_check" CHECK (("attempts" >= 0)),
    CONSTRAINT "reminder_events_channel_check" CHECK (("channel" = ANY (ARRAY['whatsapp'::"text", 'email'::"text"]))),
    CONSTRAINT "reminder_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['confirmation'::"text", 'reminder_24h'::"text", 'reminder_2h'::"text", 'follow_up'::"text", 'cancellation'::"text", 'reschedule'::"text"]))),
    CONSTRAINT "reminder_events_max_attempts_check" CHECK ((("max_attempts" >= 1) AND ("max_attempts" <= 10))),
    CONSTRAINT "reminder_events_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'processing'::"text", 'sent'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."reminder_events" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_due_appointment_reminders"("p_limit" integer DEFAULT 20) RETURNS SETOF "public"."reminder_events"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  update public.reminder_events
  set status = 'failed',
      next_attempt_at = null,
      failure_reason = 'Reminder worker lease expired after the maximum attempts.',
      updated_at = now()
  where status = 'processing'
    and last_attempt_at < now() - interval '10 minutes'
    and attempts >= max_attempts;

  return query
  with due as (
    select r.id
    from public.reminder_events r
    where r.channel = 'whatsapp'
      and r.attempts < r.max_attempts
      and (
        (
          r.status = 'scheduled'
          and r.scheduled_for <= now()
          and coalesce(r.next_attempt_at, r.scheduled_for) <= now()
        )
        or (
          r.status = 'processing'
          and r.last_attempt_at < now() - interval '10 minutes'
        )
      )
      and exists (
        select 1 from public.channel_message_templates t
        where t.organization_id = r.organization_id
          and t.channel = 'whatsapp'
          and t.event_type = r.event_type
          and t.status = 'approved'
      )
      and exists (
        select 1 from public.organizations_addresses a
        where a.organization_id = r.organization_id
          and a.service = 'whatsapp'
          and a.status = 'connected'
      )
      and exists (
        select 1 from public.booking_pages b
        where b.organization_id = r.organization_id and b.active
      )
    order by r.scheduled_for
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  )
  update public.reminder_events r
  set status = 'processing',
      attempts = r.attempts + 1,
      last_attempt_at = now(),
      failure_reason = null,
      updated_at = now()
  from due
  where r.id = due.id
  returning r.*;
end;
$$;


ALTER FUNCTION "public"."claim_due_appointment_reminders"("p_limit" integer) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."care_reminder_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "reminder_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "scheduled_for" timestamp with time zone NOT NULL,
    "channel" "text" NOT NULL,
    "status" "text" DEFAULT 'ready'::"text" NOT NULL,
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "provider_message_id" "text",
    "failure_reason" "text",
    "sent_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "next_attempt_at" timestamp with time zone,
    "max_attempts" integer DEFAULT 3 NOT NULL,
    "provider_response" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "acknowledged_at" timestamp with time zone,
    "acknowledgement" "text",
    "last_attempt_at" timestamp with time zone,
    "response_kind" "text",
    "response_text" "text",
    "response_received_at" timestamp with time zone,
    "response_message_id" "uuid",
    "snoozed_until" timestamp with time zone,
    CONSTRAINT "care_reminder_runs_attempts_valid" CHECK ((("attempt_count" >= 0) AND (("max_attempts" >= 1) AND ("max_attempts" <= 5)))),
    CONSTRAINT "care_reminder_runs_channel_check" CHECK (("channel" = ANY (ARRAY['whatsapp'::"text", 'email'::"text", 'manual'::"text"]))),
    CONSTRAINT "care_reminder_runs_response_kind_check" CHECK ((("response_kind" IS NULL) OR ("response_kind" = ANY (ARRAY['confirmed'::"text", 'missed'::"text", 'snoozed'::"text", 'help'::"text"])))),
    CONSTRAINT "care_reminder_runs_status_check" CHECK (("status" = ANY (ARRAY['ready'::"text", 'approved'::"text", 'processing'::"text", 'sent'::"text", 'delivered'::"text", 'read'::"text", 'failed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."care_reminder_runs" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_due_care_reminder_runs"("p_limit" integer DEFAULT 20) RETURNS SETOF "public"."care_reminder_runs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  update public.care_reminder_runs
  set status = 'failed',
      next_attempt_at = null,
      failure_reason = 'Reminder worker lease expired after the maximum attempts.',
      updated_at = now()
  where status = 'processing'
    and last_attempt_at < now() - interval '10 minutes'
    and attempt_count >= max_attempts;

  return query
  with due as (
    select r.id
    from public.care_reminder_runs r
    where r.channel = 'whatsapp'
      and r.attempt_count < r.max_attempts
      and (
        (
          r.status = 'approved'
          and r.scheduled_for <= now()
          and coalesce(r.next_attempt_at, r.scheduled_for) <= now()
        )
        or (
          r.status = 'processing'
          and r.last_attempt_at < now() - interval '10 minutes'
        )
      )
    order by r.scheduled_for
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  )
  update public.care_reminder_runs r
  set status = 'processing',
      attempt_count = r.attempt_count + 1,
      last_attempt_at = now(),
      failure_reason = null,
      updated_at = now()
  from due
  where r.id = due.id
  returning r.*;
end;
$$;


ALTER FUNCTION "public"."claim_due_care_reminder_runs"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_due_device_push_deliveries"("p_limit" integer DEFAULT 20) RETURNS TABLE("delivery_id" "uuid", "subscription_id" "uuid", "endpoint" "text", "p256dh_key" "text", "auth_key" "text", "title" "text", "body" "text", "href" "text", "notification_id" "uuid", "attempts" integer, "max_attempts" integer)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private'
    AS $$
  select * from private.claim_due_device_push_deliveries(p_limit);
$$;


ALTER FUNCTION "public"."claim_due_device_push_deliveries"("p_limit" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."claim_due_device_push_deliveries"("p_limit" integer) IS 'Service-role-only RPC bridge for the private durable device-push queue claim.';



CREATE TABLE IF NOT EXISTS "public"."doctor_queue_dispatches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "availability_rule_id" "uuid" NOT NULL,
    "shift_date" "date" NOT NULL,
    "shift_starts_at" timestamp with time zone NOT NULL,
    "scheduled_for" timestamp with time zone NOT NULL,
    "recipient_phone" "text" NOT NULL,
    "booking_count" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "max_attempts" integer DEFAULT 3 NOT NULL,
    "next_attempt_at" timestamp with time zone,
    "message_id" "uuid",
    "failure_reason" "text",
    "provider_response" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "provider_message_id" "text",
    "sent_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "read_at" timestamp with time zone,
    CONSTRAINT "doctor_queue_dispatches_attempts_check" CHECK (("attempts" >= 0)),
    CONSTRAINT "doctor_queue_dispatches_booking_count_check" CHECK (("booking_count" >= 0)),
    CONSTRAINT "doctor_queue_dispatches_max_attempts_check" CHECK ((("max_attempts" >= 1) AND ("max_attempts" <= 10))),
    CONSTRAINT "doctor_queue_dispatches_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'processing'::"text", 'queued'::"text", 'sent'::"text", 'delivered'::"text", 'read'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."doctor_queue_dispatches" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_due_doctor_queue_dispatches"("p_limit" integer DEFAULT 20) RETURNS SETOF "public"."doctor_queue_dispatches"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  return query
  with due as (
    select d.id from public.doctor_queue_dispatches d
    where d.status in ('scheduled','failed')
      and d.scheduled_for<=now() and coalesce(d.next_attempt_at,d.scheduled_for)<=now()
      and d.attempts<d.max_attempts
    order by d.scheduled_for for update skip locked limit least(greatest(p_limit,1),100)
  )
  update public.doctor_queue_dispatches d set status='processing',attempts=d.attempts+1,updated_at=now()
  from due where d.id=due.id returning d.*;
end;
$$;


ALTER FUNCTION "public"."claim_due_doctor_queue_dispatches"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_managed_automation_runs"("p_limit" integer DEFAULT 10) RETURNS SETOF "public"."automation_runs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  return query
  with due as (
    select r.id
    from public.automation_runs r
    join public.automation_workflows w on w.id = r.workflow_id and w.organization_id = r.organization_id
    where r.status in ('queued', 'retrying')
      and coalesce(r.next_attempt_at, r.created_at) <= now()
      and w.status = 'active'
      and w.trigger_key = 'booking_confirmed'
      and w.configuration->>'execution_mode' = 'managed'
      and w.configuration->>'rollout_review' = 'approved'
      and coalesce((w.configuration->>'managed_canary')::boolean, false) = true
      and coalesce((w.configuration->>'kill_switch')::boolean, false) = false
      and private.managed_booking_rollout_ready(w.organization_id, w.id)
    order by coalesce(r.next_attempt_at, r.created_at), r.created_at
    for update of r skip locked
    limit greatest(1, least(p_limit, 20))
  )
  update public.automation_runs r
  set status = 'processing',
      attempt_count = r.attempt_count + 1,
      started_at = now(),
      updated_at = now()
  from due
  where r.id = due.id
  returning r.*;
end;
$$;


ALTER FUNCTION "public"."claim_managed_automation_runs"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_orphaned_contact_on_sync"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  _active_count int;
begin
  -- At this point new.contact_id is null (set by manage_contact_on_address_sync).
  -- Count any other active addresses still referencing the old contact.
  select count(*) into _active_count
  from public.contacts_addresses
  where contact_id = old.contact_id
    and status = 'active';

  -- If no other addresses reference it, delete the orphaned contact.
  if _active_count = 0 then
    delete from public.contacts where id = old.contact_id;
  end if;

  return null;
end;
$$;


ALTER FUNCTION "public"."cleanup_orphaned_contact_on_sync"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_unlinked_address_if_empty"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  -- Only if we became unlinked (contact_id IS NULL)
  if new.contact_id is null and old.contact_id is not null then
    -- If no conversations, delete the address
    if not exists (
      select 1 from public.conversations c
      where c.organization_id = new.organization_id
        and c.service = new.service
        and c.contact_address = new.address
    ) then
      delete from public.contacts_addresses
      where organization_id = new.organization_id
        and service = new.service
        and address = new.address;
    end if;
  end if;

  return null;
end;
$$;


ALTER FUNCTION "public"."cleanup_unlinked_address_if_empty"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."communication_control_enabled"("p_organization_id" "uuid", "p_control" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce((select case p_control
    when 'confirmation' then booking_confirmation_enabled
    when 'reminder_24h' then reminder_24h_enabled
    when 'reminder_2h' then reminder_2h_enabled
    when 'follow_up' then follow_up_enabled
    when 'medication_reminder' then medication_reminder_enabled
    when 'marketing' then marketing_campaigns_enabled
    when 'emergency' then emergency_notices_enabled
    else true end
    from public.organization_communication_controls where organization_id = p_organization_id),
    case when p_control = 'marketing' then false else true end);
$$;


ALTER FUNCTION "public"."communication_control_enabled"("p_organization_id" "uuid", "p_control" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_appointment_visit"("p_organization_id" "uuid", "p_appointment_id" "uuid", "p_clinical_note" "text", "p_diagnosis" "text" DEFAULT NULL::"text", "p_treatment_plan" "text" DEFAULT NULL::"text", "p_follow_up_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_follow_up_note" "text" DEFAULT NULL::"text", "p_encounter_type" "text" DEFAULT 'consultation'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  appointment_row public.appointments%rowtype;
  encounter_id uuid;
  actor_id uuid := auth.uid();
  clean_note text := nullif(trim(coalesce(p_clinical_note, '')), '');
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;
  if not private.is_organization_member(p_organization_id, 'admin') then
    raise exception 'Administrator access required';
  end if;
  if clean_note is null then
    raise exception 'Clinical note is required';
  end if;
  if p_encounter_type not in ('consultation','follow_up','procedure','vaccination','other') then
    raise exception 'Invalid encounter type';
  end if;
  if p_follow_up_at is not null and p_follow_up_at <= now() then
    raise exception 'Follow-up must be scheduled in the future';
  end if;

  select * into appointment_row
  from public.appointments
  where id = p_appointment_id and organization_id = p_organization_id
  for update;

  if appointment_row.id is null then
    raise exception 'Appointment not found';
  end if;
  if appointment_row.status not in ('confirmed','arrived','in_consultation','completed') then
    raise exception 'Appointment cannot be completed from status %', appointment_row.status;
  end if;

  if appointment_row.patient_id is null then
    perform private.sync_patient_from_appointment(appointment_row.id);
    select * into appointment_row
    from public.appointments
    where id = p_appointment_id and organization_id = p_organization_id;
  end if;
  if appointment_row.patient_id is null then
    raise exception 'Patient identity could not be resolved';
  end if;

  if appointment_row.status <> 'completed' then
    perform public.update_appointment_status(p_organization_id, p_appointment_id, 'completed');
  end if;

  insert into public.patient_encounters (
    organization_id, patient_id, appointment_id, encounter_type, occurred_at,
    diagnosis, clinical_note, treatment_plan, follow_up_at, follow_up_status, created_by
  )
  values (
    p_organization_id, appointment_row.patient_id, p_appointment_id, p_encounter_type, now(),
    nullif(trim(coalesce(p_diagnosis, '')), ''), clean_note,
    nullif(trim(coalesce(p_treatment_plan, '')), ''), p_follow_up_at,
    case when p_follow_up_at is null then 'not_required' else 'scheduled' end,
    actor_id
  )
  on conflict (appointment_id) where appointment_id is not null
  do update set
    encounter_type = excluded.encounter_type,
    diagnosis = excluded.diagnosis,
    clinical_note = excluded.clinical_note,
    treatment_plan = excluded.treatment_plan,
    follow_up_at = excluded.follow_up_at,
    follow_up_status = case
      when excluded.follow_up_at is null then 'not_required'
      when public.patient_encounters.follow_up_status = 'completed' then 'completed'
      else 'scheduled'
    end,
    updated_at = now()
  returning id into encounter_id;

  perform public.set_appointment_follow_up(
    p_organization_id, p_appointment_id, p_follow_up_at, p_follow_up_note
  );

  if p_follow_up_at is not null then
    insert into public.patient_care_tasks (
      organization_id, patient_id, encounter_id, appointment_id, task_type,
      title, details, due_at, priority, status, assigned_to, created_by
    )
    values (
      p_organization_id, appointment_row.patient_id, encounter_id, p_appointment_id,
      'follow_up', 'Patient follow-up',
      coalesce(nullif(trim(coalesce(p_follow_up_note, '')), ''), 'Follow up after completed appointment'),
      p_follow_up_at, 'normal', 'open', actor_id, actor_id
    )
    on conflict (appointment_id, task_type)
      where appointment_id is not null and task_type = 'follow_up'
    do update set
      encounter_id = excluded.encounter_id,
      patient_id = excluded.patient_id,
      details = excluded.details,
      due_at = excluded.due_at,
      status = 'open',
      assigned_to = excluded.assigned_to,
      completed_at = null,
      completed_by = null,
      updated_at = now();
  else
    update public.patient_care_tasks
    set status = 'cancelled', updated_at = now()
    where appointment_id = p_appointment_id
      and task_type = 'follow_up'
      and status in ('open','in_progress');
  end if;

  return encounter_id;
end;
$$;


ALTER FUNCTION "public"."complete_appointment_visit"("p_organization_id" "uuid", "p_appointment_id" "uuid", "p_clinical_note" "text", "p_diagnosis" "text", "p_treatment_plan" "text", "p_follow_up_at" timestamp with time zone, "p_follow_up_note" "text", "p_encounter_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_clinical_consultation"("p_organization_id" "uuid", "p_appointment_id" "uuid", "p_encounter_type" "text" DEFAULT 'consultation'::"text", "p_diagnosis" "text" DEFAULT NULL::"text", "p_clinical_note" "text" DEFAULT NULL::"text", "p_treatment_plan" "text" DEFAULT NULL::"text", "p_follow_up_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  a public.appointments%rowtype;
  e public.patient_encounters%rowtype;
  reminder_at timestamptz;
  reminder_created boolean := false;
begin
  if not private.is_organization_member(p_organization_id, 'admin') then raise exception 'Administrator access required'; end if;
  if p_encounter_type not in ('consultation','follow_up','procedure','vaccination','other') then raise exception 'Invalid encounter type'; end if;
  if nullif(trim(coalesce(p_clinical_note, '')), '') is null then raise exception 'Clinical note is required before completing a consultation'; end if;
  if p_follow_up_at is not null and p_follow_up_at <= now() then raise exception 'Follow-up must be scheduled in the future'; end if;
  select * into a from public.appointments where id = p_appointment_id and organization_id = p_organization_id for update;
  if a.id is null then raise exception 'Appointment not found'; end if;
  if a.patient_id is null then raise exception 'This appointment is not linked to a patient profile'; end if;
  if a.status not in ('confirmed','arrived','in_consultation') then raise exception 'Only an active consultation can be completed'; end if;
  if exists (select 1 from public.patient_encounters where organization_id = p_organization_id and appointment_id = p_appointment_id) then raise exception 'A clinical visit is already recorded for this appointment'; end if;
  insert into public.patient_encounters (
    organization_id, patient_id, appointment_id, encounter_type, occurred_at,
    diagnosis, clinical_note, treatment_plan, follow_up_at, follow_up_status, created_by
  ) values (
    p_organization_id, a.patient_id, a.id, p_encounter_type, now(),
    nullif(trim(coalesce(p_diagnosis, '')), ''), trim(p_clinical_note),
    nullif(trim(coalesce(p_treatment_plan, '')), ''), p_follow_up_at,
    case when p_follow_up_at is null then 'not_required' else 'scheduled' end, auth.uid()
  ) returning * into e;
  perform public.update_appointment_status(p_organization_id, p_appointment_id, 'completed');
  if p_follow_up_at is not null then
    reminder_at := greatest(now() + interval '5 minutes', p_follow_up_at - interval '24 hours');
    insert into public.care_reminders (
      organization_id, patient_id, encounter_id, reminder_type, title, instructions,
      schedule_kind, scheduled_for, timezone, channel, status, consent_snapshot, next_run_at, created_by
    ) values (
      p_organization_id, a.patient_id, e.id, 'follow_up', 'Follow-up visit reminder',
      'Please confirm or reschedule your follow-up visit with the clinic.', 'one_time', reminder_at,
      'Asia/Kolkata', 'whatsapp', 'active', a.care_communications_consent, reminder_at, auth.uid()
    );
    reminder_created := true;
  end if;
  return jsonb_build_object(
    'encounter_id', e.id, 'patient_id', a.patient_id, 'appointment_status', 'completed',
    'reminder_created', reminder_created,
    'delivery_blocked', p_follow_up_at is not null and not a.care_communications_consent
  );
end;
$$;


ALTER FUNCTION "public"."complete_clinical_consultation"("p_organization_id" "uuid", "p_appointment_id" "uuid", "p_encounter_type" "text", "p_diagnosis" "text", "p_clinical_note" "text", "p_treatment_plan" "text", "p_follow_up_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_deposit_acceptance_dispatch"("p_run_id" "uuid", "p_lease_token" "uuid", "p_passed" boolean, "p_evidence_reference" "text", "p_failure_summary" "text" DEFAULT NULL::"text") RETURNS "public"."whatsapp_acceptance_test_runs"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$ select private.complete_whatsapp_acceptance_test(p_run_id,p_lease_token,p_passed,p_evidence_reference,p_failure_summary) $$;


ALTER FUNCTION "public"."complete_deposit_acceptance_dispatch"("p_run_id" "uuid", "p_lease_token" "uuid", "p_passed" boolean, "p_evidence_reference" "text", "p_failure_summary" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_managed_automation_run"("p_run_id" "uuid", "p_succeeded" boolean, "p_retryable" boolean DEFAULT false, "p_failure_code" "text" DEFAULT NULL::"text", "p_failure_summary" "text" DEFAULT NULL::"text", "p_observed_message_id" "uuid" DEFAULT NULL::"uuid") RETURNS "public"."automation_runs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare result public.automation_runs;
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  update public.automation_runs r
  set status = case
        when p_succeeded then 'succeeded'
        when p_retryable and r.attempt_count < r.max_attempts then 'retrying'
        else 'failed'
      end,
      next_attempt_at = case
        when not p_succeeded and p_retryable and r.attempt_count < r.max_attempts
          then now() + make_interval(mins => least(60, 5 * (2 ^ greatest(0, r.attempt_count - 1))::integer))
        else null
      end,
      completed_at = case
        when p_succeeded or not p_retryable or r.attempt_count >= r.max_attempts then now()
        else null
      end,
      failure_code = case when p_succeeded then null else left(coalesce(p_failure_code, 'execution_error'), 100) end,
      failure_summary = case when p_succeeded then null else left(coalesce(p_failure_summary, 'Managed execution could not be completed.'), 500) end,
      observed_message_id = coalesce(p_observed_message_id, r.observed_message_id),
      delivery_status = case when p_succeeded and p_observed_message_id is not null then 'accepted' else r.delivery_status end,
      updated_at = now()
  where r.id = p_run_id and r.status = 'processing'
  returning * into result;

  if result.id is null then
    raise exception 'Managed automation run is not processing' using errcode = 'P0002';
  end if;
  return result;
end;
$$;


ALTER FUNCTION "public"."complete_managed_automation_run"("p_run_id" "uuid", "p_succeeded" boolean, "p_retryable" boolean, "p_failure_code" "text", "p_failure_summary" "text", "p_observed_message_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_whatsapp_booking_handoff"("p_handoff_token" "text", "p_booking_reference" "text", "p_manage_token" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare h private.whatsapp_booking_handoffs%rowtype;v_appointment_id uuid;a public.appointments%rowtype;
  base_url text;manage_url text;queued_at timestamptz:=now();
begin
  if coalesce((select auth.jwt()->>'role'),'')<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  select * into h from private.whatsapp_booking_handoffs
   where token_hash=extensions.digest(convert_to(p_handoff_token,'UTF8'),'sha256') for update;
  if h.id is null then raise exception 'WhatsApp booking handoff is invalid'; end if;
  select c.appointment_id into v_appointment_id from private.customer_booking_access c
   where c.booking_reference=upper(trim(p_booking_reference)) and c.token_hash=extensions.digest(convert_to(p_manage_token,'UTF8'),'sha256');
  select * into a from public.appointments ap where ap.id=v_appointment_id and ap.organization_id=h.organization_id for update;
  if a.id is null or a.id is distinct from h.appointment_id or a.status<>'confirmed' then raise exception 'Confirmed appointment does not match this WhatsApp handoff'; end if;
  if h.consumed_at is not null then
    return exists(select 1 from public.whatsapp_booking_requests wbr where wbr.appointment_id=a.id and wbr.status='confirmed');
  end if;
  perform public.link_whatsapp_booking_consent(h.consent_evidence_id,a.id);
  insert into public.whatsapp_booking_requests(organization_id,session_id,conversation_id,appointment_id,
    patient_name,patient_phone,service_id,location_id,resource_id,starts_at,status,booking_consent_evidence_id)
  select h.organization_id,h.session_id,h.conversation_id,a.id,h.patient_name,a.customer_phone,h.service_id,h.location_id,h.resource_id,h.starts_at,'confirmed',h.consent_evidence_id
  where not exists(select 1 from public.whatsapp_booking_requests wbr where wbr.appointment_id=a.id);
  select regexp_replace(coalesce(patient_portal_base_url,''),'/+$','') into base_url from public.whatsapp_booking_settings where organization_id=h.organization_id;
  manage_url:=base_url||'/booking/manage?reference='||p_booking_reference||'&token='||p_manage_token;
  insert into public.messages(organization_id,conversation_id,organization_address,contact_address,service,direction,content,status,"timestamp")
  select h.organization_id,h.conversation_id,c.organization_address,c.contact_address,'whatsapp','outgoing',
    jsonb_build_object('version','1','type','text','kind','text','text','Appointment confirmed. Reference: '||p_booking_reference||E'.\nManage, reschedule or cancel securely: '||manage_url),
    jsonb_build_object('pending',queued_at,'source','whatsapp_booking_handoff','handoff_id',h.id),queued_at
  from public.conversations c where c.id=h.conversation_id and c.organization_id=h.organization_id
    and not exists(select 1 from public.messages m where m.conversation_id=h.conversation_id and m.status->>'source'='whatsapp_booking_handoff' and m.status->>'handoff_id'=h.id::text);
  update public.whatsapp_booking_sessions set state='welcome',context='{}'::jsonb,updated_at=now() where id=h.session_id;
  update private.whatsapp_booking_handoffs set consumed_at=now() where id=h.id;
  return true;
end $_$;


ALTER FUNCTION "public"."complete_whatsapp_booking_handoff"("p_handoff_token" "text", "p_booking_reference" "text", "p_manage_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_workspace_onboarding"("p_business_name" "text", "p_business_category" "text", "p_location_count" integer DEFAULT 1, "p_timezone" "text" DEFAULT 'Asia/Kolkata'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  new_organization_id uuid;
  normalized_location_count integer;
  allowed_categories constant text[] := array[
    'Healthcare', 'Restaurants & hospitality', 'Coaching & education',
    'Beauty & wellness', 'Professional services', 'Real estate',
    'Automotive services', 'Retail & e-commerce', 'Home services', 'Other'
  ];
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  if length(trim(p_business_name)) < 2 then
    raise exception 'Business name must contain at least 2 characters';
  end if;
  if not (p_business_category = any(allowed_categories)) then
    raise exception 'Unsupported business category';
  end if;

  normalized_location_count := greatest(1, least(coalesce(p_location_count, 1), 5));
  new_organization_id := gen_random_uuid();

  insert into public.organizations (id, name, extra)
  values (
    new_organization_id,
    trim(p_business_name),
    jsonb_build_object(
      'business_category', p_business_category,
      'location_count', normalized_location_count,
      'timezone', coalesce(nullif(trim(p_timezone), ''), 'Asia/Kolkata'),
      'onboarding_version', 3,
      'onboarding_status', 'completed'
    )
  );
  return new_organization_id;
end;
$$;


ALTER FUNCTION "public"."complete_workspace_onboarding"("p_business_name" "text", "p_business_category" "text", "p_location_count" integer, "p_timezone" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_workspace_onboarding"("p_business_name" "text", "p_business_category" "text", "p_location_count" integer DEFAULT 1, "p_timezone" "text" DEFAULT 'Asia/Kolkata'::"text", "p_clinic_mode" "text" DEFAULT NULL::"text", "p_primary_provider_name" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  new_organization_id uuid;
  normalized_location_count integer;
  normalized_provider_name text;
  normalized_clinic_mode text;
  allowed_categories constant text[] := array[
    'Healthcare', 'Restaurants & hospitality', 'Coaching & education',
    'Beauty & wellness', 'Professional services', 'Real estate',
    'Automotive services', 'Retail & e-commerce', 'Home services', 'Other'
  ];
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  if length(trim(p_business_name)) < 2 then
    raise exception 'Business name must contain at least 2 characters';
  end if;
  if not (p_business_category = any(allowed_categories)) then
    raise exception 'Unsupported business category';
  end if;

  normalized_location_count := greatest(1, least(coalesce(p_location_count, 1), 5));
  normalized_clinic_mode := case when p_business_category = 'Healthcare'
    then coalesce(nullif(trim(p_clinic_mode), ''), 'solo_practitioner') else null end;
  if normalized_clinic_mode is not null and normalized_clinic_mode not in ('solo_practitioner','multi_doctor_clinic','diagnostic_centre') then
    raise exception 'Unsupported clinic operating model';
  end if;
  normalized_provider_name := nullif(trim(p_primary_provider_name), '');
  if p_business_category = 'Healthcare' and length(coalesce(normalized_provider_name, '')) < 2 then
    raise exception 'Enter the first doctor''s full name';
  end if;

  new_organization_id := gen_random_uuid();
  insert into public.organizations (id, name, extra)
  values (
    new_organization_id,
    trim(p_business_name),
    jsonb_build_object(
      'business_category', p_business_category,
      'location_count', normalized_location_count,
      'timezone', coalesce(nullif(trim(p_timezone), ''), 'Asia/Kolkata'),
      'onboarding_version', 4,
      'onboarding_status', 'completed'
    )
  );

  if normalized_provider_name is not null then
    update public.booking_resources
    set name = normalized_provider_name, updated_at = now()
    where organization_id = new_organization_id and name = 'Primary provider';
  end if;
  if normalized_clinic_mode is not null then
    update public.onboarding_profiles
    set clinic_mode = normalized_clinic_mode, updated_at = now()
    where organization_id = new_organization_id;
  end if;
  return new_organization_id;
end;
$$;


ALTER FUNCTION "public"."complete_workspace_onboarding"("p_business_name" "text", "p_business_category" "text", "p_location_count" integer, "p_timezone" "text", "p_clinic_mode" "text", "p_primary_provider_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_public_payment"("p_booking_reference" "text", "p_manage_token" "text", "p_provider_order_id" "text", "p_provider_payment_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_appointment_id uuid;org_id uuid;result jsonb;
begin
  select c.appointment_id into v_appointment_id from private.customer_booking_access c
  where c.booking_reference=upper(trim(p_booking_reference))
    and c.token_hash=extensions.digest(convert_to(p_manage_token,'UTF8'),'sha256');
  if v_appointment_id is null then raise exception 'Payment hold not found'; end if;
  update public.booking_payments p set status='paid',provider_payment_id=trim(p_provider_payment_id),paid_at=now(),updated_at=now()
  from public.appointments a
  where p.appointment_id=v_appointment_id and a.id=p.appointment_id and p.status='created'
    and p.provider_order_id=p_provider_order_id and a.status='payment_pending' and a.hold_expires_at>now()
  returning p.organization_id into org_id;
  if org_id is null then raise exception 'Payment hold has expired or was already processed'; end if;
  update public.appointments set status='confirmed',payment_status='paid',hold_expires_at=null,updated_at=now()
  where id=v_appointment_id;
  insert into public.appointment_events(organization_id,appointment_id,event_type,actor_type,details)
  values(org_id,v_appointment_id,'payment_confirmed','system',jsonb_build_object('provider','razorpay','provider_payment_id',p_provider_payment_id));
  perform private.queue_appointment_reminders(v_appointment_id);
  select jsonb_build_object(
    'appointment_id',a.id,'booking_reference',upper(trim(p_booking_reference)),
    'starts_at',a.starts_at,'ends_at',a.ends_at,'status',a.status,'payment_status',a.payment_status
  ) into result from public.appointments a where a.id=v_appointment_id;
  return result;
end;
$$;


ALTER FUNCTION "public"."confirm_public_payment"("p_booking_reference" "text", "p_manage_token" "text", "p_provider_order_id" "text", "p_provider_payment_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_api_rate_limit"("p_bucket" "text", "p_limit" integer, "p_window_seconds" integer) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  actor uuid := (select auth.uid());
  window_start timestamptz;
  current_hits integer;
begin
  if actor is null then raise exception 'authentication required'; end if;
  if p_bucket not in ('team_invite','team_role_change','team_deactivate','team_reactivate','incident_create','incident_update','data_request_update','doctor_bulk_import','doctor_queue_setting','doctor_queue_manual','deposit_acceptance_prepare','mobile_alert_test')
    or p_limit < 1 or p_limit > 100 or p_window_seconds < 60 or p_window_seconds > 86400 then
    raise exception 'invalid rate limit configuration';
  end if;
  window_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into private.api_rate_limits(actor_user_id,bucket,window_started_at) values(actor,p_bucket,window_start)
  on conflict (actor_user_id,bucket,window_started_at) do update set hit_count=private.api_rate_limits.hit_count+1,updated_at=now()
  returning hit_count into current_hits;
  return current_hits <= p_limit;
end;
$$;


ALTER FUNCTION "public"."consume_api_rate_limit"("p_bucket" "text", "p_limit" integer, "p_window_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_booking_phone_verification"("p_challenge_id" "uuid", "p_verification_token" "text", "p_booking_reference" "text", "p_manage_token" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
end;$$;


ALTER FUNCTION "public"."consume_booking_phone_verification"("p_challenge_id" "uuid", "p_verification_token" "text", "p_booking_reference" "text", "p_manage_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_public_server_rate_limit"("p_bucket" "text", "p_scope" "text", "p_client_signal" "text", "p_limit" integer, "p_window_seconds" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  pepper text;
  digest_hex text;
  actor_id uuid;
  window_start timestamptz;
  current_hits integer;
begin
  if p_bucket not in (
      'public_booking_manage_lookup',
      'public_booking_identity',
      'public_booking_cancel',
      'public_booking_reschedule'
    )
    or p_limit < 1 or p_limit > 100
    or p_window_seconds < 60 or p_window_seconds > 3600
    or nullif(trim(coalesce(p_scope, '')), '') is null
    or nullif(trim(coalesce(p_client_signal, '')), '') is null then
    raise exception 'Invalid public server request limit';
  end if;

  select decrypted_secret into pepper
  from vault.decrypted_secrets
  where name = 'edge_functions_token'
  limit 1;
  if nullif(pepper, '') is null then
    raise exception 'Public request protection is temporarily unavailable';
  end if;

  digest_hex := encode(
    extensions.hmac(
      p_bucket || '|' || lower(trim(p_scope)) || '|' || trim(p_client_signal),
      pepper,
      'sha256'
    ),
    'hex'
  );
  actor_id := (
    substr(digest_hex, 1, 8) || '-' || substr(digest_hex, 9, 4) || '-' ||
    substr(digest_hex, 13, 4) || '-' || substr(digest_hex, 17, 4) || '-' ||
    substr(digest_hex, 21, 12)
  )::uuid;
  window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into private.api_rate_limits(actor_user_id,bucket,window_started_at)
  values(actor_id,p_bucket,window_start)
  on conflict(actor_user_id,bucket,window_started_at)
  do update set hit_count=private.api_rate_limits.hit_count+1,updated_at=now()
  returning hit_count into current_hits;

  if current_hits > p_limit then
    raise exception 'Too many requests. Please wait before trying again.';
  end if;
end;
$$;


ALTER FUNCTION "public"."consume_public_server_rate_limit"("p_bucket" "text", "p_scope" "text", "p_client_signal" "text", "p_limit" integer, "p_window_seconds" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."consume_public_server_rate_limit"("p_bucket" "text", "p_scope" "text", "p_client_signal" "text", "p_limit" integer, "p_window_seconds" integer) IS 'Service-only preflight limiter. Raw request signals are HMAC-derived and are never stored.';



CREATE OR REPLACE FUNCTION "public"."contact_address_update_rules"("p_organization_id" "uuid", "p_service" "public"."service", "p_address" "text", "p_extra" "jsonb", "p_status" "text") RETURNS boolean
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  return exists (
    select 1 from public.contacts_addresses
    where organization_id = p_organization_id
      and address = p_address
      and service = p_service
      and status = p_status
      and extra is not distinct from p_extra
  );
end;
$$;


ALTER FUNCTION "public"."contact_address_update_rules"("p_organization_id" "uuid", "p_service" "public"."service", "p_address" "text", "p_extra" "jsonb", "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."control_automation_run"("p_organization_id" "uuid", "p_run_id" "uuid", "p_action" "text") RETURNS "public"."automation_runs"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare result public.automation_runs;
begin
  if not private.is_organization_member(p_organization_id,'admin') then raise exception 'Administrator access required'; end if;
  if p_action='retry' then
    update public.automation_runs set status='queued',next_attempt_at=now(),failure_code=null,failure_summary=null,completed_at=null,updated_at=now()
    where id=p_run_id and organization_id=p_organization_id and status='failed' and attempt_count<max_attempts returning * into result;
  elsif p_action='cancel' then
    update public.automation_runs set status='cancelled',next_attempt_at=null,completed_at=now(),updated_at=now()
    where id=p_run_id and organization_id=p_organization_id and status in ('queued','retrying') returning * into result;
  else raise exception 'Unsupported automation action'; end if;
  if result.id is null then raise exception 'Automation run cannot be changed'; end if;
  return result;
end; $$;


ALTER FUNCTION "public"."control_automation_run"("p_organization_id" "uuid", "p_run_id" "uuid", "p_action" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_appointment"("p_organization_id" "uuid", "p_resource_id" "uuid", "p_location_id" "uuid", "p_service_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_starts_at" timestamp with time zone, "p_notes" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$ declare service_duration integer; service_buffer integer; new_id uuid; begin if not private.is_organization_member(p_organization_id,'admin') then raise exception 'Administrator access required'; end if; if length(trim(p_customer_name))<2 then raise exception 'Customer name is required'; end if; if p_starts_at < now()-interval '5 minutes' then raise exception 'Appointment must be in the future'; end if; select duration_minutes,buffer_minutes into service_duration,service_buffer from public.organization_services where id=p_service_id and organization_id=p_organization_id and active and booking_enabled; if service_duration is null then raise exception 'Bookable service not found'; end if; if not exists(select 1 from public.booking_resources where id=p_resource_id and organization_id=p_organization_id and active) then raise exception 'Booking resource not found'; end if; if not exists(select 1 from public.business_locations where id=p_location_id and organization_id=p_organization_id and active) then raise exception 'Location not found'; end if; insert into public.appointments (organization_id,resource_id,location_id,service_id,customer_name,customer_phone,customer_email,starts_at,ends_at,notes) values (p_organization_id,p_resource_id,p_location_id,p_service_id,trim(p_customer_name),nullif(trim(p_customer_phone),''),nullif(trim(p_customer_email),''),p_starts_at,p_starts_at+make_interval(mins=>service_duration+service_buffer),nullif(trim(p_notes),'')) returning id into new_id; return new_id; exception when exclusion_violation then raise exception 'This provider already has an appointment during that time'; end; $$;


ALTER FUNCTION "public"."create_appointment"("p_organization_id" "uuid", "p_resource_id" "uuid", "p_location_id" "uuid", "p_service_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_starts_at" timestamp with time zone, "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_booking_phone_otp_challenge"("p_slug" "text", "p_phone" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
end;$$;


ALTER FUNCTION "public"."create_booking_phone_otp_challenge"("p_slug" "text", "p_phone" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_patient_data_request_from_portal"("p_token" "text", "p_request_type" "text", "p_summary" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare s private.patient_portal_sessions%rowtype; r public.patient_data_requests%rowtype;
begin
  if p_request_type not in ('access_export','correction','consent_withdrawal','erasure') or char_length(trim(coalesce(p_summary,''))) not between 5 and 1000 then raise exception 'invalid request'; end if;
  select * into s from private.patient_portal_sessions x where x.access_token_hash=extensions.digest(convert_to(coalesce(p_token,''),'UTF8'),'sha256') and x.revoked_at is null and x.consumed_at is not null and x.expires_at>now();
  if s.id is null then raise exception 'secure session invalid or expired'; end if;
  if exists(select 1 from public.patient_data_requests d where d.organization_id=s.organization_id and d.patient_id=s.patient_id and d.request_type=p_request_type and d.status not in ('completed','rejected','cancelled')) then raise exception 'an active request of this type already exists'; end if;
  insert into public.patient_data_requests(organization_id,patient_id,request_type,source_channel,request_summary,identity_method,identity_verified_at)
  values(s.organization_id,s.patient_id,p_request_type,'patient_portal',trim(p_summary),'short_lived_whatsapp_portal_session',now()) returning * into r;
  return jsonb_build_object('id',r.id,'reference',r.reference,'request_type',r.request_type,'status',r.status,'created_at',r.created_at);
end $$;


ALTER FUNCTION "public"."create_patient_data_request_from_portal"("p_token" "text", "p_request_type" "text", "p_summary" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_patient_portal_session"("p_organization_id" "uuid", "p_phone" "text", "p_conversation_id" "uuid" DEFAULT NULL::"uuid", "p_scope" "text" DEFAULT 'all'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_patient public.patient_profiles%rowtype;
  v_token text;
  v_expires_at timestamptz := now() + interval '15 minutes';
  v_phone text := regexp_replace(coalesce(p_phone,''), '\D', '', 'g');
begin
  if p_scope not in ('bookings','records','all') then
    raise exception 'Invalid portal scope';
  end if;
  if length(v_phone) < 10 then
    return jsonb_build_object('found', false);
  end if;

  select p.* into v_patient
  from public.patient_profiles p
  where p.organization_id = p_organization_id
    and (
      regexp_replace(coalesce(p.phone,''), '\D', '', 'g') = v_phone
      or regexp_replace(coalesce(p.primary_contact_phone,''), '\D', '', 'g') = v_phone
    )
  order by case when regexp_replace(coalesce(p.phone,''), '\D', '', 'g') = v_phone then 0 else 1 end,
           p.updated_at desc
  limit 1;

  if v_patient.id is null then
    return jsonb_build_object('found', false);
  end if;

  update private.patient_portal_sessions
     set revoked_at = now()
   where organization_id = p_organization_id
     and patient_id = v_patient.id
     and scope = p_scope
     and revoked_at is null;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.patient_portal_sessions(
    organization_id, patient_id, conversation_id, token_hash, scope, expires_at
  ) values (
    p_organization_id, v_patient.id, p_conversation_id,
    extensions.digest(convert_to(v_token,'UTF8'),'sha256'), p_scope, v_expires_at
  );

  return jsonb_build_object(
    'found', true,
    'token', v_token,
    'expires_at', v_expires_at,
    'patient_name', v_patient.full_name
  );
end;
$$;


ALTER FUNCTION "public"."create_patient_portal_session"("p_organization_id" "uuid", "p_phone" "text", "p_conversation_id" "uuid", "p_scope" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_public_appointment"("p_slug" "text", "p_resource_id" "uuid", "p_location_id" "uuid", "p_service_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_starts_at" timestamp with time zone, "p_notes" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  org_id uuid;duration_mins int;buffer_mins int;tz text;local_start timestamp;
  v_assignment_id uuid;valid_rule boolean;new_id uuid;token text;reference text;v_payment_mode text;
begin
  perform private.expire_stale_payment_holds(p_resource_id);
  select organization_id into org_id from public.booking_pages where slug=lower(trim(p_slug)) and active;
  if org_id is null then raise exception 'Booking page not found'; end if;
  if length(trim(p_customer_name))<2 then raise exception 'Customer name is required'; end if;
  if nullif(trim(coalesce(p_customer_phone,'')),'') is null and nullif(trim(coalesce(p_customer_email,'')),'') is null then raise exception 'Mobile number or email is required'; end if;
  if p_starts_at<=now() then raise exception 'Appointment must be in the future'; end if;
  select a.id into v_assignment_id from public.provider_location_assignments a where a.organization_id=org_id and a.resource_id=p_resource_id and a.location_id=p_location_id and a.active
    and (p_starts_at at time zone 'Asia/Kolkata')::date>=a.effective_from and (a.effective_to is null or (p_starts_at at time zone 'Asia/Kolkata')::date<=a.effective_to);
  select coalesce(x.duration_minutes,s.duration_minutes),coalesce(x.buffer_minutes,s.buffer_minutes),x.payment_mode
  into duration_mins,buffer_mins,v_payment_mode from public.provider_location_services x join public.organization_services s on s.id=x.service_id
  where x.assignment_id=v_assignment_id and x.service_id=p_service_id and x.active and s.active and s.booking_enabled;
  select timezone into tz from public.booking_resources where id=p_resource_id and organization_id=org_id and active;
  if duration_mins is null or tz is null then raise exception 'Invalid booking selection'; end if;
  if v_payment_mode<>'pay_at_location' then raise exception 'Online payment is required for this appointment'; end if;
  local_start:=p_starts_at at time zone tz;
  select exists(select 1 from public.availability_rules r where r.organization_id=org_id and r.resource_id=p_resource_id and r.active
    and r.weekday=extract(dow from local_start)::int and (r.effective_from is null or local_start::date>=r.effective_from)
    and (r.effective_to is null or local_start::date<=r.effective_to)
    and (r.location_id=p_location_id or (r.location_id is null and not exists(select 1 from public.availability_rules exact where exact.organization_id=org_id and exact.resource_id=p_resource_id and exact.location_id=p_location_id and exact.active and exact.weekday=extract(dow from local_start)::int and (exact.effective_from is null or local_start::date>=exact.effective_from) and (exact.effective_to is null or local_start::date<=exact.effective_to))))
    and local_start::time>=r.start_time and local_start::time+make_interval(mins=>duration_mins+buffer_mins)<=r.end_time
    and mod((extract(epoch from (local_start::time-r.start_time))/60)::int,r.slot_interval_minutes)=0) into valid_rule;
  if not valid_rule then raise exception 'Selected time is not available'; end if;
  insert into public.appointments(organization_id,resource_id,location_id,service_id,customer_name,customer_phone,customer_email,starts_at,ends_at,status,source,notes)
  values(org_id,p_resource_id,p_location_id,p_service_id,trim(p_customer_name),nullif(trim(coalesce(p_customer_phone,'')),''),nullif(trim(coalesce(p_customer_email,'')),''),p_starts_at,p_starts_at+make_interval(mins=>duration_mins+buffer_mins),'confirmed','web',nullif(trim(coalesce(p_notes,'')),''))
  returning id into new_id;
  token:=encode(extensions.gen_random_bytes(24),'hex');reference:='OMNI-'||upper(substr(replace(new_id::text,'-',''),1,8));
  insert into private.customer_booking_access(appointment_id,booking_reference,token_hash) values(new_id,reference,extensions.digest(convert_to(token,'UTF8'),'sha256'));
  insert into public.appointment_events(organization_id,appointment_id,event_type,actor_type,details) values(org_id,new_id,'created','customer',jsonb_build_object('source','web'));
  perform private.queue_appointment_reminders(new_id);
  return jsonb_build_object('appointment_id',new_id,'booking_reference',reference,'manage_token',token,'starts_at',p_starts_at,'ends_at',p_starts_at+make_interval(mins=>duration_mins+buffer_mins));
exception when exclusion_violation then raise exception 'That time was just booked. Please choose another slot';
end;
$$;


ALTER FUNCTION "public"."create_public_appointment"("p_slug" "text", "p_resource_id" "uuid", "p_location_id" "uuid", "p_service_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_starts_at" timestamp with time zone, "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_public_appointment_v2"("p_slug" "text", "p_resource_id" "uuid", "p_location_id" "uuid", "p_service_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_starts_at" timestamp with time zone, "p_notes" "text" DEFAULT NULL::"text", "p_intake" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  result jsonb;
  appointment_id uuid;
  v_age integer;
  v_pincode text;
begin
  v_age := nullif(p_intake->>'age', '')::integer;
  v_pincode := nullif(trim(coalesce(p_intake->>'pincode', '')), '');
  if v_age is not null and (v_age < 0 or v_age > 120) then raise exception 'Enter a valid age'; end if;
  if v_pincode is not null and v_pincode !~ '^[0-9]{6}$' then raise exception 'Enter a valid 6-digit PIN code'; end if;
  if coalesce((p_intake->>'care_communications_consent')::boolean, false) is not true then
    raise exception 'Booking communication consent is required';
  end if;

  result := public.create_public_appointment(
    p_slug, p_resource_id, p_location_id, p_service_id, p_customer_name,
    p_customer_phone, p_customer_email, p_starts_at, p_notes
  );
  appointment_id := (result->>'appointment_id')::uuid;

  update public.appointments
  set patient_age = v_age,
      health_concern = nullif(trim(coalesce(p_intake->>'health_concern', '')), ''),
      patient_locality = nullif(trim(coalesce(p_intake->>'locality', '')), ''),
      patient_pincode = v_pincode,
      patient_summary = nullif(trim(coalesce(p_intake->>'summary', '')), ''),
      care_communications_consent = true,
      marketing_consent = coalesce((p_intake->>'marketing_consent')::boolean, false)
  where id = appointment_id;

  return result;
end;
$_$;


ALTER FUNCTION "public"."create_public_appointment_v2"("p_slug" "text", "p_resource_id" "uuid", "p_location_id" "uuid", "p_service_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_starts_at" timestamp with time zone, "p_notes" "text", "p_intake" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_public_appointment_v2"("p_slug" "text", "p_resource_id" "uuid", "p_location_id" "uuid", "p_service_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_starts_at" timestamp with time zone, "p_notes" "text", "p_intake" "jsonb") IS 'Intentional public booking RPC; validates active clinic configuration, consent, availability and overlap.';



CREATE OR REPLACE FUNCTION "public"."create_public_payment_intent"("p_slug" "text", "p_resource_id" "uuid", "p_location_id" "uuid", "p_service_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_starts_at" timestamp with time zone, "p_notes" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  org_id uuid;v_assignment_id uuid;duration_mins int;buffer_mins int;tz text;
  local_start timestamp;valid_rule boolean;v_payment_mode text;price_mins int;
  amount_paise int;new_id uuid;payment_id uuid;token text;reference text;expires timestamptz;
begin
  perform private.expire_stale_payment_holds(p_resource_id);
  select organization_id into org_id from public.booking_pages where slug=lower(trim(p_slug)) and active;
  if org_id is null then raise exception 'Booking page not found'; end if;
  if length(trim(p_customer_name))<2 then raise exception 'Customer name is required'; end if;
  if nullif(trim(coalesce(p_customer_phone,'')),'') is null and nullif(trim(coalesce(p_customer_email,'')),'') is null then raise exception 'Mobile number or email is required'; end if;
  if p_starts_at<=now() then raise exception 'Appointment must be in the future'; end if;
  if not exists(select 1 from public.payment_gateway_connections where organization_id=org_id and provider='razorpay' and status in ('test','live')) then raise exception 'Online payment is not available'; end if;

  select a.id into v_assignment_id from public.provider_location_assignments a
  where a.organization_id=org_id and a.resource_id=p_resource_id and a.location_id=p_location_id and a.active
    and (p_starts_at at time zone 'Asia/Kolkata')::date>=a.effective_from
    and (a.effective_to is null or (p_starts_at at time zone 'Asia/Kolkata')::date<=a.effective_to);
  select coalesce(x.duration_minutes,s.duration_minutes),coalesce(x.buffer_minutes,s.buffer_minutes),
    x.payment_mode,coalesce(x.price_paise,s.price_paise),
    case when x.payment_mode='deposit_online' then x.deposit_paise else coalesce(x.price_paise,s.price_paise) end
  into duration_mins,buffer_mins,v_payment_mode,price_mins,amount_paise
  from public.provider_location_services x join public.organization_services s on s.id=x.service_id
  where x.assignment_id=v_assignment_id and x.service_id=p_service_id and x.active and s.active and s.booking_enabled;
  select timezone into tz from public.booking_resources where id=p_resource_id and organization_id=org_id and active;
  if duration_mins is null or tz is null or v_payment_mode not in ('full_online','deposit_online') then raise exception 'Online payment is not required for this selection'; end if;
  if amount_paise is null or amount_paise<=0 or price_mins is null or amount_paise>price_mins then raise exception 'Invalid payment amount'; end if;

  local_start:=p_starts_at at time zone tz;
  select exists(
    select 1 from public.availability_rules r
    where r.organization_id=org_id and r.resource_id=p_resource_id and r.active
      and r.weekday=extract(dow from local_start)::int
      and (r.effective_from is null or local_start::date>=r.effective_from)
      and (r.effective_to is null or local_start::date<=r.effective_to)
      and (r.location_id=p_location_id or (r.location_id is null and not exists(
        select 1 from public.availability_rules exact
        where exact.organization_id=org_id and exact.resource_id=p_resource_id and exact.location_id=p_location_id
          and exact.active and exact.weekday=extract(dow from local_start)::int
          and (exact.effective_from is null or local_start::date>=exact.effective_from)
          and (exact.effective_to is null or local_start::date<=exact.effective_to)
      )))
      and local_start::time>=r.start_time
      and local_start::time+make_interval(mins=>duration_mins+buffer_mins)<=r.end_time
      and mod((extract(epoch from (local_start::time-r.start_time))/60)::int,r.slot_interval_minutes)=0
  ) into valid_rule;
  if not valid_rule then raise exception 'Selected time is not available'; end if;

  expires:=now()+interval '10 minutes';
  insert into public.appointments(
    organization_id,resource_id,location_id,service_id,customer_name,customer_phone,customer_email,
    starts_at,ends_at,status,source,notes,hold_expires_at,payment_status
  ) values(
    org_id,p_resource_id,p_location_id,p_service_id,trim(p_customer_name),
    nullif(trim(coalesce(p_customer_phone,'')),''),nullif(trim(coalesce(p_customer_email,'')),''),
    p_starts_at,p_starts_at+make_interval(mins=>duration_mins+buffer_mins),'payment_pending','web',
    nullif(trim(coalesce(p_notes,'')),''),expires,'pending'
  ) returning id into new_id;
  token:=encode(extensions.gen_random_bytes(24),'hex');
  reference:='OMNI-'||upper(substr(replace(new_id::text,'-',''),1,8));
  insert into private.customer_booking_access(appointment_id,booking_reference,token_hash)
  values(new_id,reference,extensions.digest(convert_to(token,'UTF8'),'sha256'));
  insert into public.booking_payments(organization_id,appointment_id,payment_mode,amount_paise,status,expires_at)
  values(org_id,new_id,v_payment_mode,amount_paise,'created',expires) returning id into payment_id;
  insert into public.appointment_events(organization_id,appointment_id,event_type,actor_type,details)
  values(org_id,new_id,'payment_hold_created','customer',jsonb_build_object('expires_at',expires,'amount_paise',amount_paise));
  return jsonb_build_object(
    'appointment_id',new_id,'payment_id',payment_id,'booking_reference',reference,'manage_token',token,
    'amount_paise',amount_paise,'currency','INR','payment_mode',v_payment_mode,'expires_at',expires,
    'starts_at',p_starts_at,'ends_at',p_starts_at+make_interval(mins=>duration_mins+buffer_mins)
  );
exception when exclusion_violation then raise exception 'That time was just booked. Please choose another slot';
end;
$$;


ALTER FUNCTION "public"."create_public_payment_intent"("p_slug" "text", "p_resource_id" "uuid", "p_location_id" "uuid", "p_service_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_starts_at" timestamp with time zone, "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_public_payment_intent_v2"("p_slug" "text", "p_resource_id" "uuid", "p_location_id" "uuid", "p_service_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_starts_at" timestamp with time zone, "p_notes" "text" DEFAULT NULL::"text", "p_intake" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  result jsonb;
  appointment_id uuid;
  v_age integer;
  v_pincode text;
begin
  v_age := nullif(p_intake->>'age', '')::integer;
  v_pincode := nullif(trim(coalesce(p_intake->>'pincode', '')), '');
  if v_age is not null and (v_age < 0 or v_age > 120) then raise exception 'Enter a valid age'; end if;
  if v_pincode is not null and v_pincode !~ '^[0-9]{6}$' then raise exception 'Enter a valid 6-digit PIN code'; end if;
  if coalesce((p_intake->>'care_communications_consent')::boolean, false) is not true then
    raise exception 'Booking communication consent is required';
  end if;

  result := public.create_public_payment_intent(
    p_slug, p_resource_id, p_location_id, p_service_id, p_customer_name,
    p_customer_phone, p_customer_email, p_starts_at, p_notes
  );
  appointment_id := (result->>'appointment_id')::uuid;

  update public.appointments
  set patient_age = v_age,
      health_concern = nullif(trim(coalesce(p_intake->>'health_concern', '')), ''),
      patient_locality = nullif(trim(coalesce(p_intake->>'locality', '')), ''),
      patient_pincode = v_pincode,
      patient_summary = nullif(trim(coalesce(p_intake->>'summary', '')), ''),
      care_communications_consent = true,
      marketing_consent = coalesce((p_intake->>'marketing_consent')::boolean, false)
  where id = appointment_id;

  return result;
end;
$_$;


ALTER FUNCTION "public"."create_public_payment_intent_v2"("p_slug" "text", "p_resource_id" "uuid", "p_location_id" "uuid", "p_service_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_starts_at" timestamp with time zone, "p_notes" "text", "p_intake" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_public_payment_intent_v3"("p_slug" "text", "p_resource_id" "uuid", "p_location_id" "uuid", "p_service_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_starts_at" timestamp with time zone, "p_selected_payment_mode" "text", "p_notes" "text" DEFAULT NULL::"text", "p_intake" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  org_id uuid;v_assignment_id uuid;duration_mins int;buffer_mins int;tz text;local_start timestamp;valid_rule boolean;
  price_paise int;amount_paise int;deposit_paise int;allowed_modes text[];new_id uuid;payment_id uuid;token text;reference text;expires timestamptz;
  v_age integer;v_pincode text;result jsonb;
begin
  if p_selected_payment_mode not in ('full_online','deposit_online') then raise exception 'Choose a valid online payment option'; end if;
  v_age:=nullif(p_intake->>'age','')::integer;v_pincode:=nullif(trim(coalesce(p_intake->>'pincode','')),'');
  if v_age is not null and(v_age<0 or v_age>120) then raise exception 'Enter a valid age'; end if;
  if v_pincode is not null and v_pincode!~'^[0-9]{6}$' then raise exception 'Enter a valid 6-digit PIN code'; end if;
  if coalesce((p_intake->>'care_communications_consent')::boolean,false) is not true then raise exception 'Booking communication consent is required'; end if;
  perform private.expire_stale_payment_holds(p_resource_id);
  select organization_id into org_id from public.booking_pages where slug=lower(trim(p_slug)) and active;
  if org_id is null then raise exception 'Booking page not found'; end if;
  if length(trim(p_customer_name))<2 then raise exception 'Customer name is required'; end if;
  if nullif(trim(coalesce(p_customer_phone,'')),'') is null and nullif(trim(coalesce(p_customer_email,'')),'') is null then raise exception 'Mobile number or email is required'; end if;
  if p_starts_at<=now() then raise exception 'Appointment must be in the future'; end if;
  if not exists(select 1 from public.payment_gateway_connections where organization_id=org_id and provider='razorpay' and status in('test','live')) then raise exception 'Online payment is not available'; end if;
  select a.id into v_assignment_id from public.provider_location_assignments a where a.organization_id=org_id and a.resource_id=p_resource_id and a.location_id=p_location_id and a.active
    and(p_starts_at at time zone 'Asia/Kolkata')::date>=a.effective_from and(a.effective_to is null or(p_starts_at at time zone 'Asia/Kolkata')::date<=a.effective_to);
  select coalesce(x.duration_minutes,s.duration_minutes),coalesce(x.buffer_minutes,s.buffer_minutes),coalesce(x.price_paise,s.price_paise),x.deposit_paise,x.allowed_payment_modes
  into duration_mins,buffer_mins,price_paise,deposit_paise,allowed_modes from public.provider_location_services x join public.organization_services s on s.id=x.service_id
  where x.assignment_id=v_assignment_id and x.service_id=p_service_id and x.active and s.active and s.booking_enabled;
  select timezone into tz from public.booking_resources where id=p_resource_id and organization_id=org_id and active;
  if duration_mins is null or tz is null then raise exception 'Invalid booking selection'; end if;
  if not(p_selected_payment_mode=any(allowed_modes)) then raise exception 'This payment option is not enabled by the clinic'; end if;
  amount_paise:=case when p_selected_payment_mode='deposit_online' then deposit_paise else price_paise end;
  if amount_paise is null or amount_paise<=0 or price_paise is null or amount_paise>price_paise then raise exception 'Invalid payment amount'; end if;
  local_start:=p_starts_at at time zone tz;
  select exists(select 1 from public.availability_rules r where r.organization_id=org_id and r.resource_id=p_resource_id and r.active
    and r.weekday=extract(dow from local_start)::int and(r.effective_from is null or local_start::date>=r.effective_from) and(r.effective_to is null or local_start::date<=r.effective_to)
    and(r.location_id=p_location_id or(r.location_id is null and not exists(select 1 from public.availability_rules e where e.organization_id=org_id and e.resource_id=p_resource_id and e.location_id=p_location_id and e.active and e.weekday=extract(dow from local_start)::int and(e.effective_from is null or local_start::date>=e.effective_from) and(e.effective_to is null or local_start::date<=e.effective_to))))
    and local_start::time>=r.start_time and local_start::time+make_interval(mins=>duration_mins+buffer_mins)<=r.end_time
    and mod((extract(epoch from(local_start::time-r.start_time))/60)::int,r.slot_interval_minutes)=0) into valid_rule;
  if not valid_rule then raise exception 'Selected time is not available'; end if;
  expires:=now()+interval '10 minutes';
  insert into public.appointments(organization_id,resource_id,location_id,service_id,customer_name,customer_phone,customer_email,starts_at,ends_at,status,source,notes,hold_expires_at,payment_status,
    patient_age,health_concern,patient_locality,patient_pincode,patient_summary,care_communications_consent,marketing_consent)
  values(org_id,p_resource_id,p_location_id,p_service_id,trim(p_customer_name),nullif(trim(coalesce(p_customer_phone,'')),''),nullif(trim(coalesce(p_customer_email,'')),''),
    p_starts_at,p_starts_at+make_interval(mins=>duration_mins+buffer_mins),'payment_pending','web',nullif(trim(coalesce(p_notes,'')),''),expires,'pending',
    v_age,nullif(trim(coalesce(p_intake->>'health_concern','')),''),nullif(trim(coalesce(p_intake->>'locality','')),''),v_pincode,
    nullif(trim(coalesce(p_intake->>'summary','')),''),true,coalesce((p_intake->>'marketing_consent')::boolean,false))
  returning id into new_id;
  token:=encode(extensions.gen_random_bytes(24),'hex');reference:='OMNI-'||upper(substr(replace(new_id::text,'-',''),1,8));
  insert into private.customer_booking_access(appointment_id,booking_reference,token_hash) values(new_id,reference,extensions.digest(convert_to(token,'UTF8'),'sha256'));
  insert into public.booking_payments(organization_id,appointment_id,payment_mode,amount_paise,status,expires_at)
  values(org_id,new_id,p_selected_payment_mode,amount_paise,'created',expires) returning id into payment_id;
  insert into public.appointment_events(organization_id,appointment_id,event_type,actor_type,details)
  values(org_id,new_id,'payment_hold_created','customer',jsonb_build_object('expires_at',expires,'amount_paise',amount_paise,'payment_mode',p_selected_payment_mode));
  result:=jsonb_build_object('appointment_id',new_id,'payment_id',payment_id,'booking_reference',reference,'manage_token',token,'amount_paise',amount_paise,'currency','INR',
    'payment_mode',p_selected_payment_mode,'expires_at',expires,'starts_at',p_starts_at,'ends_at',p_starts_at+make_interval(mins=>duration_mins+buffer_mins));
  return result;
exception when exclusion_violation then raise exception 'That time was just booked. Please choose another slot';
end;
$_$;


ALTER FUNCTION "public"."create_public_payment_intent_v3"("p_slug" "text", "p_resource_id" "uuid", "p_location_id" "uuid", "p_service_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_starts_at" timestamp with time zone, "p_selected_payment_mode" "text", "p_notes" "text", "p_intake" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_schedule_exception"("p_organization_id" "uuid", "p_resource_id" "uuid", "p_location_id" "uuid", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_exception_type" "text", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare exception_id uuid; affected_count int:=0; ap record; message_channel text; message_recipient text;
begin
  if not private.is_organization_member(p_organization_id,'admin') then raise exception 'Not authorized'; end if;
  if p_ends_at<=p_starts_at or p_starts_at<now() then raise exception 'Choose a valid future disruption period'; end if;
  if p_resource_id is null and p_location_id is null then raise exception 'Choose a provider or chamber'; end if;
  if p_exception_type not in ('unavailable','emergency','leave','holiday') then raise exception 'Invalid exception type'; end if;
  insert into public.schedule_exceptions(organization_id,resource_id,location_id,starts_at,ends_at,exception_type,reason)
  values(p_organization_id,p_resource_id,p_location_id,p_starts_at,p_ends_at,p_exception_type,trim(p_reason))
  returning id into exception_id;
  for ap in
    update public.appointments a
    set status='rescheduling_required',updated_at=now()
    where a.organization_id=p_organization_id
      and a.status in ('pending','confirmed')
      and (p_resource_id is null or a.resource_id=p_resource_id)
      and (p_location_id is null or a.location_id=p_location_id)
      and tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(p_starts_at,p_ends_at,'[)')
    returning a.*
  loop
    affected_count:=affected_count+1;
    update public.reminder_events set status='cancelled',updated_at=now()
    where appointment_id=ap.id and status='scheduled';
    insert into public.appointment_events(organization_id,appointment_id,event_type,actor_type,actor_id,details)
    values(p_organization_id,ap.id,'schedule_disruption','staff',auth.uid(),jsonb_build_object('exception_id',exception_id,'reason',trim(p_reason),'starts_at',p_starts_at,'ends_at',p_ends_at));
    message_channel:=case when nullif(trim(coalesce(ap.customer_phone,'')),'') is not null then 'whatsapp' else 'email' end;
    message_recipient:=coalesce(nullif(trim(coalesce(ap.customer_phone,'')),''),nullif(trim(coalesce(ap.customer_email,'')),''));
    if message_recipient is not null then
      insert into public.reminder_events(organization_id,appointment_id,event_type,scheduled_for,channel,recipient,status,provider_response)
      values(p_organization_id,ap.id,'cancellation',now(),message_channel,message_recipient,'scheduled',jsonb_build_object('exception_id',exception_id,'reason',trim(p_reason),'purpose','emergency_reschedule'))
      on conflict(appointment_id,event_type,channel) do update set scheduled_for=excluded.scheduled_for,recipient=excluded.recipient,status='scheduled',attempts=0,provider_response=excluded.provider_response,updated_at=now();
    end if;
  end loop;
  return jsonb_build_object('exception_id',exception_id,'affected_appointments',affected_count,'notifications_queued',affected_count);
end;
$$;


ALTER FUNCTION "public"."create_schedule_exception"("p_organization_id" "uuid", "p_resource_id" "uuid", "p_location_id" "uuid", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_exception_type" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_shadow_evaluation_run"("p_test_set_version" "text", "p_tenant_id" "uuid", "p_provider" "text", "p_model_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_id uuid;
begin
  insert into private.shadow_evaluation_runs (test_set_version, tenant_id, provider, model_name)
  values (p_test_set_version, p_tenant_id, p_provider::private.shadow_provider, p_model_name)
  returning id into v_id;
  return v_id;
end $$;


ALTER FUNCTION "public"."create_shadow_evaluation_run"("p_test_set_version" "text", "p_tenant_id" "uuid", "p_provider" "text", "p_model_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_whatsapp_booking_handoff"("p_organization_id" "uuid", "p_session_id" "uuid", "p_conversation_id" "uuid", "p_source_message_id" "uuid", "p_consent_evidence_id" "uuid", "p_context" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare token text;handoff_id uuid;expiry timestamptz:=now()+interval '10 minutes';
begin
  if coalesce((select auth.jwt()->>'role'),'')<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  if not exists(select 1 from public.whatsapp_booking_sessions where id=p_session_id and organization_id=p_organization_id and conversation_id=p_conversation_id) then raise exception 'Booking session mismatch'; end if;
  if not exists(select 1 from public.whatsapp_booking_consent_evidence where id=p_consent_evidence_id and organization_id=p_organization_id and source_message_id=p_source_message_id and action='accepted') then raise exception 'Accepted WhatsApp consent is required'; end if;
  token:=encode(extensions.gen_random_bytes(32),'hex');
  insert into private.whatsapp_booking_handoffs(
    organization_id,session_id,conversation_id,source_message_id,consent_evidence_id,token_hash,
    service_id,location_id,resource_id,starts_at,patient_name,booking_contact_name,
    booking_contact_phone,patient_relationship,expires_at
  ) values(
    p_organization_id,p_session_id,p_conversation_id,p_source_message_id,p_consent_evidence_id,
    extensions.digest(convert_to(token,'UTF8'),'sha256'),
    (p_context#>>'{service,id}')::uuid,(p_context#>>'{location,id}')::uuid,
    (p_context#>>'{resource,id}')::uuid,(p_context#>>'{slot,starts_at}')::timestamptz,
    trim(p_context->>'patient_name'),trim(p_context->>'booking_contact_name'),
    trim(p_context->>'booking_contact_phone'),p_context->>'patient_relationship',expiry
  ) returning id into handoff_id;
  return jsonb_build_object('handoff_id',handoff_id,'token',token,'expires_at',expiry);
end;$$;


ALTER FUNCTION "public"."create_whatsapp_booking_handoff"("p_organization_id" "uuid", "p_session_id" "uuid", "p_conversation_id" "uuid", "p_source_message_id" "uuid", "p_consent_evidence_id" "uuid", "p_context" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_whatsapp_handoff_appointment"("p_handoff_token" "text", "p_slug" "text", "p_resource_id" "uuid", "p_location_id" "uuid", "p_service_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_starts_at" timestamp with time zone, "p_booking_contact_name" "text", "p_booking_contact_phone" "text", "p_patient_relationship" "text", "p_patient_date_of_birth" "date" DEFAULT NULL::"date", "p_notes" "text" DEFAULT NULL::"text", "p_intake" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare h private.whatsapp_booking_handoffs%rowtype;result jsonb;v_appointment_id uuid;
  existing_appointment public.appointments%rowtype;existing_reference text;replacement_token text;
begin
  if coalesce((select auth.jwt()->>'role'),'')<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  select * into h from private.whatsapp_booking_handoffs
   where token_hash=extensions.digest(convert_to(p_handoff_token,'UTF8'),'sha256') and consumed_at is null for update;
  if h.id is null then raise exception 'WhatsApp booking handoff expired or already used'; end if;
  if h.resource_id<>p_resource_id or h.location_id<>p_location_id or h.service_id<>p_service_id or h.starts_at<>p_starts_at then raise exception 'WhatsApp booking selection mismatch'; end if;

  -- A previous request may have created the appointment before its response
  -- failed. Return the same appointment with a newly usable management token.
  if h.appointment_id is not null then
    select * into existing_appointment from public.appointments
     where id=h.appointment_id and organization_id=h.organization_id and status='confirmed';
    if existing_appointment.id is null then raise exception 'Existing WhatsApp appointment is unavailable'; end if;
    select booking_reference into existing_reference from private.customer_booking_access
     where appointment_id=existing_appointment.id for update;
    if existing_reference is null then raise exception 'Existing booking access is unavailable'; end if;
    replacement_token:=encode(extensions.gen_random_bytes(32),'hex');
    update private.customer_booking_access
       set token_hash=extensions.digest(convert_to(replacement_token,'UTF8'),'sha256')
     where appointment_id=existing_appointment.id;
    return jsonb_build_object(
      'appointment_id',existing_appointment.id,'booking_reference',existing_reference,
      'manage_token',replacement_token,'starts_at',existing_appointment.starts_at,
      'ends_at',existing_appointment.ends_at,'recovered',true
    );
  end if;

  if h.expires_at<=now() then raise exception 'WhatsApp booking handoff expired'; end if;
  perform set_config('omnirelay.defer_patient_sync','on',true);
  result:=public.create_public_appointment_v2(p_slug,p_resource_id,p_location_id,p_service_id,p_customer_name,p_customer_phone,p_customer_email,p_starts_at,p_notes,p_intake);
  v_appointment_id:=(result->>'appointment_id')::uuid;
  update public.appointments set source='whatsapp',booking_contact_name=trim(p_booking_contact_name),
    booking_contact_phone=trim(p_booking_contact_phone),patient_relationship=p_patient_relationship,
    patient_date_of_birth=p_patient_date_of_birth,booking_phone_verified_at=now()
  where id=v_appointment_id and organization_id=h.organization_id;
  perform set_config('omnirelay.defer_patient_sync','off',true);
  perform private.sync_patient_from_appointment(v_appointment_id);
  update private.whatsapp_booking_handoffs set appointment_id=v_appointment_id where id=h.id;
  return result;
exception when others then
  perform set_config('omnirelay.defer_patient_sync','off',true);
  raise;
end;$$;


ALTER FUNCTION "public"."create_whatsapp_handoff_appointment"("p_handoff_token" "text", "p_slug" "text", "p_resource_id" "uuid", "p_location_id" "uuid", "p_service_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_starts_at" timestamp with time zone, "p_booking_contact_name" "text", "p_booking_contact_phone" "text", "p_patient_relationship" "text", "p_patient_date_of_birth" "date", "p_notes" "text", "p_intake" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_whatsapp_handoff_payment_intent"("p_handoff_token" "text", "p_slug" "text", "p_resource_id" "uuid", "p_location_id" "uuid", "p_service_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_starts_at" timestamp with time zone, "p_selected_payment_mode" "text", "p_booking_contact_name" "text", "p_booking_contact_phone" "text", "p_patient_relationship" "text", "p_patient_date_of_birth" "date" DEFAULT NULL::"date", "p_notes" "text" DEFAULT NULL::"text", "p_intake" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare h private.whatsapp_booking_handoffs%rowtype;result jsonb;v_appointment_id uuid;
begin
  if coalesce((select auth.jwt()->>'role'),'')<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  select * into h from private.whatsapp_booking_handoffs where token_hash=extensions.digest(convert_to(p_handoff_token,'UTF8'),'sha256') and consumed_at is null and expires_at>now() for update;
  if h.id is null then raise exception 'WhatsApp booking handoff expired'; end if;
  if h.resource_id<>p_resource_id or h.location_id<>p_location_id or h.service_id<>p_service_id or h.starts_at<>p_starts_at then raise exception 'WhatsApp booking selection mismatch'; end if;
  perform set_config('omnirelay.defer_patient_sync','on',true);
  result:=public.create_public_payment_intent_v3(p_slug,p_resource_id,p_location_id,p_service_id,p_customer_name,p_customer_phone,p_customer_email,p_starts_at,p_selected_payment_mode,p_notes,p_intake);
  v_appointment_id:=(result->>'appointment_id')::uuid;
  update public.appointments set source='whatsapp',booking_contact_name=trim(p_booking_contact_name),
    booking_contact_phone=trim(p_booking_contact_phone),patient_relationship=p_patient_relationship,
    patient_date_of_birth=p_patient_date_of_birth,booking_phone_verified_at=now()
  where id=v_appointment_id and organization_id=h.organization_id;
  perform set_config('omnirelay.defer_patient_sync','off',true);
  perform private.sync_patient_from_appointment(v_appointment_id);
  update private.whatsapp_booking_handoffs set appointment_id=v_appointment_id where id=h.id;
  return result;
exception when others then
  perform set_config('omnirelay.defer_patient_sync','off',true);
  raise;
end;$$;


ALTER FUNCTION "public"."create_whatsapp_handoff_payment_intent"("p_handoff_token" "text", "p_slug" "text", "p_resource_id" "uuid", "p_location_id" "uuid", "p_service_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_starts_at" timestamp with time zone, "p_selected_payment_mode" "text", "p_booking_contact_name" "text", "p_booking_contact_phone" "text", "p_patient_relationship" "text", "p_patient_date_of_birth" "date", "p_notes" "text", "p_intake" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decide_whatsapp_booking_request"("p_organization_id" "uuid", "p_request_id" "uuid", "p_decision" "text", "p_note" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  r public.whatsapp_booking_requests%rowtype;
  v_slug text;
  created jsonb;
  reply text;
begin
  if not private.is_organization_member(p_organization_id,'admin') then
    raise exception 'Administrator access required';
  end if;
  if p_decision not in ('approve','reject','waitlist') then
    raise exception 'Invalid decision';
  end if;

  select * into r
  from public.whatsapp_booking_requests
  where id=p_request_id and organization_id=p_organization_id
  for update;

  if r.id is null then raise exception 'Booking request not found'; end if;
  if r.status<>'pending_approval' then raise exception 'This request has already been decided'; end if;

  if p_decision='approve' then
    select slug into v_slug
    from public.booking_pages
    where organization_id=p_organization_id and active
    limit 1;

    created:=public.create_public_appointment_v2(
      v_slug,r.resource_id,r.location_id,r.service_id,r.patient_name,r.patient_phone,'',r.starts_at,
      coalesce(nullif(trim(p_note),''),'Approved from WhatsApp booking queue'),
      jsonb_build_object('care_communications_consent',true,'marketing_consent',false)
    );
    update public.whatsapp_booking_requests
    set status='confirmed',appointment_id=(created->>'appointment_id')::uuid,
        decision_note=nullif(trim(coalesce(p_note,'')),''),decided_by=auth.uid(),
        decided_at=now(),updated_at=now()
    where id=r.id;
    reply:='Your appointment is confirmed. Reference: '||(created->>'booking_reference')||'.';
  elsif p_decision='waitlist' then
    insert into public.appointment_waitlist(
      organization_id,booking_request_id,patient_name,patient_phone,service_id,
      location_id,resource_id,preferred_date,preferred_starts_at
    ) values (
      p_organization_id,r.id,r.patient_name,r.patient_phone,r.service_id,
      r.location_id,r.resource_id,(r.starts_at at time zone 'Asia/Kolkata')::date,r.starts_at
    );
    update public.whatsapp_booking_requests
    set status='waitlisted',decision_note=nullif(trim(coalesce(p_note,'')),''),
        decided_by=auth.uid(),decided_at=now(),updated_at=now()
    where id=r.id;
    reply:='The clinic added your request to the waitlist. You will be contacted if a suitable time becomes available.';
  else
    update public.whatsapp_booking_requests
    set status='rejected',decision_note=nullif(trim(coalesce(p_note,'')),''),
        decided_by=auth.uid(),decided_at=now(),updated_at=now()
    where id=r.id;
    reply:='The requested appointment could not be confirmed. Please reply MENU to choose another available time.';
  end if;

  if r.conversation_id is not null then
    insert into public.messages(
      organization_id,conversation_id,organization_address,contact_address,
      service,direction,content,status,timestamp
    )
    select p_organization_id,r.conversation_id,c.organization_address,c.contact_address,
      'whatsapp','outgoing',
      jsonb_build_object('version','1','type','text','kind','text','text',reply),
      jsonb_build_object('pending',now(),'source','booking_decision'),
      now()
    from public.conversations c
    where c.id=r.conversation_id and c.organization_id=p_organization_id;
  end if;

  return jsonb_build_object(
    'status',case p_decision when 'approve' then 'confirmed' when 'waitlist' then 'waitlisted' else 'rejected' end,
    'appointment_id',created->>'appointment_id'
  );
exception
  when exclusion_violation then
    raise exception 'That time was just booked. Add the patient to the waitlist or offer another slot';
end;
$$;


ALTER FUNCTION "public"."decide_whatsapp_booking_request"("p_organization_id" "uuid", "p_request_id" "uuid", "p_decision" "text", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."deploy_due_clinic_actions"("p_organization_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  actor uuid := (select auth.uid());
  deployed integer := 0;
  automatic integer := 0;
  exceptions integer := 0;
  deployment_id uuid;
begin
  if actor is null then raise exception 'Sign in required'; end if;
  if not private.is_organization_member(p_organization_id, 'admin') then
    raise exception 'Administrator access required';
  end if;

  with eligible as (
    select run.id
    from public.care_reminder_runs run
    join public.patient_profiles patient on patient.id = run.patient_id
    where run.organization_id = p_organization_id
      and run.channel = 'whatsapp'
      and run.scheduled_for <= now()
      and (
        run.status = 'ready'
        or (run.status = 'failed' and run.attempt_count < run.max_attempts)
      )
      and patient.care_communications_consent
      and nullif(regexp_replace(coalesce(patient.phone, ''), '\D', '', 'g'), '') is not null
    for update of run skip locked
  ), approved as (
    update public.care_reminder_runs run
    set status = 'approved',
        approved_by = actor,
        approved_at = now(),
        next_attempt_at = now(),
        failure_reason = null,
        updated_at = now()
    from eligible
    where run.id = eligible.id
    returning run.id
  )
  select count(*)::integer into deployed from approved;

  select (
    (select count(*) from public.care_reminder_runs
      where organization_id = p_organization_id
        and status = 'approved' and scheduled_for <= now())
    +
    (select count(*) from public.reminder_events
      where organization_id = p_organization_id
        and status = 'scheduled'
        and coalesce(next_attempt_at, scheduled_for) <= now())
  )::integer into automatic;

  select (
    (select count(*) from public.care_reminder_runs run
      join public.patient_profiles patient on patient.id = run.patient_id
      where run.organization_id = p_organization_id
        and run.scheduled_for <= now()
        and (
          (run.status = 'failed' and run.attempt_count >= run.max_attempts)
          or run.status = 'skipped'
          or not patient.care_communications_consent
          or nullif(regexp_replace(coalesce(patient.phone, ''), '\D', '', 'g'), '') is null
        ))
    +
    (select count(*) from public.reminder_events
      where organization_id = p_organization_id and status = 'failed')
    +
    (select count(*) from public.patient_care_tasks
      where organization_id = p_organization_id
        and status in ('open','in_progress')
        and (priority in ('high','urgent') or due_at <= now()))
  )::integer into exceptions;

  insert into public.action_centre_deployments (
    organization_id, actor_user_id, status, deployed_count,
    automatic_count, exception_count, snapshot
  ) values (
    p_organization_id, actor,
    case when exceptions > 0 then 'partial' else 'deployed' end,
    deployed, automatic, exceptions,
    jsonb_build_object(
      'deployed_at', now(),
      'routine_actions_released', deployed,
      'automatic_actions_due', automatic,
      'exceptions_retained', exceptions
    )
  ) returning id into deployment_id;

  return jsonb_build_object(
    'deployment_id', deployment_id,
    'deployed_count', deployed,
    'automatic_count', automatic,
    'exception_count', exceptions
  );
end;
$$;


ALTER FUNCTION "public"."deploy_due_clinic_actions"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."automation_workflows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "trigger_key" "text" NOT NULL,
    "execution_provider" "text" DEFAULT 'internal'::"text" NOT NULL,
    "external_workflow_id" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "max_attempts" integer DEFAULT 3 NOT NULL,
    "timeout_seconds" integer DEFAULT 30 NOT NULL,
    "configuration" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_run_at" timestamp with time zone,
    "last_success_at" timestamp with time zone,
    "last_failure_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "automation_workflows_execution_provider_check" CHECK (("execution_provider" = ANY (ARRAY['internal'::"text", 'n8n'::"text"]))),
    CONSTRAINT "automation_workflows_max_attempts_check" CHECK ((("max_attempts" >= 1) AND ("max_attempts" <= 10))),
    CONSTRAINT "automation_workflows_name_check" CHECK ((("char_length"("name") >= 3) AND ("char_length"("name") <= 100))),
    CONSTRAINT "automation_workflows_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'paused'::"text", 'error'::"text"]))),
    CONSTRAINT "automation_workflows_timeout_seconds_check" CHECK ((("timeout_seconds" >= 5) AND ("timeout_seconds" <= 300))),
    CONSTRAINT "automation_workflows_trigger_key_check" CHECK (("trigger_key" = ANY (ARRAY['booking_created'::"text", 'booking_confirmed'::"text", 'appointment_changed'::"text", 'appointment_reminder'::"text", 'medication_reminder'::"text", 'emergency_notice'::"text", 'follow_up_due'::"text", 'doctor_queue'::"text"])))
);


ALTER TABLE "public"."automation_workflows" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."disable_managed_booking_canary"("p_organization_id" "uuid", "p_workflow_id" "uuid") RETURNS "public"."automation_workflows"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare result public.automation_workflows;
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  update public.automation_workflows
  set configuration = configuration || jsonb_build_object(
        'execution_mode', 'observe',
        'managed_canary', false,
        'kill_switch', true,
        'managed_disabled_at', now()
      ),
      updated_at = now()
  where id = p_workflow_id
    and organization_id = p_organization_id
    and trigger_key = 'booking_confirmed'
  returning * into result;

  if result.id is null then
    raise exception 'Booking confirmation workflow not found' using errcode = 'P0002';
  end if;
  return result;
end;
$$;


ALTER FUNCTION "public"."disable_managed_booking_canary"("p_organization_id" "uuid", "p_workflow_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dispatcher_edge_function"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  service text := new.service::text;
  path text := concat('/', service, '-dispatcher');
  request_id bigint;
  payload jsonb;
  base_url text;
  auth_token text;
  headers jsonb;
  timeout_ms integer := 10000;
begin
  if service = 'local' then
    update public.messages
    set status = jsonb_build_object('delivered', now())
    where id = new.id;
    return new;
  end if;

  select decrypted_secret into base_url
  from vault.decrypted_secrets
  where name = 'edge_functions_url';

  select decrypted_secret into auth_token
  from vault.decrypted_secrets
  where name = 'edge_functions_token';

  if base_url is null or btrim(base_url) = '' then
    raise exception 'edge_functions_url is missing from Vault';
  end if;

  if auth_token is null or btrim(auth_token) = '' then
    raise exception 'edge_functions_token is missing from Vault';
  end if;

  headers = jsonb_build_object(
    'content-type', 'application/json',
    'authorization', 'Bearer ' || auth_token,
    'apikey', auth_token
  );

  payload = jsonb_build_object(
    'old_record', old,
    'record', new,
    'type', tg_op,
    'table', tg_table_name,
    'schema', tg_table_schema
  );

  select http_post into request_id
  from net.http_post(
    base_url || path,
    payload,
    '{}'::jsonb,
    headers,
    timeout_ms
  );

  insert into supabase_functions.hooks
    (hook_table_id, hook_name, request_id)
  values
    (tg_relid, tg_name, request_id);

  return new;
end;
$$;


ALTER FUNCTION "public"."dispatcher_edge_function"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."edge_function"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  request_id bigint;
  payload jsonb;
  base_url text;
  auth_token text;
  path text := tg_argv[0]::text;
  method text := tg_argv[1]::text;
  headers jsonb default '{}'::jsonb;
  params jsonb default '{}'::jsonb;
  timeout_ms integer := 10000;
begin
  if path is null or path = 'null' then
    raise exception 'path argument is missing';
  end if;

  if method is null or method = 'null' then
    raise exception 'method argument is missing';
  end if;

  if tg_argv[2] is null or tg_argv[2] = 'null' then
    select decrypted_secret into auth_token
    from vault.decrypted_secrets
    where name = 'edge_functions_token';

    if auth_token is null or btrim(auth_token) = '' then
      raise exception 'edge_functions_token is missing from Vault';
    end if;

    headers = jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || auth_token,
      'apikey', auth_token
    );
  else
    headers = tg_argv[2]::jsonb;
  end if;

  if tg_argv[3] is null or tg_argv[3] = 'null' then
    params = '{}'::jsonb;
  else
    params = tg_argv[3]::jsonb;
  end if;

  select decrypted_secret into base_url
  from vault.decrypted_secrets
  where name = 'edge_functions_url';

  if base_url is null or btrim(base_url) = '' then
    raise exception 'edge_functions_url is missing from Vault';
  end if;

  case
    when method = 'get' then
      select http_get into request_id
      from net.http_get(base_url || path, params, headers, timeout_ms);
    when method = 'post' then
      payload = jsonb_build_object(
        'old_record', old,
        'record', new,
        'type', tg_op,
        'table', tg_table_name,
        'schema', tg_table_schema
      );

      select http_post into request_id
      from net.http_post(base_url || path, payload, params, headers, timeout_ms);
    else
      raise exception 'method argument % is invalid', method;
  end case;

  insert into supabase_functions.hooks
    (hook_table_id, hook_name, request_id)
  values
    (tg_relid, tg_name, request_id);

  return new;
end;
$$;


ALTER FUNCTION "public"."edge_function"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enable_managed_booking_canary"("p_organization_id" "uuid", "p_workflow_id" "uuid") RETURNS "public"."automation_workflows"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare result public.automation_workflows;
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if not private.managed_booking_rollout_ready(p_organization_id, p_workflow_id) then
    raise exception 'Managed booking canary readiness requirements are not met' using errcode = '55000';
  end if;

  update public.automation_workflows
  set configuration = configuration || jsonb_build_object(
        'execution_mode', 'managed',
        'managed_canary', true,
        'kill_switch', false,
        'managed_enabled_at', now()
      ),
      updated_at = now()
  where id = p_workflow_id
    and organization_id = p_organization_id
    and trigger_key = 'booking_confirmed'
  returning * into result;

  if result.id is null then
    raise exception 'Booking confirmation workflow not found' using errcode = 'P0002';
  end if;
  return result;
end;
$$;


ALTER FUNCTION "public"."enable_managed_booking_canary"("p_organization_id" "uuid", "p_workflow_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_invitation_status_flow"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if old.extra->'invitation' is not null then -- invitation
    if new.extra->'invitation' is null then -- invitation removed
      raise exception 'Cannot remove invitation';
    end if;

    if new.extra->'invitation'->>'email' is distinct from old.extra->'invitation'->>'email' then
      raise exception 'Cannot change invitation email';
    end if;

    if old.extra->'invitation'->>'status' is distinct from new.extra->'invitation'->>'status' then
      if old.extra->'invitation'->>'status' <> 'pending' then
        raise exception 'Cannot change invitation status from %', old.extra->'invitation'->>'status';
      end if;
    
      if new.extra->'invitation'->>'status' not in ('accepted', 'rejected') then
        raise exception 'Invitation status can only be changed to accepted or rejected';
      end if;
    end if;
  else -- no invitation; original owner
    if new.extra->'invitation' is not null then
      raise exception 'Cannot add invitation to existing agent';
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_invitation_status_flow"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_schedule_exception"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if new.status in ('pending','confirmed') and exists(
    select 1 from public.schedule_exceptions e
    where e.organization_id=new.organization_id and e.status='active'
      and (e.resource_id is null or e.resource_id=new.resource_id)
      and (e.location_id is null or e.location_id=new.location_id)
      and tstzrange(e.starts_at,e.ends_at,'[)') && tstzrange(new.starts_at,new.ends_at,'[)')
  ) then raise exception 'The provider or chamber is unavailable during this time'; end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_schedule_exception"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."exchange_patient_portal_link"("p_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_session private.patient_portal_sessions%rowtype;
  v_access_token text;
begin
  select * into v_session
  from private.patient_portal_sessions s
  where s.token_hash = extensions.digest(convert_to(coalesce(p_token,''),'UTF8'),'sha256')
    and s.revoked_at is null
    and s.consumed_at is null
    and s.expires_at > now()
  for update;

  if v_session.id is null then
    raise exception 'This secure link is invalid, expired, or already used';
  end if;

  v_access_token := encode(extensions.gen_random_bytes(32), 'hex');
  update private.patient_portal_sessions
  set consumed_at = now(),
      last_accessed_at = now(),
      access_token_hash = extensions.digest(convert_to(v_access_token,'UTF8'),'sha256')
  where id = v_session.id;

  return jsonb_build_object(
    'access_token', v_access_token,
    'expires_at', v_session.expires_at
  );
end;
$$;


ALTER FUNCTION "public"."exchange_patient_portal_link"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_authorized_orgs"("role" "public"."role" DEFAULT 'member'::"public"."role") RETURNS SETOF "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  req_level int;
  api_key text;
  org_id uuid;
begin
  req_level := case role::text when 'owner' then 3 when 'admin' then 2 else 1 end;

  if (select auth.uid()) is not null then
    return query select organization_id from public.agents
    where user_id = (select auth.uid())
      and coalesce(extra->>'status', 'active') = 'active'
      and (extra->'invitation' is null or extra->'invitation'->>'status' = 'accepted')
      and case extra->>'role' when 'owner' then 3 when 'admin' then 2 else 1 end >= req_level;
    return;
  end if;

  api_key := current_setting('request.headers', true)::json->>'api-key';
  if api_key is not null then
    select a.organization_id into org_id from public.api_keys a
    where a.key = api_key
      and case a.role::text when 'owner' then 3 when 'admin' then 2 else 1 end >= req_level;
    if org_id is not null then return next org_id; end if;
    return;
  end if;

  raise exception using errcode = '42501', message = 'authentication required',
    hint = 'use api-key header or jwt authentication';
end;
$$;


ALTER FUNCTION "public"."get_authorized_orgs"("role" "public"."role") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_authorized_orgs"("role" "public"."role") IS 'Intentional JWT/API-key authorization helper; raises when neither authenticated identity nor API key is present.';



CREATE OR REPLACE FUNCTION "public"."get_automation_rollout_readiness"("p_organization_id" "uuid") RETURNS TABLE("workflow_id" "uuid", "trigger_key" "text", "observation_count" bigint, "failure_count" bigint, "required_observations" integer, "ready" boolean, "review_status" "text")
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if not private.is_organization_member(p_organization_id, 'member') then
    raise exception 'Workspace access required' using errcode = '42501';
  end if;

  return query
  select
    w.id,
    w.trigger_key,
    count(r.id) filter (
      where r.created_at >= now() - interval '30 days'
        and r.safe_context->>'execution_mode' = 'observe'
    ),
    count(r.id) filter (
      where r.created_at >= now() - interval '30 days'
        and (r.status = 'failed' or r.delivery_status = 'failed')
    ),
    5,
    count(r.id) filter (
      where r.created_at >= now() - interval '30 days'
        and r.safe_context->>'execution_mode' = 'observe'
    ) >= 5
      and count(r.id) filter (
        where r.created_at >= now() - interval '30 days'
          and (r.status = 'failed' or r.delivery_status = 'failed')
      ) = 0,
    case
      when count(r.id) filter (
        where r.created_at >= now() - interval '30 days'
          and (r.status = 'failed' or r.delivery_status = 'failed')
      ) > 0 then 'blocked'
      when count(r.id) filter (
        where r.created_at >= now() - interval '30 days'
          and r.safe_context->>'execution_mode' = 'observe'
      ) >= 5 then 'ready'
      else 'collecting'
    end
  from public.automation_workflows w
  left join public.automation_runs r
    on r.workflow_id = w.id and r.organization_id = w.organization_id
  where w.organization_id = p_organization_id
    and w.status = 'active'
    and w.configuration->>'execution_mode' = 'observe'
  group by w.id, w.trigger_key
  order by w.trigger_key;
end;
$$;


ALTER FUNCTION "public"."get_automation_rollout_readiness"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_customer_booking"("p_booking_reference" "text", "p_manage_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform private.consume_public_request_limit('public_booking_manage_lookup',p_booking_reference,20,600);
  return private.get_customer_booking_core(p_booking_reference,p_manage_token);
end; $$;


ALTER FUNCTION "public"."get_customer_booking"("p_booking_reference" "text", "p_manage_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_existing_booking_confirmation"("p_organization_id" "uuid", "p_appointment_id" "uuid") RETURNS TABLE("message_id" "uuid", "outcome" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  return query
  select m.id,
    case
      when m.status ? 'read' then 'read'
      when m.status ? 'delivered' then 'delivered'
      when m.status ? 'sent' then 'sent'
      else 'accepted'
    end
  from private.whatsapp_booking_handoffs h
  join public.messages m
    on m.organization_id = h.organization_id
   and m.direction = 'outgoing'
   and m.status->>'source' = 'whatsapp_booking_handoff'
   and m.status->>'handoff_id' = h.id::text
  where h.organization_id = p_organization_id
    and h.appointment_id = p_appointment_id
    and (m.status ? 'accepted' or m.status ? 'sent' or m.status ? 'delivered' or m.status ? 'read')
  order by m.created_at desc
  limit 1;

  if found then return; end if;

  return query
  select e.message_id,
    case
      when e.message_id is not null then 'accepted'
      when e.status = 'failed' then 'failed'
      else 'pending'
    end
  from public.reminder_events e
  where e.organization_id = p_organization_id
    and e.appointment_id = p_appointment_id
    and e.event_type = 'confirmation'
  order by e.created_at desc
  limit 1;
end;
$$;


ALTER FUNCTION "public"."get_existing_booking_confirmation"("p_organization_id" "uuid", "p_appointment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_multi_doctor_booking_acceptance"("p_organization_id" "uuid") RETURNS TABLE("check_key" "text", "status" "text", "evidence_summary" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."get_multi_doctor_booking_acceptance"("p_organization_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_multi_doctor_booking_acceptance"("p_organization_id" "uuid") IS 'Read-only, identity-free acceptance matrix for multi-doctor booking configuration.';



CREATE OR REPLACE FUNCTION "public"."get_oem_tenant_health"() RETURNS TABLE("organization_id" "uuid", "organization_name" "text", "business_category" "text", "plan_id" "text", "entitlement_status" "text", "trial_ends_at" timestamp with time zone, "location_count" bigint, "seat_count" bigint, "live_channel_count" bigint, "channel_attention_count" bigint, "appointment_count_30d" bigint, "conversation_count_30d" bigint, "failed_delivery_count_7d" bigint, "last_activity_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not private.is_platform_operator() then
    raise exception 'OEM operator access required' using errcode = '42501';
  end if;

  insert into private.oem_audit_events (actor_user_id, event_type, metadata)
  values (auth.uid(), 'tenant_health_viewed', jsonb_build_object('scope', 'aggregate_only'));

  return query
  select
    o.id,
    coalesce(nullif(trim(op.business_name), ''), o.name),
    coalesce(op.business_category, 'other'),
    coalesce(e.plan_id, 'unassigned'),
    coalesce(e.status, 'unassigned'),
    e.trial_ends_at,
    coalesce(loc.total, 0),
    coalesce(seats.total, 0),
    coalesce(ch.live_total, 0),
    coalesce(ch.attention_total, 0),
    coalesce(appt.total, 0),
    coalesce(conv.total, 0),
    coalesce(delivery.failed_total, 0),
    greatest(
      o.updated_at,
      coalesce(appt.last_at, o.updated_at),
      coalesce(conv.last_at, o.updated_at),
      coalesce(ch.last_at, o.updated_at)
    )
  from public.organizations o
  left join public.onboarding_profiles op on op.organization_id = o.id
  left join public.entitlements e on e.organization_id = o.id
  left join lateral (
    select count(*)::bigint as total
    from public.business_locations l
    where l.organization_id = o.id and l.active
  ) loc on true
  left join lateral (
    select count(*)::bigint as total
    from public.agents a
    where a.organization_id = o.id
      and coalesce(a.extra ->> 'active', 'true') <> 'false'
  ) seats on true
  left join lateral (
    select
      count(*) filter (where c.status in ('live', 'test'))::bigint as live_total,
      count(*) filter (where c.status in ('error', 'pending'))::bigint as attention_total,
      max(c.updated_at) as last_at
    from public.channel_connections c
    where c.organization_id = o.id
  ) ch on true
  left join lateral (
    select count(*)::bigint as total, max(a.updated_at) as last_at
    from public.appointments a
    where a.organization_id = o.id
      and a.created_at >= now() - interval '30 days'
  ) appt on true
  left join lateral (
    select count(*)::bigint as total, max(c.updated_at) as last_at
    from public.conversations c
    where c.organization_id = o.id
      and c.updated_at >= now() - interval '30 days'
  ) conv on true
  left join lateral (
    select count(*)::bigint as failed_total
    from public.reminder_events r
    where r.organization_id = o.id
      and r.status = 'failed'
      and r.updated_at >= now() - interval '7 days'
  ) delivery on true
  order by greatest(
    o.updated_at,
    coalesce(appt.last_at, o.updated_at),
    coalesce(conv.last_at, o.updated_at),
    coalesce(ch.last_at, o.updated_at)
  ) desc;
end;
$$;


ALTER FUNCTION "public"."get_oem_tenant_health"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_oem_tenant_health"() IS 'Returns privacy-safe aggregate tenant health to authenticated OEM operators and records an audit event.';



CREATE OR REPLACE FUNCTION "public"."get_patient_data_requests_from_portal"("p_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare s private.patient_portal_sessions%rowtype;
begin
  select * into s from private.patient_portal_sessions x where x.access_token_hash=extensions.digest(convert_to(coalesce(p_token,''),'UTF8'),'sha256') and x.revoked_at is null and x.consumed_at is not null and x.expires_at>now();
  if s.id is null then raise exception 'secure session invalid or expired'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'reference',d.reference,'request_type',d.request_type,'status',d.status,'created_at',d.created_at) order by d.created_at desc) from public.patient_data_requests d where d.organization_id=s.organization_id and d.patient_id=s.patient_id),'[]'::jsonb);
end $$;


ALTER FUNCTION "public"."get_patient_data_requests_from_portal"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_patient_portal"("p_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."get_patient_portal"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_booking_page"("p_slug" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare result jsonb;
begin
  select jsonb_build_object(
    'slug',bp.slug,'headline',bp.headline,'description',coalesce(bp.description,op.description),'accent_color',bp.accent_color,
    'clinic_mode',coalesce(op.clinic_mode,'solo_practitioner'),
    'business',jsonb_build_object('name',coalesce(op.business_name,o.name),'category',op.business_category,'phone',op.primary_phone,'email',op.email,'timezone',coalesce(op.timezone,'Asia/Kolkata')),
    'departments',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'description',d.description) order by d.sort_order,d.name) from public.clinic_departments d where d.organization_id=o.id and d.active),'[]'::jsonb),
    'provider_departments',coalesce((select jsonb_agg(jsonb_build_object('department_id',pd.department_id,'resource_id',pd.resource_id,'primary_department',pd.primary_department)) from public.provider_departments pd join public.clinic_departments d on d.id=pd.department_id and d.organization_id=pd.organization_id and d.active where pd.organization_id=o.id),'[]'::jsonb),
    'locations',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'type',l.location_type,'address',l.address,'phone',l.phone,'google_maps_url',l.google_maps_url,'timezone',l.timezone) order by l.created_at) from public.business_locations l where l.organization_id=o.id and l.active),'[]'::jsonb),
    'services',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'description',s.description,'duration_minutes',s.duration_minutes,'buffer_minutes',s.buffer_minutes,'price_paise',s.price_paise,'currency',s.currency) order by s.created_at) from public.organization_services s where s.organization_id=o.id and s.active and s.booking_enabled),'[]'::jsonb),
    'resources',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'type',r.resource_type,'location_id',r.location_id,'timezone',r.timezone,'photo_path',pp.photo_path,'specialization',pp.specialization,'qualifications',pp.qualifications,'experience_years',pp.experience_years,'languages',pp.languages,'biography',pp.biography) order by r.created_at) from public.booking_resources r left join public.provider_profiles pp on pp.resource_id=r.id where r.organization_id=o.id and r.active),'[]'::jsonb),
    'payments_enabled',exists(select 1 from public.payment_gateway_connections g where g.organization_id=o.id and g.provider='razorpay' and g.status in ('test','live')),
    'assignments',coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'resource_id',a.resource_id,'location_id',a.location_id,'effective_from',a.effective_from,'effective_to',a.effective_to,'booking_window_days',a.booking_window_days,
      'services',coalesce((select jsonb_agg(jsonb_build_object('service_id',x.service_id,'duration_minutes',coalesce(x.duration_minutes,s.duration_minutes),'buffer_minutes',coalesce(x.buffer_minutes,s.buffer_minutes),'price_paise',coalesce(x.price_paise,s.price_paise),'payment_mode',x.payment_mode,'allowed_payment_modes',x.allowed_payment_modes,'deposit_paise',x.deposit_paise)) from public.provider_location_services x join public.organization_services s on s.id=x.service_id where x.assignment_id=a.id and x.active),'[]'::jsonb)
    ) order by a.created_at) from public.provider_location_assignments a where a.organization_id=o.id and a.active),'[]'::jsonb)
  ) into result
  from public.booking_pages bp join public.organizations o on o.id=bp.organization_id left join public.onboarding_profiles op on op.organization_id=o.id
  where bp.slug=lower(trim(p_slug)) and bp.active;
  if result is null then raise exception 'Booking page not found'; end if;
  return result;
end;
$$;


ALTER FUNCTION "public"."get_public_booking_page"("p_slug" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_public_booking_page"("p_slug" "text") IS 'Public booking catalogue including tenant-safe clinic mode and department navigation; excludes private provider contacts.';



CREATE OR REPLACE FUNCTION "public"."get_public_booking_slots"("p_slug" "text", "p_service_id" "uuid", "p_location_id" "uuid", "p_resource_id" "uuid", "p_date" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform private.consume_public_request_limit('public_booking_slots',p_slug,180,60);
  return private.get_public_booking_slots_core(p_slug,p_service_id,p_location_id,p_resource_id,p_date);
end; $$;


ALTER FUNCTION "public"."get_public_booking_slots"("p_slug" "text", "p_service_id" "uuid", "p_location_id" "uuid", "p_resource_id" "uuid", "p_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_site_url"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select trim(trailing '/' from decrypted_secret)
  from vault.decrypted_secrets
  where name = 'public_site_url'
  limit 1;
$$;


ALTER FUNCTION "public"."get_public_site_url"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_whatsapp_booking_acceptance"("p_organization_id" "uuid") RETURNS TABLE("check_key" "text", "status" "text", "evidence_kind" "text", "evidence_summary" "text", "tested_at" timestamp with time zone)
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$ begin
  if not private.is_organization_member(p_organization_id, 'member') then raise exception 'Workspace access required' using errcode = '42501'; end if;
  return query select c.check_key,c.status,c.evidence_kind,c.evidence_summary,c.tested_at from public.whatsapp_booking_acceptance_checks c where c.organization_id=p_organization_id order by c.check_key;
end; $$;


ALTER FUNCTION "public"."get_whatsapp_booking_acceptance"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_whatsapp_booking_handoff"("p_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare h private.whatsapp_booking_handoffs%rowtype;
begin
  if coalesce((select auth.jwt()->>'role'),'')<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  select * into h from private.whatsapp_booking_handoffs
   where token_hash=extensions.digest(convert_to(p_token,'UTF8'),'sha256')
     and consumed_at is null and expires_at>now();
  if h.id is null then return null; end if;
  return jsonb_build_object('service_id',h.service_id,'location_id',h.location_id,'resource_id',h.resource_id,
    'starts_at',h.starts_at,'patient_name',h.patient_name,'booking_contact_name',h.booking_contact_name,
    'booking_contact_phone',h.booking_contact_phone,'patient_relationship',h.patient_relationship);
end;$$;


ALTER FUNCTION "public"."get_whatsapp_booking_handoff"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_permission"("_user_id" "uuid", "_org_id" "uuid", "_permission" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller uuid := (select auth.uid());
  is_staff boolean;
begin
  if caller is not null and caller <> _user_id then
    raise exception 'Cannot evaluate another user' using errcode = '42501';
  end if;
  if caller is null and (select auth.role()) is distinct from 'service_role' then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select exists (
    select 1 from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = _user_id and r.name = 'omnirelay-staff'
  ) into is_staff;

  if is_staff then
    insert into public.audit_logs (organization_id, actor_id, action, details)
    values (_org_id, _user_id, 'STAFF_IMPERSONATION_BYPASS',
      jsonb_build_object('permission_checked', _permission));
    return true;
  end if;

  return exists (
    select 1 from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = _user_id
      and ur.organization_id = _org_id
      and r.permissions @> jsonb_build_array(_permission)
  );
end;
$$;


ALTER FUNCTION "public"."has_permission"("_user_id" "uuid", "_org_id" "uuid", "_permission" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."has_permission"("_user_id" "uuid", "_org_id" "uuid", "_permission" "text") IS 'Backend-only legacy permission helper; no direct browser execution.';



CREATE OR REPLACE FUNCTION "public"."import_doctor_roster"("p_organization_id" "uuid", "p_rows" "jsonb", "p_commit" boolean DEFAULT false, "p_source_format" "text" DEFAULT 'csv'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $_$
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
$_$;


ALTER FUNCTION "public"."import_doctor_roster"("p_organization_id" "uuid", "p_rows" "jsonb", "p_commit" boolean, "p_source_format" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."import_doctor_roster"("p_organization_id" "uuid", "p_rows" "jsonb", "p_commit" boolean, "p_source_format" "text") IS 'Preview-first atomic bulk onboarding for new clinic doctors, chamber assignments and recurring availability.';



CREATE OR REPLACE FUNCTION "public"."import_doctor_roster_v2"("p_organization_id" "uuid", "p_rows" "jsonb", "p_commit" boolean DEFAULT false, "p_source_format" "text" DEFAULT 'csv'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $_$
declare item jsonb; row_number integer:=0; errors jsonb:='[]'::jsonb; normalized jsonb:='[]'::jsonb; weekdays jsonb; doctor_name text; specialization text; department_name text; chamber_name text; start_text text; end_text text; contact_phone text; contact_email text; slot_minutes integer; location_id uuid; resource_id uuid; assignment_id uuid; department_id uuid; imported integer:=0; is_new boolean;
begin
 if not private.is_organization_member(p_organization_id,'admin') then raise exception 'Administrator access required' using errcode='42501'; end if;
 if p_source_format not in ('csv','json') or jsonb_typeof(coalesce(p_rows,'null'::jsonb))<>'array' then raise exception 'Invalid roster import'; end if;
 if jsonb_array_length(p_rows) not between 1 and 200 then raise exception 'Import must contain between 1 and 200 rows'; end if;
 for item in select value from jsonb_array_elements(p_rows) loop
  row_number:=row_number+1; doctor_name:=trim(coalesce(item->>'doctor_name','')); specialization:=trim(coalesce(item->>'specialization','')); department_name:=nullif(trim(coalesce(item->>'department','')),''); chamber_name:=trim(coalesce(item->>'chamber','')); start_text:=trim(coalesce(item->>'start_time','')); end_text:=trim(coalesce(item->>'end_time','')); contact_phone:=nullif(trim(coalesce(item->>'contact_phone','')),''); contact_email:=lower(nullif(trim(coalesce(item->>'contact_email','')),'')); weekdays:=coalesce(item->'weekdays','[]'::jsonb);
  begin slot_minutes:=(item->>'slot_duration_minutes')::integer; exception when others then slot_minutes:=0; end;
  select id into location_id from public.business_locations where organization_id=p_organization_id and active and lower(trim(name))=lower(chamber_name) limit 1;
  if char_length(doctor_name) not between 2 and 120 then errors:=errors||jsonb_build_array(jsonb_build_object('row',row_number,'field','doctor_name','message','Enter a doctor name between 2 and 120 characters.')); end if;
  if specialization='' then errors:=errors||jsonb_build_array(jsonb_build_object('row',row_number,'field','specialization','message','Specialization is required.')); end if;
  if location_id is null then errors:=errors||jsonb_build_array(jsonb_build_object('row',row_number,'field','chamber','message','Chamber name does not match an active clinic location.')); end if;
  if start_text !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or end_text !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or start_text>=end_text then errors:=errors||jsonb_build_array(jsonb_build_object('row',row_number,'field','time','message','Use HH:MM values and ensure end time is later.')); end if;
  if slot_minutes not between 5 and 240 then errors:=errors||jsonb_build_array(jsonb_build_object('row',row_number,'field','slot_duration_minutes','message','Slot duration must be between 5 and 240 minutes.')); end if;
  if jsonb_typeof(weekdays)<>'array' or jsonb_array_length(weekdays)=0 or exists(select 1 from jsonb_array_elements_text(weekdays) d where d !~ '^[0-6]$') then errors:=errors||jsonb_build_array(jsonb_build_object('row',row_number,'field','weekdays','message','Choose weekdays using 0 to 6.')); end if;
  if department_name is not null and char_length(department_name)>80 then errors:=errors||jsonb_build_array(jsonb_build_object('row',row_number,'field','department','message','Department must be 80 characters or fewer.')); end if;
  if contact_email is not null and contact_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then errors:=errors||jsonb_build_array(jsonb_build_object('row',row_number,'field','contact_email','message','Enter a valid email address.')); end if;
  if contact_phone is not null and private.normalize_phone_identity(contact_phone) is null then errors:=errors||jsonb_build_array(jsonb_build_object('row',row_number,'field','contact_phone','message','Enter a valid mobile number.')); end if;
  if exists(select 1 from public.booking_resources r where r.organization_id=p_organization_id and lower(trim(r.name))=lower(doctor_name)) then errors:=errors||jsonb_build_array(jsonb_build_object('row',row_number,'field','doctor_name','message','Doctor already exists; bulk import only creates new doctors.')); end if;
  normalized:=normalized||jsonb_build_array(jsonb_build_object('row',row_number,'doctor_name',doctor_name,'specialization',specialization,'department',department_name,'contact_phone',contact_phone,'contact_email',contact_email,'chamber',chamber_name,'weekdays',weekdays,'start_time',start_text,'end_time',end_text,'slot_duration_minutes',slot_minutes));
 end loop;
 if jsonb_array_length(errors)>0 or not p_commit then return jsonb_build_object('valid',jsonb_array_length(errors)=0,'committed',false,'row_count',jsonb_array_length(p_rows),'rows',normalized,'errors',errors); end if;
 for item in select value from jsonb_array_elements(normalized) loop
  doctor_name:=item->>'doctor_name'; chamber_name:=item->>'chamber'; select id into location_id from public.business_locations where organization_id=p_organization_id and active and lower(trim(name))=lower(chamber_name) limit 1;
  select id into resource_id from public.booking_resources where organization_id=p_organization_id and lower(trim(name))=lower(doctor_name) limit 1; is_new:=resource_id is null;
  if is_new then insert into public.booking_resources(organization_id,location_id,name,resource_type,timezone) select p_organization_id,location_id,doctor_name,'doctor',timezone from public.business_locations where id=location_id returning id into resource_id; insert into public.provider_profiles(resource_id,organization_id,specialization,contact_phone,contact_email,languages) values(resource_id,p_organization_id,item->>'specialization',item->>'contact_phone',item->>'contact_email','{}'::text[]); end if;
  select id into assignment_id from public.provider_location_assignments where organization_id=p_organization_id and resource_id=resource_id and location_id=location_id;
  if assignment_id is null then insert into public.provider_location_assignments(organization_id,resource_id,location_id,active,effective_from,booking_window_days) values(p_organization_id,resource_id,location_id,true,current_date,60) returning id into assignment_id; insert into public.provider_location_services(organization_id,assignment_id,service_id,active) select p_organization_id,assignment_id,id,true from public.organization_services where organization_id=p_organization_id and active and booking_enabled; end if;
  for weekdays in select value from jsonb_array_elements(item->'weekdays') loop insert into public.availability_rules(organization_id,resource_id,location_id,weekday,start_time,end_time,slot_interval_minutes,active,effective_from) values(p_organization_id,resource_id,location_id,(weekdays#>>'{}')::smallint,(item->>'start_time')::time,(item->>'end_time')::time,(item->>'slot_duration_minutes')::integer,true,current_date) on conflict(resource_id,location_id,weekday,start_time,end_time) do update set slot_interval_minutes=excluded.slot_interval_minutes,active=true,effective_from=current_date,effective_to=null,updated_at=now(); end loop;
  department_name:=item->>'department'; if department_name is not null then select id into department_id from public.clinic_departments where organization_id=p_organization_id and lower(trim(name))=lower(department_name) limit 1; if department_id is null then insert into public.clinic_departments(organization_id,name,active,sort_order) values(p_organization_id,department_name,true,999) returning id into department_id; end if; insert into public.provider_departments(organization_id,resource_id,department_id,primary_department) values(p_organization_id,resource_id,department_id,not exists(select 1 from public.provider_departments where organization_id=p_organization_id and resource_id=resource_id)) on conflict(department_id,resource_id) do nothing; end if;
  imported:=imported+1;
 end loop;
 insert into public.doctor_import_jobs(organization_id,source_format,row_count,imported_count,status,payload_hash,created_by) values(p_organization_id,p_source_format,jsonb_array_length(p_rows),imported,'completed',encode(extensions.digest(convert_to(p_rows::text,'UTF8'),'sha256'),'hex'),auth.uid());
 return jsonb_build_object('valid',true,'committed',true,'row_count',jsonb_array_length(p_rows),'imported_count',imported,'errors','[]'::jsonb);
end; $_$;


ALTER FUNCTION "public"."import_doctor_roster_v2"("p_organization_id" "uuid", "p_rows" "jsonb", "p_commit" boolean, "p_source_format" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."init_data"("p_organization_id" "uuid", "p_limit" integer DEFAULT 200, "p_per_conversation" integer DEFAULT 10, "p_since" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_until" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS json
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
declare
  _messages json;
  _conversations json;
  _conversation_ids uuid[];
begin
  -- Windowed messages: up to p_per_conversation per conversation, total p_limit
  with windowed as (
    select m.*,
      row_number() over (
        partition by m.conversation_id
        order by m.timestamp desc
      ) as rn
    from public.messages m
    where m.organization_id = p_organization_id
      and (p_since is null or m.timestamp > p_since)
      and (p_until is null or m.timestamp < p_until)
  ),
  limited as (
    select * from windowed
    where rn <= p_per_conversation
    order by timestamp desc
    limit p_limit
  )
  select
    coalesce(json_agg(row_to_json(l.*)), '[]'::json),
    array_agg(distinct l.conversation_id)
  into _messages, _conversation_ids
  from limited l;

  -- Fetch conversations for the messages returned
  select coalesce(json_agg(row_to_json(c.*)), '[]'::json)
  into _conversations
  from public.conversations c
  where c.id = any(_conversation_ids);

  return json_build_object(
    'conversations', _conversations,
    'messages', _messages
  );
end;
$$;


ALTER FUNCTION "public"."init_data"("p_organization_id" "uuid", "p_limit" integer, "p_per_conversation" integer, "p_since" timestamp with time zone, "p_until" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_oem_operator"() RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select private.is_platform_operator();
$$;


ALTER FUNCTION "public"."is_oem_operator"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."issue_clinical_prescription"("p_organization_id" "uuid", "p_patient_id" "uuid", "p_encounter_id" "uuid" DEFAULT NULL::"uuid", "p_appointment_id" "uuid" DEFAULT NULL::"uuid", "p_diagnosis" "text" DEFAULT NULL::"text", "p_advice" "text" DEFAULT NULL::"text", "p_tests_requested" "text" DEFAULT NULL::"text", "p_follow_up_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_medicines" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $_$
declare
  v_user_id uuid := auth.uid();
  v_prescription public.prescriptions%rowtype;
  v_medicine jsonb;
  v_item public.prescription_items%rowtype;
  v_index integer := 0;
  v_time text;
  v_start_date date;
  v_next_run timestamptz;
  v_days integer;
  v_reminder_count integer := 0;
  v_consent boolean := false;
  v_items jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;

  if not private.is_organization_member(p_organization_id, 'admin') then
    raise exception 'Only workspace owners and administrators can issue prescriptions.' using errcode = '42501';
  end if;

  select pp.care_communications_consent
    into v_consent
  from public.patient_profiles pp
  where pp.id = p_patient_id and pp.organization_id = p_organization_id;
  if not found then
    raise exception 'Patient not found.' using errcode = 'P0002';
  end if;

  if p_encounter_id is not null and not exists (
    select 1 from public.patient_encounters pe
    where pe.id = p_encounter_id
      and pe.patient_id = p_patient_id
      and pe.organization_id = p_organization_id
  ) then
    raise exception 'The selected visit does not belong to this patient.' using errcode = '23503';
  end if;

  if p_appointment_id is not null and not exists (
    select 1 from public.appointments a
    where a.id = p_appointment_id
      and a.patient_id = p_patient_id
      and a.organization_id = p_organization_id
  ) then
    raise exception 'The selected appointment does not belong to this patient.' using errcode = '23503';
  end if;

  if jsonb_typeof(p_medicines) <> 'array'
     or jsonb_array_length(p_medicines) < 1
     or jsonb_array_length(p_medicines) > 20 then
    raise exception 'A prescription must contain between 1 and 20 medicines.' using errcode = '22023';
  end if;

  if p_follow_up_at is not null and p_follow_up_at <= now() then
    raise exception 'Follow-up must be in the future.' using errcode = '22023';
  end if;

  insert into public.prescriptions (
    organization_id, patient_id, encounter_id, appointment_id,
    prescription_number, issued_at, status, diagnosis, advice,
    tests_requested, follow_up_at, created_by
  ) values (
    p_organization_id, p_patient_id, p_encounter_id, p_appointment_id,
    'RX-' || to_char(clock_timestamp() at time zone 'Asia/Kolkata', 'YYYYMMDD') || '-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
    clock_timestamp(), 'issued', nullif(btrim(p_diagnosis), ''),
    nullif(btrim(p_advice), ''), nullif(btrim(p_tests_requested), ''),
    p_follow_up_at, v_user_id
  ) returning * into v_prescription;

  for v_medicine in select value from jsonb_array_elements(p_medicines)
  loop
    if nullif(btrim(v_medicine->>'medicine_name'), '') is null
       or nullif(btrim(v_medicine->>'frequency'), '') is null then
      raise exception 'Every medicine requires a name and frequency.' using errcode = '22023';
    end if;

    insert into public.prescription_items (
      organization_id, prescription_id, medicine_name, dosage, frequency,
      duration, instructions, catalog_entry_id, medicine_identifier,
      medicine_source, catalogue_snapshot, sort_order
    ) values (
      p_organization_id, v_prescription.id, btrim(v_medicine->>'medicine_name'),
      nullif(btrim(v_medicine->>'dosage'), ''), btrim(v_medicine->>'frequency'),
      nullif(btrim(v_medicine->>'duration'), ''), nullif(btrim(v_medicine->>'instructions'), ''),
      nullif(v_medicine->>'catalog_entry_id', '')::bigint,
      nullif(btrim(v_medicine->>'medicine_identifier'), ''),
      coalesce(nullif(btrim(v_medicine->>'medicine_source'), ''), 'manual'),
      coalesce(v_medicine->'catalogue_snapshot', '{}'::jsonb), v_index
    ) returning * into v_item;

    v_items := v_items || jsonb_build_array(to_jsonb(v_item));

    if coalesce((v_medicine->>'reminder_enabled')::boolean, false) and v_consent then
      v_days := least(365, greatest(1, coalesce((v_medicine->>'reminder_days')::integer, 1)));
      for v_time in select value #>> '{}' from jsonb_array_elements(coalesce(v_medicine->'reminder_times', '[]'::jsonb))
      loop
        if v_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
          raise exception 'Reminder time must use HH:MM format.' using errcode = '22023';
        end if;
        v_start_date := (clock_timestamp() at time zone 'Asia/Kolkata')::date;
        v_next_run := (v_start_date::text || ' ' || v_time || ' Asia/Kolkata')::timestamptz;
        if v_next_run <= clock_timestamp() then
          v_start_date := v_start_date + 1;
          v_next_run := (v_start_date::text || ' ' || v_time || ' Asia/Kolkata')::timestamptz;
        end if;

        insert into public.care_reminders (
          organization_id, patient_id, prescription_id, prescription_item_id,
          encounter_id, reminder_type, title, instructions, schedule_kind,
          time_of_day, starts_on, ends_on, timezone, channel, status,
          consent_snapshot, next_run_at, created_by
        ) values (
          p_organization_id, p_patient_id, v_prescription.id, v_item.id,
          p_encounter_id, 'medication',
          btrim(v_medicine->>'medicine_name') || ' · ' || coalesce(nullif(btrim(v_medicine->>'dosage'), ''), btrim(v_medicine->>'frequency')),
          nullif(btrim(v_medicine->>'instructions'), ''), 'daily', v_time::time,
          v_start_date, v_start_date + (v_days - 1), 'Asia/Kolkata', 'whatsapp',
          'active', true, v_next_run, v_user_id
        );
        v_reminder_count := v_reminder_count + 1;
      end loop;
    end if;
    v_index := v_index + 1;
  end loop;

  return jsonb_build_object(
    'prescription', to_jsonb(v_prescription) || jsonb_build_object('items', v_items),
    'reminder_count', v_reminder_count,
    'reminders_skipped_for_consent', (not v_consent) and exists (
      select 1 from jsonb_array_elements(p_medicines) m
      where coalesce((m->>'reminder_enabled')::boolean, false)
    )
  );
end;
$_$;


ALTER FUNCTION "public"."issue_clinical_prescription"("p_organization_id" "uuid", "p_patient_id" "uuid", "p_encounter_id" "uuid", "p_appointment_id" "uuid", "p_diagnosis" "text", "p_advice" "text", "p_tests_requested" "text", "p_follow_up_at" timestamp with time zone, "p_medicines" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."link_whatsapp_booking_consent"("p_consent_evidence_id" "uuid", "p_appointment_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare consent_org uuid;appointment_org uuid;
begin
  if coalesce((select auth.jwt()->>'role'),'')<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  select organization_id into consent_org from public.whatsapp_booking_consent_evidence where id=p_consent_evidence_id and action='accepted';
  select organization_id into appointment_org from public.appointments where id=p_appointment_id for update;
  if consent_org is null or appointment_org is null or consent_org<>appointment_org then return false; end if;
  update public.appointments set booking_consent_evidence_id=p_consent_evidence_id where id=p_appointment_id and booking_consent_evidence_id is null;
  return found;
end;$$;


ALTER FUNCTION "public"."link_whatsapp_booking_consent"("p_consent_evidence_id" "uuid", "p_appointment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lookup_agents_by_email_after_insert_on_auth_users"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  -- Update invitations matching the new user's email (case-insensitive)
  update public.agents
  set user_id = new.id
  where user_id is null
    and lower(extra->'invitation'->>'email') = lower(new.email);

  return new;
end;
$$;


ALTER FUNCTION "public"."lookup_agents_by_email_after_insert_on_auth_users"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lookup_user_id_by_email_before_insert_on_agents"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  -- Check if an invitation already exists for this email in this org (case-insensitive)
  if exists (
    select 1
    from public.agents
    where organization_id = new.organization_id
      and lower(extra->'invitation'->>'email') = lower(new.extra->'invitation'->>'email')
  ) then
    raise exception 'An invitation for this email already exists in this organization';
  end if;

  -- Associate user_id to the agent (auth.users.email is normalized to lowercase
  -- by Supabase, but compare case-insensitively in case the invitation email was
  -- entered with mixed case)
  select id into new.user_id
  from auth.users
  where lower(email) = lower(new.extra->'invitation'->>'email');

  return new;
end;
$$;


ALTER FUNCTION "public"."lookup_user_id_by_email_before_insert_on_agents"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."manage_contact_on_address_sync"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  -- Case 1: Synced Action = ADD
  if new.extra->'synced'->>'action' = 'add' then
    if old is not null and old.contact_id is not null then
      -- Preserve existing link: the upsert payload doesn't include contact_id,
      -- so new.contact_id would be null and overwrite the existing link.
      new.contact_id := old.contact_id;
    elsif new.contact_id is null then
      -- No contact linked from either side, create one
      insert into public.contacts (
        organization_id,
        name
      ) values (
        new.organization_id,
        new.extra->'synced'->>'name'
      ) returning id into new.contact_id;
    end if;
  end if;

  -- Case 2: Synced Action = REMOVE
  -- Unlink. The orphan cleanup happens in the AFTER trigger below to avoid
  -- error 27000 ("tuple to be updated was already modified by an operation
  -- triggered by the current command") caused by the ON DELETE SET NULL
  -- cascade touching the current row.
  -- Note: the address itself might be deleted by cleanup_unlinked_address_if_empty.
  if new.extra->'synced'->>'action' = 'remove' then
    new.contact_id := null;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."manage_contact_on_address_sync"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."manage_whatsapp_appointment"("p_organization_id" "uuid", "p_conversation_id" "uuid", "p_contact_address" "text", "p_appointment_id" "uuid", "p_action" "text", "p_starts_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  a public.appointments%rowtype;
  contact_phone text := regexp_replace(coalesce(p_contact_address,''),'\D','','g');
  duration_mins integer;
  buffer_mins integer;
  tz text;
  local_start timestamp;
  availability record;
  old_starts_at timestamptz;
begin
  if p_action not in ('cancel','reschedule') then raise exception 'Unsupported appointment action'; end if;
  if not exists (
    select 1 from public.conversations c
    where c.id=p_conversation_id and c.organization_id=p_organization_id
      and c.service::text='whatsapp'
      and regexp_replace(coalesce(c.contact_address,''),'\D','','g')=contact_phone
  ) then raise exception 'WhatsApp identity could not be verified'; end if;

  select * into a from public.appointments
  where id=p_appointment_id and organization_id=p_organization_id
    and starts_at>now() and status in ('pending','confirmed','rescheduling_required')
    and (regexp_replace(coalesce(booking_contact_phone,''),'\D','','g')=contact_phone
      or regexp_replace(coalesce(customer_phone,''),'\D','','g')=contact_phone)
  for update;
  if a.id is null then raise exception 'Appointment cannot be managed from this WhatsApp identity'; end if;

  if p_action='cancel' then
    update public.appointments set status='cancelled',updated_at=now() where id=a.id;
    update public.reminder_events set status='cancelled',updated_at=now()
      where appointment_id=a.id and status in ('scheduled','processing');
    insert into public.appointment_events(organization_id,appointment_id,event_type,actor_type,details)
      values(a.organization_id,a.id,'cancelled','customer',jsonb_build_object('source','whatsapp','conversation_id',p_conversation_id));
    return jsonb_build_object('ok',true,'action','cancelled');
  end if;

  if p_starts_at is null or p_starts_at<=now() then raise exception 'Choose a future appointment time'; end if;
  select duration_minutes,buffer_minutes into duration_mins,buffer_mins
    from public.organization_services where id=a.service_id and active and booking_enabled;
  select timezone into tz from public.booking_resources where id=a.resource_id and active;
  local_start:=p_starts_at at time zone coalesce(tz,'Asia/Kolkata');
  select * into availability from public.availability_rules
    where organization_id=a.organization_id and resource_id=a.resource_id and active
      and weekday=extract(dow from local_start)::integer
      and (location_id=a.location_id or location_id is null)
    order by location_id nulls last limit 1;
  if availability.id is null or local_start::time<availability.start_time
    or local_start::time+make_interval(mins=>duration_mins+buffer_mins)>availability.end_time
    or mod(extract(epoch from (local_start::time-availability.start_time))::integer/60,availability.slot_interval_minutes)<>0
  then raise exception 'Selected time is not available'; end if;

  old_starts_at:=a.starts_at;
  update public.appointments set starts_at=p_starts_at,
    ends_at=p_starts_at+make_interval(mins=>duration_mins+buffer_mins),status='confirmed',updated_at=now()
    where id=a.id;
  update public.reminder_events set status='cancelled',updated_at=now()
    where appointment_id=a.id and status in ('scheduled','processing');
  perform private.queue_appointment_reminders(a.id);
  insert into public.appointment_events(organization_id,appointment_id,event_type,actor_type,details)
    values(a.organization_id,a.id,'rescheduled','customer',jsonb_build_object(
      'source','whatsapp','conversation_id',p_conversation_id,'old_starts_at',old_starts_at,'new_starts_at',p_starts_at));
  return jsonb_build_object('ok',true,'action','rescheduled','starts_at',p_starts_at);
exception when exclusion_violation then
  raise exception 'That time was just booked. Please choose another slot';
end;
$$;


ALTER FUNCTION "public"."manage_whatsapp_appointment"("p_organization_id" "uuid", "p_conversation_id" "uuid", "p_contact_address" "text", "p_appointment_id" "uuid", "p_action" "text", "p_starts_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_knowledge_chunks"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer, "p_organization_id" "uuid") RETURNS TABLE("id" "uuid", "content" "text", "similarity" double precision)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if (select auth.uid()) is not null
     and not private.is_organization_member(p_organization_id, 'member') then
    raise exception 'Workspace access required' using errcode = '42501';
  end if;
  if (select auth.uid()) is null
     and (select auth.role()) is distinct from 'service_role' then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if match_count < 1 or match_count > 50
     or match_threshold < 0 or match_threshold > 1 then
    raise exception 'Invalid retrieval bounds';
  end if;

  return query
  select kc.id, kc.content,
    1 - (kc.embedding operator(public.<=>) query_embedding) as similarity
  from public.knowledge_chunks kc
  where kc.organization_id = p_organization_id
    and 1 - (kc.embedding operator(public.<=>) query_embedding) > match_threshold
  order by kc.embedding operator(public.<=>) query_embedding
  limit match_count;
end;
$$;


ALTER FUNCTION "public"."match_knowledge_chunks"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer, "p_organization_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."match_knowledge_chunks"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer, "p_organization_id" "uuid") IS 'Backend-only tenant-scoped knowledge retrieval; expose only through an authenticated server boundary.';



CREATE OR REPLACE FUNCTION "public"."match_rag_knowledge_chunks"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer, "p_organization_id" "uuid") RETURNS TABLE("id" "uuid", "document_id" "uuid", "title" "text", "source_type" "text", "content" "text", "updated_at" timestamp with time zone, "similarity" double precision)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if (select auth.uid()) is not null
     and not private.is_organization_member(p_organization_id, 'member') then
    raise exception 'Workspace access required' using errcode = '42501';
  end if;
  if (select auth.uid()) is null
     and (select auth.role()) is distinct from 'service_role' then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if match_count < 1 or match_count > 8
     or match_threshold < 0 or match_threshold > 1 then
    raise exception 'Invalid retrieval bounds';
  end if;

  return query
  select kc.id, kc.document_id, item.title, item.source_type, kc.content,
    item.updated_at,
    1 - (kc.embedding operator(public.<=>) query_embedding) as similarity
  from public.knowledge_chunks kc
  join public.rag_knowledge_items item on item.id = kc.document_id
  where kc.organization_id = p_organization_id
    and item.organization_id = p_organization_id
    and item.status = 'approved'
    and item.source_type in ('faq', 'policy', 'service', 'business_info')
    and kc.source_updated_at = item.updated_at
    and kc.embedding is not null
    and 1 - (kc.embedding operator(public.<=>) query_embedding) > match_threshold
  order by kc.embedding operator(public.<=>) query_embedding
  limit match_count;
end;
$$;


ALTER FUNCTION "public"."match_rag_knowledge_chunks"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer, "p_organization_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."match_rag_knowledge_chunks"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer, "p_organization_id" "uuid") IS 'Server-only cited retrieval of approved non-clinical tenant knowledge. Never expose vector rows directly to browser roles.';



CREATE OR REPLACE FUNCTION "public"."materialize_due_doctor_queue_dispatches"("p_now" timestamp with time zone DEFAULT "now"()) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."materialize_due_doctor_queue_dispatches"("p_now" timestamp with time zone) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."materialize_due_doctor_queue_dispatches"("p_now" timestamp with time zone) IS 'Creates at most one automatic doctor notification per provider and shift start, preferring explicit chamber rules over generic availability.';



CREATE OR REPLACE FUNCTION "public"."member_self_update_rules"("p_id" "uuid", "p_user_id" "uuid", "p_organization_id" "uuid", "p_ai" boolean, "p_extra" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  return exists (
    select 1 from public.agents
    where id = p_id
      -- updating user_id is not allowed
      and user_id = p_user_id
      -- prevent member from smuggling into another org
      and organization_id = p_organization_id
      -- cannot change to ai
      and ai = p_ai
      -- only owners can change update members role
      and extra->>'role' = p_extra->>'role'
  );
end;
$$;


ALTER FUNCTION "public"."member_self_update_rules"("p_id" "uuid", "p_user_id" "uuid", "p_organization_id" "uuid", "p_ai" boolean, "p_extra" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."merge_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  column_name text := tg_argv[0]::text;
  old_jsonb jsonb;
  new_jsonb jsonb;
  merged_value jsonb;
begin
  -- Get the column name from trigger argument
  if column_name is null or column_name = 'null' then
    raise exception 'column_name argument is missing';
  end if;

  -- Convert records to jsonb
  old_jsonb := to_jsonb(OLD);
  new_jsonb := to_jsonb(NEW);

  -- Get the column values and perform the merge
  merged_value := public.merge_update_jsonb(
    old_jsonb -> column_name,
    '{}'::text[],
    new_jsonb -> column_name
  );

  -- Update NEW with the merged value
  new_jsonb := jsonb_set(new_jsonb, array[column_name], merged_value);

  -- Convert back to record
  NEW := jsonb_populate_record(NEW, new_jsonb);

  return NEW;
end;
$$;


ALTER FUNCTION "public"."merge_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."merge_update_jsonb"("target" "jsonb", "path" "text"[], "object" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
declare
  i int;
  key text;
  value jsonb;
begin
  if target is null then
    target := '{}'::jsonb;
  end if;

  case jsonb_typeof(object) -- object, array, string, number, boolean, and null
    when null then
      target := null;
    when 'object' then
      if jsonb_typeof(target #> path) <> 'object' or target #> path is null then
          if cardinality(path) = 0 then
            target := '{}'::jsonb;
          else
            target := jsonb_set(target, path, '{}', true);
          end if;
      end if;

      for key, value in select * from jsonb_each(object) loop
          target := public.merge_update_jsonb(target, array_append(path, key), value);
      end loop;
    -- when 'array' then
    --   if jsonb_typeof(target #> path) <> 'array' or target #> path is null then
    --     target := jsonb_set(target, path, '[]', true);
    --   end if;

    --   i := 0;
    --   for value in select * from jsonb_array_elements(object) loop
    --     target := public.merge_update_jsonb(target, array_append(path, i::text), value);
    --     i := i + 1;
    --   end loop;
    else
      target := jsonb_set(target, path, object, true);
  end case;

  return target;
end;
$$;


ALTER FUNCTION "public"."merge_update_jsonb"("target" "jsonb", "path" "text"[], "object" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_webhook"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  webhook_record record;
  headers jsonb;
begin
  -- loop through all matching webhooks
  for webhook_record in
    select w.url, w.token
    from public.webhooks w
    where new.organization_id = w.organization_id
      and w.table_name = tg_table_name::public.webhook_table
      and lower(tg_op)::public.webhook_operation = any(w.operations)
    limit 3
  loop
    -- prepare headers
    headers := case
      when webhook_record.token is not null then
        jsonb_build_object(
          'content-type', 'application/json',
          'authorization', 'Bearer ' || webhook_record.token
        )
      else
        jsonb_build_object(
          'content-type', 'application/json'
        )
      end;

    -- send webhook notification
    perform net.http_post(
      url := webhook_record.url,
      body := jsonb_build_object(
        'data', to_jsonb(new),
        'entity', tg_table_name,
        'action', lower(tg_op)
      ),
      headers := headers
    );
  end loop;

  return new;
end;
$$;


ALTER FUNCTION "public"."notify_webhook"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."org_update_by_admin_rules"("p_id" "uuid", "p_name" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  return exists (
    select 1 from public.organizations
    where id = p_id
      -- name cannot be changed by admins
      and name = p_name
  );
end;
$$;


ALTER FUNCTION "public"."org_update_by_admin_rules"("p_id" "uuid", "p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."patient_portal_cancel"("p_token" "text", "p_appointment_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_session private.patient_portal_sessions%rowtype; v_org uuid;
begin
  select * into v_session from private.patient_portal_sessions s
  where s.access_token_hash=extensions.digest(convert_to(coalesce(p_token,''),'UTF8'),'sha256')
    and s.revoked_at is null and s.consumed_at is not null and s.expires_at > now() and s.scope in ('bookings','all');
  if v_session.id is null then raise exception 'This secure session is invalid or has expired'; end if;
  select organization_id into v_org from public.appointments
  where id=p_appointment_id and organization_id=v_session.organization_id and patient_id=v_session.patient_id
    and starts_at>now() and status in ('pending','confirmed','rescheduling_required');
  if v_org is null then raise exception 'Appointment cannot be cancelled'; end if;
  update public.appointments set status='cancelled',updated_at=now() where id=p_appointment_id;
  update public.reminder_events set status='cancelled',updated_at=now() where appointment_id=p_appointment_id and status='scheduled';
  insert into public.appointment_events(organization_id,appointment_id,event_type,actor_type)
  values(v_org,p_appointment_id,'cancelled','patient_portal');
end;
$$;


ALTER FUNCTION "public"."patient_portal_cancel"("p_token" "text", "p_appointment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."patient_portal_reschedule"("p_token" "text", "p_appointment_id" "uuid", "p_starts_at" timestamp with time zone) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_session private.patient_portal_sessions%rowtype;
  a public.appointments%rowtype;
  duration_mins int; buffer_mins int; tz text; local_start timestamp; rule record;
begin
  select * into v_session from private.patient_portal_sessions s
  where s.access_token_hash=extensions.digest(convert_to(coalesce(p_token,''),'UTF8'),'sha256')
    and s.revoked_at is null and s.consumed_at is not null and s.expires_at > now() and s.scope in ('bookings','all');
  if v_session.id is null then raise exception 'This secure session is invalid or has expired'; end if;
  select * into a from public.appointments
  where id=p_appointment_id and organization_id=v_session.organization_id and patient_id=v_session.patient_id
    and status in ('pending','confirmed','rescheduling_required');
  if a.id is null or p_starts_at<=now() then raise exception 'Appointment cannot be rescheduled'; end if;
  select duration_minutes,buffer_minutes into duration_mins,buffer_mins from public.organization_services where id=a.service_id and active and booking_enabled;
  select timezone into tz from public.booking_resources where id=a.resource_id and active;
  local_start:=p_starts_at at time zone tz;
  select * into rule from public.availability_rules where organization_id=a.organization_id and resource_id=a.resource_id and active
    and weekday=extract(dow from local_start)::int and (location_id=a.location_id or location_id is null)
    order by location_id nulls last limit 1;
  if rule.id is null or local_start::time<rule.start_time
    or local_start::time+make_interval(mins=>duration_mins+buffer_mins)>rule.end_time
    or mod(extract(epoch from (local_start::time-rule.start_time))::int/60,rule.slot_interval_minutes)<>0
  then raise exception 'Selected time is not available'; end if;
  update public.appointments set starts_at=p_starts_at,ends_at=p_starts_at+make_interval(mins=>duration_mins+buffer_mins),status='confirmed',updated_at=now() where id=a.id;
  update public.reminder_events set status='cancelled',updated_at=now() where appointment_id=a.id and status='scheduled';
  perform private.queue_appointment_reminders(a.id);
  insert into public.appointment_events(organization_id,appointment_id,event_type,actor_type,details)
  values(a.organization_id,a.id,'rescheduled','patient_portal',jsonb_build_object('old_starts_at',a.starts_at,'new_starts_at',p_starts_at));
exception when exclusion_violation then raise exception 'That time was just booked. Please choose another slot';
end;
$$;


ALTER FUNCTION "public"."patient_portal_reschedule"("p_token" "text", "p_appointment_id" "uuid", "p_starts_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pause_conversation_on_human_message"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  agent_is_ai boolean;
begin
  -- Check if message is from a human (null agent_id or agent with ai = false)
  if new.agent_id is not null then
    select ai into agent_is_ai
    from public.agents
    where id = new.agent_id;

    -- If agent exists and is AI, don't pause
    if agent_is_ai = true then
      return new;
    end if;
  end if;

  update public.conversations
  set extra = jsonb_build_object('paused', now())
  where id = new.conversation_id;

  return new;
end;
$$;


ALTER FUNCTION "public"."pause_conversation_on_human_message"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prepare_abandoned_recovery_acceptance"("p_organization_id" "uuid") RETURNS "public"."whatsapp_acceptance_test_runs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare verified_message public.messages; target_session public.whatsapp_booking_sessions; run public.whatsapp_acceptance_test_runs;
begin
  select m.* into verified_message from public.messages m
  where m.organization_id=p_organization_id and m.direction='outgoing' and m.service='whatsapp'
    and m.status ? 'delivered' and m.timestamp>=now()-interval '30 days'
  order by m.timestamp desc limit 1;
  if verified_message.id is null then raise exception 'A recent delivered WhatsApp record is required' using errcode='22023'; end if;
  select s.* into target_session from public.whatsapp_booking_sessions s
  where s.organization_id=p_organization_id and s.conversation_id=verified_message.conversation_id for update;
  if target_session.id is null then raise exception 'Open the booking MENU once before preparing recovery acceptance' using errcode='22023'; end if;
  if target_session.state<>'welcome' then raise exception 'The verified recipient has an active booking flow; send MENU before preparing this test' using errcode='22023'; end if;
  select * into run from private.arm_whatsapp_acceptance_test_from_delivery(p_organization_id,'abandoned_recovery',verified_message.id,1);
  delete from public.whatsapp_recovery_acceptance_fixtures where organization_id=p_organization_id and status<>'prepared';
  insert into public.whatsapp_recovery_acceptance_fixtures(organization_id,run_id,session_id,conversation_id,previous_expires_at,status,prepared_at,completed_at)
  values(p_organization_id,run.id,target_session.id,target_session.conversation_id,target_session.expires_at,'prepared',now(),null)
  on conflict(organization_id,session_id) do update set run_id=excluded.run_id,previous_expires_at=excluded.previous_expires_at,status='prepared',prepared_at=now(),completed_at=null;
  update public.whatsapp_booking_sessions set expires_at=now()-interval '1 minute',updated_at=now()
  where id=target_session.id and organization_id=p_organization_id and state='welcome';
  return run;
end;
$$;


ALTER FUNCTION "public"."prepare_abandoned_recovery_acceptance"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prepare_deposit_acceptance_test"("p_organization_id" "uuid") RETURNS "public"."whatsapp_acceptance_test_runs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare bound_message_id uuid; result public.whatsapp_acceptance_test_runs;
begin
  select verified_message_id into bound_message_id from public.whatsapp_acceptance_test_runs
  where organization_id=p_organization_id and scenario_key='deposit_payment' for update;
  if bound_message_id is null then raise exception 'A delivery-verified test recipient must be bound first' using errcode='P0001'; end if;
  select * into result from private.arm_whatsapp_acceptance_test_from_delivery(p_organization_id,'deposit_payment',bound_message_id,1);
  return result;
end;
$$;


ALTER FUNCTION "public"."prepare_deposit_acceptance_test"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prepare_whatsapp_acceptance_scenario"("p_organization_id" "uuid", "p_scenario_key" "text") RETURNS "public"."whatsapp_acceptance_test_runs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare verified_message_id uuid; message_ceiling integer; result public.whatsapp_acceptance_test_runs;
begin
  if p_scenario_key not in ('commands_handoff','abandoned_recovery') then raise exception 'Unsupported controlled acceptance scenario' using errcode='22023'; end if;
  message_ceiling:=case p_scenario_key when 'commands_handoff' then 3 when 'abandoned_recovery' then 1 end;
  select m.id into verified_message_id from public.messages m
  where m.organization_id=p_organization_id and m.direction='outgoing' and m.service='whatsapp'
    and m.status ? 'delivered' and m.timestamp>=now()-interval '30 days'
  order by m.timestamp desc limit 1;
  if verified_message_id is null then raise exception 'A recent delivered WhatsApp record is required' using errcode='22023'; end if;
  select * into result from private.arm_whatsapp_acceptance_test_from_delivery(p_organization_id,p_scenario_key,verified_message_id,message_ceiling);
  return result;
end;
$$;


ALTER FUNCTION "public"."prepare_whatsapp_acceptance_scenario"("p_organization_id" "uuid", "p_scenario_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."preserve_message_direction"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.direction := old.direction;
  return new;
end;
$$;


ALTER FUNCTION "public"."preserve_message_direction"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_last_owner_deletion"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  owner_count int;
begin
  -- Skip check if org is being deleted (cascade delete)
  if not exists (
    select 1 from public.organizations
    where id = old.organization_id
    for update skip locked
  ) then
    return old;
  end if;

  if old.extra->>'role' = 'owner' then
    select count(*) into owner_count
    from public.agents
    where organization_id = old.organization_id
      and extra->>'role' = 'owner'
      and (
        extra->>'invitation' is null
        or extra->'invitation'->>'status' = 'accepted'
      )
      and id <> old.id;

    if owner_count = 0 then
      raise exception 'Cannot delete the last owner of an organization';
    end if;
  end if;

  return old;
end;
$$;


ALTER FUNCTION "public"."prevent_last_owner_deletion"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reassign_appointment_provider"("p_organization_id" "uuid", "p_appointment_id" "uuid", "p_resource_id" "uuid", "p_starts_at" timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare a public.appointments%rowtype; duration_minutes integer; buffer_minutes integer; target_tz text; local_start timestamp; local_end timestamp; target_end timestamptz; reminder_channel text; reminder_recipient text;
begin
  if not private.is_organization_member(p_organization_id,'admin') then raise exception 'Administrator access required'; end if;
  if p_starts_at <= now() then raise exception 'Choose a future substitute appointment time'; end if;
  select * into a from public.appointments where id=p_appointment_id and organization_id=p_organization_id for update;
  if a.id is null then raise exception 'Appointment not found'; end if;
  if a.status not in ('confirmed','arrived','rescheduling_required') then raise exception 'Only active appointments can be reassigned'; end if;
  if p_resource_id=a.resource_id then raise exception 'Choose a different doctor for a substitute appointment'; end if;
  select coalesce(x.duration_minutes,s.duration_minutes),coalesce(x.buffer_minutes,s.buffer_minutes,0),r.timezone into duration_minutes,buffer_minutes,target_tz
  from public.provider_location_assignments pa
  join public.provider_location_services x on x.assignment_id=pa.id and x.organization_id=pa.organization_id and x.service_id=a.service_id and x.active
  join public.organization_services s on s.id=a.service_id and s.organization_id=a.organization_id and s.active and s.booking_enabled
  join public.booking_resources r on r.id=pa.resource_id and r.organization_id=pa.organization_id and r.active
  where pa.organization_id=p_organization_id and pa.resource_id=p_resource_id and pa.location_id=a.location_id and pa.active
  limit 1;
  if duration_minutes is null then raise exception 'That doctor is not configured for this chamber and service'; end if;
  local_start:=p_starts_at at time zone coalesce(target_tz,'Asia/Kolkata');
  local_end:=local_start+make_interval(mins=>duration_minutes+buffer_minutes);
  target_end:=p_starts_at+make_interval(mins=>duration_minutes+buffer_minutes);
  if not exists(select 1 from public.availability_rules v where v.organization_id=p_organization_id and v.resource_id=p_resource_id and v.active and (v.location_id=a.location_id or (v.location_id is null and not exists(select 1 from public.availability_rules exact where exact.organization_id=p_organization_id and exact.resource_id=p_resource_id and exact.location_id=a.location_id and exact.active and exact.weekday=extract(dow from local_start)::int))) and v.weekday=extract(dow from local_start)::int and (v.effective_from is null or local_start::date>=v.effective_from) and (v.effective_to is null or local_start::date<=v.effective_to) and local_start::time>=v.start_time and local_end::time<=v.end_time and mod(extract(epoch from(local_start::time-v.start_time))::integer/60,v.slot_interval_minutes)=0) then raise exception 'That doctor is not available at the selected time'; end if;
  if exists(select 1 from public.schedule_exceptions e where e.organization_id=p_organization_id and e.status='active' and (e.resource_id is null or e.resource_id=p_resource_id) and (e.location_id is null or e.location_id=a.location_id) and p_starts_at<e.ends_at and target_end>e.starts_at) then raise exception 'That time is blocked by a schedule exception'; end if;
  if exists(select 1 from public.appointments other where other.organization_id=p_organization_id and other.resource_id=p_resource_id and other.id<>a.id and other.status in ('pending','payment_pending','confirmed','arrived','in_consultation','rescheduling_required') and p_starts_at<other.ends_at and target_end>other.starts_at) then raise exception 'That substitute slot was just booked'; end if;
  update public.appointments set resource_id=p_resource_id,starts_at=p_starts_at,ends_at=target_end,status='confirmed',updated_at=now() where id=a.id;
  update public.reminder_events set status='cancelled',updated_at=now() where appointment_id=a.id and event_type in ('reminder_24h','reminder_2h') and status='scheduled';
  if a.care_communications_consent then
    reminder_channel:=case when nullif(trim(coalesce(a.customer_phone,'')),'') is not null then 'whatsapp' else 'email' end;
    reminder_recipient:=coalesce(nullif(trim(coalesce(a.customer_phone,'')),''),nullif(trim(coalesce(a.customer_email,'')),''));
    if reminder_recipient is not null then insert into public.reminder_events(organization_id,appointment_id,event_type,scheduled_for,channel,recipient,status,provider_response) values(p_organization_id,a.id,'reschedule',now(),reminder_channel,reminder_recipient,'scheduled',jsonb_build_object('purpose','substitute_doctor','previous_resource_id',a.resource_id,'new_resource_id',p_resource_id)) on conflict(appointment_id,event_type,channel) do update set scheduled_for=excluded.scheduled_for,recipient=excluded.recipient,status='scheduled',attempts=0,updated_at=now(),provider_response=excluded.provider_response; end if;
  end if;
  insert into public.appointment_events(organization_id,appointment_id,event_type,actor_type,actor_id,details) values(p_organization_id,a.id,'substitute_doctor_assigned','staff',auth.uid(),jsonb_build_object('previous_resource_id',a.resource_id,'new_resource_id',p_resource_id,'starts_at',p_starts_at));
  return jsonb_build_object('appointment_id',a.id,'resource_id',p_resource_id,'starts_at',p_starts_at,'ends_at',target_end);
end; $$;


ALTER FUNCTION "public"."reassign_appointment_provider"("p_organization_id" "uuid", "p_appointment_id" "uuid", "p_resource_id" "uuid", "p_starts_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_shadow_provider_result"("p_provider_config_key" "text", "p_retryable_failure" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare s private.ai_provider_state%rowtype; v_failures integer;
begin
  select * into s from private.ai_provider_state where provider_config_key=p_provider_config_key for update;
  if not found then return; end if;
  if not p_retryable_failure then
    update private.ai_provider_state set state='closed', failure_count=0, open_until=null, half_open_probe_in_flight=false, updated_at=now() where provider_config_key=p_provider_config_key;
    return;
  end if;
  v_failures := s.failure_count + 1;
  update private.ai_provider_state set failure_count=v_failures, last_failure_at=now(), state=case when v_failures >= 5 then 'open' else 'closed' end, open_until=case when v_failures >= 5 then now()+interval '5 minutes' else null end, half_open_probe_in_flight=false, updated_at=now() where provider_config_key=p_provider_config_key;
end $$;


ALTER FUNCTION "public"."record_shadow_provider_result"("p_provider_config_key" "text", "p_retryable_failure" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_webhook_event"("p_event_id" "text", "p_provider" "text", "p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    inserted_count INT;
BEGIN
    INSERT INTO public.webhook_events (event_id, provider, organization_id)
    VALUES (p_event_id, p_provider, p_organization_id)
    ON CONFLICT (event_id) DO NOTHING;

    GET DIAGNOSTICS inserted_count = ROW_COUNT;

    -- Return TRUE if new event inserted; FALSE if already processed duplicate
    RETURN (inserted_count > 0);
END;
$$;


ALTER FUNCTION "public"."record_webhook_event"("p_event_id" "text", "p_provider" "text", "p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_whatsapp_booking_consent"("p_organization_id" "uuid", "p_conversation_id" "uuid", "p_session_id" "uuid", "p_source_message_id" "uuid", "p_channel_identity" "text", "p_notice_version" "text", "p_notice_text" "text", "p_action" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare normalized text;pepper text;digest bytea;event_id uuid;
begin
  if coalesce((select auth.jwt()->>'role'),'')<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  if p_action not in ('accepted','declined') or nullif(trim(p_notice_version),'') is null or nullif(trim(p_notice_text),'') is null then raise exception 'Complete consent evidence required'; end if;
  normalized:=private.normalize_phone_identity(p_channel_identity);
  if normalized is null or length(normalized)<4 then raise exception 'Invalid WhatsApp identity'; end if;
  if not exists(select 1 from public.messages m where m.id=p_source_message_id and m.organization_id=p_organization_id and m.conversation_id=p_conversation_id and m.direction='incoming' and m.service='whatsapp' and private.normalize_phone_identity(m.contact_address)=normalized) then raise exception 'Consent must come from the verified WhatsApp conversation'; end if;
  if not exists(select 1 from public.whatsapp_booking_sessions s where s.id=p_session_id and s.organization_id=p_organization_id and s.conversation_id=p_conversation_id) then raise exception 'Booking session mismatch'; end if;
  perform public.record_whatsapp_identity_verification(p_organization_id,p_conversation_id,p_session_id,p_source_message_id,p_channel_identity);
  select decrypted_secret into pepper from vault.decrypted_secrets where name='edge_functions_token' limit 1;
  digest:=extensions.hmac(p_organization_id::text||'|'||normalized,pepper,'sha256');
  insert into public.whatsapp_booking_consent_evidence(organization_id,conversation_id,session_id,source_message_id,notice_version,notice_text,action,channel_identity_hash,channel_identity_last4)
  values(p_organization_id,p_conversation_id,p_session_id,p_source_message_id,trim(p_notice_version),p_notice_text,p_action,digest,right(normalized,4))
  returning id into event_id;
  if p_action='accepted' then
    if exists(select 1 from public.communication_opt_outs where organization_id=p_organization_id and channel='whatsapp' and address=normalized and scope='all') then
      delete from public.communication_opt_outs where organization_id=p_organization_id and channel='whatsapp' and address=normalized and scope='all';
      insert into public.communication_opt_outs(organization_id,channel,address,scope,source,reason)
      values(p_organization_id,'whatsapp',normalized,'marketing','booking_care_reconsent','Marketing remains opted out after explicit booking-care consent')
      on conflict(organization_id,channel,address,scope) do update set opted_out_at=now(),source=excluded.source,reason=excluded.reason;
    end if;
    delete from public.communication_opt_outs where organization_id=p_organization_id and channel='whatsapp' and address=normalized and scope='care';
  end if;
  return event_id;
end;$$;


ALTER FUNCTION "public"."record_whatsapp_booking_consent"("p_organization_id" "uuid", "p_conversation_id" "uuid", "p_session_id" "uuid", "p_source_message_id" "uuid", "p_channel_identity" "text", "p_notice_version" "text", "p_notice_text" "text", "p_action" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_whatsapp_identity_verification"("p_organization_id" "uuid", "p_conversation_id" "uuid", "p_session_id" "uuid", "p_source_message_id" "uuid", "p_channel_identity" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare normalized text;pepper text;digest bytea;event_id uuid;
begin
  if coalesce((select auth.jwt()->>'role'),'')<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  normalized:=private.normalize_phone_identity(p_channel_identity);
  if normalized is null or length(normalized)<4 then raise exception 'Invalid WhatsApp identity'; end if;
  if not exists(select 1 from public.messages m where m.id=p_source_message_id and m.organization_id=p_organization_id and m.conversation_id=p_conversation_id and m.direction='incoming' and m.service='whatsapp' and private.normalize_phone_identity(m.contact_address)=normalized) then raise exception 'Verified inbound WhatsApp message required'; end if;
  if p_session_id is not null and not exists(select 1 from public.whatsapp_booking_sessions s where s.id=p_session_id and s.organization_id=p_organization_id and s.conversation_id=p_conversation_id) then raise exception 'Booking session mismatch'; end if;
  select decrypted_secret into pepper from vault.decrypted_secrets where name='edge_functions_token' limit 1;
  if nullif(pepper,'') is null then raise exception 'Identity protection unavailable'; end if;
  digest:=extensions.hmac(p_organization_id::text||'|'||normalized,pepper,'sha256');
  insert into public.patient_identity_verification_events(organization_id,conversation_id,session_id,source_message_id,identity_type,verification_method,identity_hash,identity_last4,metadata)
  values(p_organization_id,p_conversation_id,p_session_id,p_source_message_id,'whatsapp','inbound_channel_possession',digest,right(normalized,4),jsonb_build_object('source','booking_concierge'))
  on conflict(organization_id,conversation_id,identity_hash) do nothing returning id into event_id;
  if event_id is null then select id into event_id from public.patient_identity_verification_events where organization_id=p_organization_id and conversation_id=p_conversation_id and identity_hash=digest; end if;
  return event_id;
end;$$;


ALTER FUNCTION "public"."record_whatsapp_identity_verification"("p_organization_id" "uuid", "p_conversation_id" "uuid", "p_session_id" "uuid", "p_source_message_id" "uuid", "p_channel_identity" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recover_stale_managed_automation_runs"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare recovered integer;
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  update public.automation_runs r
  set status = case when r.attempt_count < r.max_attempts then 'retrying' else 'failed' end,
      next_attempt_at = case when r.attempt_count < r.max_attempts then now() else null end,
      completed_at = case when r.attempt_count >= r.max_attempts then now() else null end,
      failure_code = 'worker_timeout',
      failure_summary = 'Managed execution timed out and was recovered safely.',
      updated_at = now()
  from public.automation_workflows w
  where r.workflow_id = w.id
    and r.organization_id = w.organization_id
    and r.status = 'processing'
    and r.started_at < now() - make_interval(secs => w.timeout_seconds);
  get diagnostics recovered = row_count;
  return recovered;
end;
$$;


ALTER FUNCTION "public"."recover_stale_managed_automation_runs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_priority_action_alerts"("p_organization_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare inserted_count integer:=0; row_count integer;
begin
  if not private.is_organization_member(p_organization_id,'member') then
    raise exception 'Forbidden' using errcode='42501';
  end if;

  update public.app_notifications n
  set read_at = now()
  from public.reminder_events r
  where n.organization_id = p_organization_id
    and n.organization_id = r.organization_id
    and n.entity_type = 'failed_appointment_notification'
    and n.entity_id = r.id
    and n.read_at is null
    and (
      r.failure_reason = 'Appointment no longer exists.'
      or coalesce(r.last_attempt_at,r.updated_at,r.created_at) < now() - interval '24 hours'
    );

  insert into public.app_notifications(organization_id,recipient_user_id,notification_type,title,body,href,entity_type,entity_id,priority,escalation_level)
  select r.organization_id,a.user_id,'serious_action','Booking approval overdue','A WhatsApp booking request has waited more than 15 minutes for approve, waitlist or reject.','/app/action-centre','escalated_booking_request',r.id,'critical',2
  from public.whatsapp_booking_requests r join public.agents a on a.organization_id=r.organization_id and a.ai=false and a.user_id is not null
  where r.organization_id=p_organization_id and r.status='pending_approval' and r.created_at<=now()-interval '15 minutes'
    and coalesce(a.extra->>'role','member') in ('owner','admin') and coalesce(a.extra->>'status','active')<>'inactive'
    and not exists(select 1 from public.app_notifications n where n.organization_id=r.organization_id and n.recipient_user_id=a.user_id and n.entity_type='escalated_booking_request' and n.entity_id=r.id and n.read_at is null);
  get diagnostics row_count=row_count; inserted_count:=inserted_count+row_count;

  insert into public.app_notifications(organization_id,recipient_user_id,notification_type,title,body,href,entity_type,entity_id,priority,escalation_level)
  select e.organization_id,a.user_id,'serious_action','Schedule disruption requires coordination','An active clinic schedule exception begins within 24 hours. Review affected appointments and notification delivery.','/app/action-centre','schedule_disruption',e.id,'critical',3
  from public.schedule_exceptions e join public.agents a on a.organization_id=e.organization_id and a.ai=false and a.user_id is not null
  where e.organization_id=p_organization_id and e.status='active' and e.starts_at<=now()+interval '24 hours' and e.ends_at>now()
    and coalesce(a.extra->>'role','member') in ('owner','admin') and coalesce(a.extra->>'status','active')<>'inactive'
    and not exists(select 1 from public.app_notifications n where n.organization_id=e.organization_id and n.recipient_user_id=a.user_id and n.entity_type='schedule_disruption' and n.entity_id=e.id and n.read_at is null);
  get diagnostics row_count=row_count; inserted_count:=inserted_count+row_count;

  insert into public.app_notifications(organization_id,recipient_user_id,notification_type,title,body,href,entity_type,entity_id,priority,escalation_level)
  select r.organization_id,a.user_id,'serious_action','Appointment notification failed','A patient appointment notification exhausted or requires operational review. Patient identity is available only inside the protected workspace.','/app/action-centre','failed_appointment_notification',r.id,'high',1
  from public.reminder_events r join public.agents a on a.organization_id=r.organization_id and a.ai=false and a.user_id is not null
  where r.organization_id=p_organization_id and r.status='failed'
    and r.failure_reason is distinct from 'Appointment no longer exists.'
    and coalesce(r.last_attempt_at,r.updated_at,r.created_at)>=now()-interval '24 hours'
    and coalesce(a.extra->>'role','member') in ('owner','admin') and coalesce(a.extra->>'status','active')<>'inactive'
    and not exists(select 1 from public.app_notifications n where n.organization_id=r.organization_id and n.recipient_user_id=a.user_id and n.entity_type='failed_appointment_notification' and n.entity_id=r.id and n.read_at is null);
  get diagnostics row_count=row_count; inserted_count:=inserted_count+row_count;

  insert into public.app_notifications(organization_id,recipient_user_id,notification_type,title,body,href,entity_type,entity_id,priority,escalation_level)
  select t.organization_id,a.user_id,'serious_action','Overdue follow-up needs an owner','A high-priority or overdue care task remains open. Claim it in the Action Centre before reviewing the protected patient record.','/app/action-centre','overdue_care_task',t.id,case when t.priority='urgent' then 'critical' else 'high' end,case when t.priority='urgent' then 2 else 1 end
  from public.patient_care_tasks t join public.agents a on a.organization_id=t.organization_id and a.ai=false and a.user_id is not null
  where t.organization_id=p_organization_id and t.status in ('open','in_progress') and (t.priority in ('high','urgent') or t.due_at<=now())
    and coalesce(a.extra->>'role','member') in ('owner','admin') and coalesce(a.extra->>'status','active')<>'inactive'
    and not exists(select 1 from public.app_notifications n where n.organization_id=t.organization_id and n.recipient_user_id=a.user_id and n.entity_type='overdue_care_task' and n.entity_id=t.id and n.read_at is null);
  get diagnostics row_count=row_count; inserted_count:=inserted_count+row_count;
  return inserted_count;
end;
$$;


ALTER FUNCTION "public"."refresh_priority_action_alerts"("p_organization_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."refresh_priority_action_alerts"("p_organization_id" "uuid") IS 'Creates current privacy-safe administrator alerts and auto-closes stale appointment-notification alerts without retrying or sending messages.';



CREATE OR REPLACE FUNCTION "public"."reschedule_appointment"("p_organization_id" "uuid", "p_appointment_id" "uuid", "p_starts_at" timestamp with time zone) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare service_duration integer; service_buffer integer; affected integer; old_start timestamptz;
begin
  if not private.is_organization_member(p_organization_id,'admin') then raise exception 'Administrator access required'; end if;
  if p_starts_at<now()-interval '5 minutes' then raise exception 'Appointment must be in the future'; end if;
  select s.duration_minutes,s.buffer_minutes,a.starts_at into service_duration,service_buffer,old_start
  from public.appointments a join public.organization_services s on s.id=a.service_id and s.organization_id=a.organization_id
  where a.id=p_appointment_id and a.organization_id=p_organization_id and a.status in ('pending','confirmed','rescheduling_required') and s.active and s.booking_enabled;
  if service_duration is null then raise exception 'Active appointment or bookable service not found'; end if;
  update public.appointments set starts_at=p_starts_at,ends_at=p_starts_at+make_interval(mins=>service_duration+service_buffer),status='confirmed',updated_at=now()
  where id=p_appointment_id and organization_id=p_organization_id and status in ('pending','confirmed','rescheduling_required');
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'Appointment could not be rescheduled'; end if;
  update public.reminder_events set status='cancelled',updated_at=now() where appointment_id=p_appointment_id and status='scheduled';
  perform private.queue_appointment_reminders(p_appointment_id);
  insert into public.appointment_events(organization_id,appointment_id,event_type,actor_type,actor_id,details)
  values(p_organization_id,p_appointment_id,'rescheduled','staff',auth.uid(),jsonb_build_object('old_starts_at',old_start,'new_starts_at',p_starts_at));
exception when exclusion_violation then raise exception 'This provider already has an appointment during that time';
end;
$$;


ALTER FUNCTION "public"."reschedule_appointment"("p_organization_id" "uuid", "p_appointment_id" "uuid", "p_starts_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reschedule_customer_booking"("p_booking_reference" "text", "p_manage_token" "text", "p_starts_at" timestamp with time zone) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform private.consume_public_request_limit('public_booking_reschedule',p_booking_reference,20,600);
  perform private.reschedule_customer_booking_core(p_booking_reference,p_manage_token,p_starts_at);
end; $$;


ALTER FUNCTION "public"."reschedule_customer_booking"("p_booking_reference" "text", "p_manage_token" "text", "p_starts_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."respond_waitlist_offer"("p_organization_id" "uuid", "p_patient_phone" "text", "p_action" "text") RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select private.respond_waitlist_offer(p_organization_id,p_patient_phone,p_action);
$$;


ALTER FUNCTION "public"."respond_waitlist_offer"("p_organization_id" "uuid", "p_patient_phone" "text", "p_action" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restore_whatsapp_care_consent"("p_organization_id" "uuid", "p_conversation_id" "uuid", "p_session_id" "uuid", "p_source_message_id" "uuid", "p_channel_identity" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  normalized text;
  matched_patient uuid;
  pepper text;
  identity_digest bytea;
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  normalized := private.normalize_phone_identity(p_channel_identity);
  if normalized is null or length(normalized) < 4 then
    raise exception 'Invalid WhatsApp identity';
  end if;

  if not exists (
    select 1 from public.messages m
    where m.id = p_source_message_id
      and m.organization_id = p_organization_id
      and m.conversation_id = p_conversation_id
      and m.direction = 'incoming'
      and m.service = 'whatsapp'
      and lower(trim(coalesce(m.content->>'text', ''))) = 'start'
      and private.normalize_phone_identity(m.contact_address) = normalized
  ) then
    raise exception 'START must come from the verified WhatsApp conversation';
  end if;

  if not exists (
    select 1 from public.whatsapp_booking_sessions s
    where s.id = p_session_id
      and s.organization_id = p_organization_id
      and s.conversation_id = p_conversation_id
  ) then
    raise exception 'Booking session mismatch';
  end if;

  perform public.record_whatsapp_identity_verification(
    p_organization_id,
    p_conversation_id,
    p_session_id,
    p_source_message_id,
    p_channel_identity
  );

  delete from public.communication_opt_outs
  where organization_id = p_organization_id
    and channel = 'whatsapp'
    and address = normalized
    and scope in ('all', 'care');

  insert into public.communication_opt_outs (
    organization_id, channel, address, scope, source, reason
  ) values (
    p_organization_id, 'whatsapp', normalized, 'marketing',
    'whatsapp_start', 'Marketing remains opted out after START'
  )
  on conflict (organization_id, channel, address, scope)
  do update set
    opted_out_at = now(),
    source = excluded.source,
    reason = excluded.reason;

  select p.id into matched_patient
  from public.patient_profiles p
  where p.organization_id = p_organization_id
    and p.normalized_phone = normalized
  limit 1;

  if matched_patient is not null then
    perform set_config('omnirelay.consent_source', 'whatsapp_start', true);
    perform set_config(
      'omnirelay.consent_note',
      'Patient sent START from the verified clinic WhatsApp conversation; marketing remains off.',
      true
    );
    update public.patient_profiles
    set care_communications_consent = true,
        marketing_consent = false,
        updated_at = now()
    where id = matched_patient;
  end if;

  select decrypted_secret into pepper
  from vault.decrypted_secrets
  where name = 'edge_functions_token'
  limit 1;
  identity_digest := extensions.hmac(
    p_organization_id::text || '|' || normalized,
    pepper,
    'sha256'
  );

  insert into public.whatsapp_preference_events (
    organization_id, patient_id, conversation_id, session_id,
    source_message_id, action, identity_hash, identity_last4,
    care_communications_enabled, marketing_enabled,
    metadata
  ) values (
    p_organization_id, matched_patient, p_conversation_id, p_session_id,
    p_source_message_id, 'start', identity_digest, right(normalized, 4),
    true, false,
    jsonb_build_object('verified_by', 'whatsapp_channel_possession')
  )
  on conflict (organization_id, source_message_id, action) do nothing;

  return jsonb_build_object(
    'restored', true,
    'patient_linked', matched_patient is not null,
    'marketing_enabled', false
  );
end;
$$;


ALTER FUNCTION "public"."restore_whatsapp_care_consent"("p_organization_id" "uuid", "p_conversation_id" "uuid", "p_session_id" "uuid", "p_source_message_id" "uuid", "p_channel_identity" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."restore_whatsapp_care_consent"("p_organization_id" "uuid", "p_conversation_id" "uuid", "p_session_id" "uuid", "p_source_message_id" "uuid", "p_channel_identity" "text") IS 'Service-role-only START handler. Restores clinic-care messages, preserves marketing opt-out, and records channel-possession evidence.';



CREATE OR REPLACE FUNCTION "public"."retry_failed_automation_job"("p_organization_id" "uuid", "p_job_kind" "text", "p_job_id" "uuid", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  actor uuid := (select auth.uid());
  previous_status text;
  affected integer := 0;
  recent_recoveries integer := 0;
begin
  if actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not private.is_organization_member(p_organization_id, 'admin') then
    raise exception 'Workspace administrator access required' using errcode = '42501';
  end if;
  if p_job_kind not in ('appointment_reminder','care_reminder') then
    raise exception 'Unsupported automation job type';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 3 and 240 then
    raise exception 'A short recovery reason is required';
  end if;

  select count(*) into recent_recoveries
  from public.automation_recovery_events
  where organization_id = p_organization_id
    and actor_user_id = actor
    and created_at >= now() - interval '1 hour';
  if recent_recoveries >= 20 then
    raise exception 'Recovery limit reached. Review the underlying channel issue before retrying again.';
  end if;

  if p_job_kind = 'appointment_reminder' then
    select status into previous_status
    from public.reminder_events
    where id = p_job_id and organization_id = p_organization_id
    for update;

    if previous_status is distinct from 'failed' then
      raise exception 'Only failed appointment reminders can be retried';
    end if;

    update public.reminder_events
    set status = 'scheduled',
        attempts = least(attempts, greatest(max_attempts - 1, 0)),
        next_attempt_at = now(),
        failure_reason = null,
        updated_at = now()
    where id = p_job_id and organization_id = p_organization_id;
    get diagnostics affected = row_count;
  else
    select status into previous_status
    from public.care_reminder_runs
    where id = p_job_id and organization_id = p_organization_id
    for update;

    if previous_status is distinct from 'failed' then
      raise exception 'Only failed care reminders can be retried';
    end if;

    update public.care_reminder_runs
    set status = 'approved',
        attempt_count = least(attempt_count, greatest(max_attempts - 1, 0)),
        next_attempt_at = now(),
        failure_reason = null,
        updated_at = now()
    where id = p_job_id and organization_id = p_organization_id;
    get diagnostics affected = row_count;
  end if;

  if affected <> 1 then
    raise exception 'Automation job was not found';
  end if;

  insert into public.automation_recovery_events (
    organization_id, actor_user_id, job_kind, job_id, action, reason, previous_status
  ) values (
    p_organization_id, actor, p_job_kind, p_job_id, 'manual_retry', trim(p_reason), previous_status
  );

  return jsonb_build_object(
    'ok', true,
    'job_kind', p_job_kind,
    'job_id', p_job_id,
    'released_at', now()
  );
end;
$$;


ALTER FUNCTION "public"."retry_failed_automation_job"("p_organization_id" "uuid", "p_job_kind" "text", "p_job_id" "uuid", "p_reason" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."retry_failed_automation_job"("p_organization_id" "uuid", "p_job_kind" "text", "p_job_id" "uuid", "p_reason" "text") IS 'Releases one tenant-scoped failed reminder for a single audited manual retry.';



CREATE OR REPLACE FUNCTION "public"."revoke_patient_portal_session"("p_token" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  update private.patient_portal_sessions set revoked_at=coalesce(revoked_at,now())
  where access_token_hash=extensions.digest(convert_to(coalesce(p_token,''),'UTF8'),'sha256') and consumed_at is not null;
end; $$;


ALTER FUNCTION "public"."revoke_patient_portal_session"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_provider_chamber_schedule"("p_organization_id" "uuid", "p_resource_id" "uuid", "p_location_id" "uuid", "p_active" boolean, "p_effective_from" "date", "p_effective_to" "date", "p_booking_window_days" integer, "p_services" "jsonb", "p_sessions" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_assignment_id uuid;item jsonb;requested_modes text[];primary_mode text;gateway_ready boolean;
begin
  if not private.is_organization_member(p_organization_id,'admin') then raise exception 'Administrator access required'; end if;
  if not exists(select 1 from public.booking_resources where id=p_resource_id and organization_id=p_organization_id and active)
    or not exists(select 1 from public.business_locations where id=p_location_id and organization_id=p_organization_id and active)
  then raise exception 'Provider or chamber not found'; end if;
  if p_effective_to is not null and p_effective_to<p_effective_from then raise exception 'End date must be after the start date'; end if;
  select exists(select 1 from public.payment_gateway_connections where organization_id=p_organization_id and provider='razorpay' and status in ('test','live')) into gateway_ready;
  insert into public.provider_location_assignments(organization_id,resource_id,location_id,active,effective_from,effective_to,booking_window_days)
  values(p_organization_id,p_resource_id,p_location_id,p_active,p_effective_from,p_effective_to,p_booking_window_days)
  on conflict(resource_id,location_id) do update set active=excluded.active,effective_from=excluded.effective_from,effective_to=excluded.effective_to,booking_window_days=excluded.booking_window_days,updated_at=now()
  returning id into v_assignment_id;
  delete from public.provider_location_services where assignment_id=v_assignment_id;
  for item in select value from jsonb_array_elements(coalesce(p_services,'[]'::jsonb)) loop
    if coalesce((item->>'active')::boolean,true) then
      if not exists(select 1 from public.organization_services where id=(item->>'service_id')::uuid and organization_id=p_organization_id and active and booking_enabled) then raise exception 'Invalid service selection'; end if;
      select coalesce(array_agg(value),array[coalesce(nullif(item->>'payment_mode',''),'pay_at_location')])
      into requested_modes from jsonb_array_elements_text(coalesce(item->'allowed_payment_modes','[]'::jsonb));
      if cardinality(requested_modes)=0 or not(requested_modes <@ array['pay_at_location','full_online','deposit_online']::text[]) then raise exception 'Choose valid payment options'; end if;
      if (requested_modes && array['full_online','deposit_online']::text[]) and not gateway_ready then raise exception 'Connect and verify Razorpay before enabling online payment'; end if;
      primary_mode:=case when 'pay_at_location'=any(requested_modes) then 'pay_at_location' else requested_modes[1] end;
      insert into public.provider_location_services(
        organization_id,assignment_id,service_id,active,duration_minutes,buffer_minutes,price_paise,payment_mode,allowed_payment_modes,deposit_paise
      ) values(
        p_organization_id,v_assignment_id,(item->>'service_id')::uuid,true,
        nullif(item->>'duration_minutes','')::integer,nullif(item->>'buffer_minutes','')::integer,
        nullif(item->>'price_paise','')::integer,primary_mode,requested_modes,
        case when 'deposit_online'=any(requested_modes) then nullif(item->>'deposit_paise','')::integer else null end
      );
    end if;
  end loop;
  delete from public.availability_rules where organization_id=p_organization_id and resource_id=p_resource_id and location_id=p_location_id;
  for item in select value from jsonb_array_elements(coalesce(p_sessions,'[]'::jsonb)) loop
    insert into public.availability_rules(organization_id,resource_id,location_id,weekday,start_time,end_time,slot_interval_minutes,active,effective_from,effective_to)
    values(p_organization_id,p_resource_id,p_location_id,(item->>'weekday')::smallint,(item->>'start_time')::time,(item->>'end_time')::time,coalesce((item->>'slot_interval_minutes')::integer,15),true,p_effective_from,p_effective_to);
  end loop;
  return v_assignment_id;
end;
$$;


ALTER FUNCTION "public"."save_provider_chamber_schedule"("p_organization_id" "uuid", "p_resource_id" "uuid", "p_location_id" "uuid", "p_active" boolean, "p_effective_from" "date", "p_effective_to" "date", "p_booking_window_days" integer, "p_services" "jsonb", "p_sessions" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."schedule_doctor_queue_notification"("p_organization_id" "uuid", "p_availability_rule_id" "uuid", "p_shift_date" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  rule_row public.availability_rules%rowtype;
  profile_row public.provider_profiles%rowtype;
  dispatch_row public.doctor_queue_dispatches%rowtype;
  shift_at timestamptz;
begin
  if not private.is_organization_member(p_organization_id, 'admin') then
    raise exception 'Administrator access required' using errcode='42501';
  end if;
  select * into rule_row from public.availability_rules
    where id=p_availability_rule_id and organization_id=p_organization_id and active;
  if not found then raise exception 'Scheduled doctor shift was not found'; end if;
  select * into profile_row from public.provider_profiles
    where resource_id=rule_row.resource_id and organization_id=p_organization_id;
  if not found or not profile_row.queue_notifications_enabled or profile_row.whatsapp_queue_consent_at is null then
    raise exception 'Doctor WhatsApp queue consent is not active';
  end if;
  if private.normalize_phone_identity(profile_row.contact_phone) is null then
    raise exception 'Doctor WhatsApp number is missing or invalid';
  end if;
  shift_at := ((p_shift_date + rule_row.start_time) at time zone 'Asia/Kolkata');
  insert into public.doctor_queue_dispatches (
    organization_id,resource_id,availability_rule_id,shift_date,shift_starts_at,
    scheduled_for,recipient_phone,booking_count,next_attempt_at
  ) values (
    p_organization_id,rule_row.resource_id,rule_row.id,p_shift_date,shift_at,
    now(),private.normalize_phone_identity(profile_row.contact_phone),
    (select count(*)::integer from public.appointments a where a.organization_id=p_organization_id
      and a.resource_id=rule_row.resource_id and a.starts_at>=shift_at
      and a.starts_at<((p_shift_date+rule_row.end_time) at time zone 'Asia/Kolkata') and a.status<>'cancelled'),now()
  ) on conflict (organization_id,availability_rule_id,shift_date) do nothing
  returning * into dispatch_row;
  if dispatch_row.id is null then
    select * into dispatch_row from public.doctor_queue_dispatches
      where organization_id=p_organization_id and availability_rule_id=p_availability_rule_id and shift_date=p_shift_date;
  end if;
  return jsonb_build_object('id',dispatch_row.id,'status',dispatch_row.status,'duplicate_prevented',dispatch_row.created_at < now()-interval '1 second');
end;
$$;


ALTER FUNCTION "public"."schedule_doctor_queue_notification"("p_organization_id" "uuid", "p_availability_rule_id" "uuid", "p_shift_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_active_medicines"("p_query" "text", "p_limit" integer DEFAULT 12) RETURNS TABLE("id" bigint, "source_identifier" "text", "entry_type" "text", "display_name" "text", "generic_name" "text", "supplier_name" "text", "dose_form_name" "text", "route_names" "text"[])
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_query text := lower(regexp_replace(trim(coalesce(p_query, '')), '\s+', ' ', 'g'));
  v_limit integer := least(greatest(coalesce(p_limit, 12), 1), 20);
  v_prefix_count integer := 0;
begin
  if char_length(v_query) < 2 then
    return;
  end if;

  return query
  select
    entry.id,
    entry.source_identifier,
    entry.entry_type,
    entry.display_name,
    entry.generic_name,
    entry.supplier_name,
    entry.dose_form_name,
    entry.route_names
  from public.medicine_catalog_entries entry
  join public.medicine_catalog_releases release on release.id = entry.release_id
  where entry.status = 'active'
    and release.status = 'active'
    and (
      lower(entry.display_name) like v_query || '%'
      or lower(entry.generic_name) like v_query || '%'
    )
  order by
    case
      when lower(entry.display_name) = v_query then 0
      when lower(entry.display_name) like v_query || '%' then 1
      else 2
    end,
    case when entry.entry_type = 'brand' then 0 else 1 end,
    length(entry.display_name),
    entry.display_name
  limit v_limit;

  get diagnostics v_prefix_count = row_count;

  if v_prefix_count < v_limit and char_length(v_query) >= 3 then
    return query
    select
      entry.id,
      entry.source_identifier,
      entry.entry_type,
      entry.display_name,
      entry.generic_name,
      entry.supplier_name,
      entry.dose_form_name,
      entry.route_names
    from public.medicine_catalog_entries entry
    join public.medicine_catalog_releases release on release.id = entry.release_id
    where entry.status = 'active'
      and release.status = 'active'
      and entry.search_text ilike '%' || replace(replace(v_query, '%', '\%'), '_', '\_') || '%' escape '\'
      and lower(entry.display_name) not like v_query || '%'
      and coalesce(lower(entry.generic_name), '') not like v_query || '%'
    order by similarity(entry.search_text, v_query) desc, entry.display_name
    limit (v_limit - v_prefix_count);
  end if;
end;
$$;


ALTER FUNCTION "public"."search_active_medicines"("p_query" "text", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_appointment_follow_up"("p_organization_id" "uuid", "p_appointment_id" "uuid", "p_follow_up_at" timestamp with time zone, "p_note" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  appointment_row public.appointments%rowtype;
  reminder_channel text;
  reminder_recipient text;
begin
  if not private.is_organization_member(p_organization_id, 'admin') then raise exception 'Administrator access required'; end if;
  if p_follow_up_at is not null and p_follow_up_at <= now() then raise exception 'Follow-up must be scheduled in the future'; end if;
  update public.appointments set follow_up_at=p_follow_up_at,follow_up_note=nullif(trim(coalesce(p_note,'')),''),updated_at=now()
  where id=p_appointment_id and organization_id=p_organization_id returning * into appointment_row;
  if appointment_row.id is null then raise exception 'Appointment not found'; end if;
  if appointment_row.status='confirmed' then
    perform public.update_appointment_status(p_organization_id,p_appointment_id,'arrived');
    select * into appointment_row from public.appointments where id=p_appointment_id and organization_id=p_organization_id;
  end if;
  update public.reminder_events set status='cancelled',updated_at=now() where appointment_id=p_appointment_id and event_type='follow_up' and status='scheduled';
  if p_follow_up_at is not null and appointment_row.care_communications_consent then
    reminder_channel:=case when nullif(trim(coalesce(appointment_row.customer_phone,'')),'') is not null then 'whatsapp' else 'email' end;
    reminder_recipient:=coalesce(nullif(trim(coalesce(appointment_row.customer_phone,'')),''),nullif(trim(coalesce(appointment_row.customer_email,'')),''));
    if reminder_recipient is not null then
      insert into public.reminder_events(organization_id,appointment_id,event_type,scheduled_for,channel,recipient,status,provider_response)
      values(p_organization_id,p_appointment_id,'follow_up',p_follow_up_at,reminder_channel,reminder_recipient,'scheduled',jsonb_build_object('note',nullif(trim(coalesce(p_note,'')),'')))
      on conflict(appointment_id,event_type,channel) do update set scheduled_for=excluded.scheduled_for,recipient=excluded.recipient,status='scheduled',attempts=0,provider_response=excluded.provider_response,updated_at=now();
    end if;
  end if;
  insert into public.appointment_events(organization_id,appointment_id,event_type,actor_type,actor_id,details)
  values(p_organization_id,p_appointment_id,'follow_up_changed','staff',auth.uid(),jsonb_build_object('follow_up_at',p_follow_up_at,'note',nullif(trim(coalesce(p_note,'')),'')));
end;
$$;


ALTER FUNCTION "public"."set_appointment_follow_up"("p_organization_id" "uuid", "p_appointment_id" "uuid", "p_follow_up_at" timestamp with time zone, "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_doctor_queue_consent"("p_organization_id" "uuid", "p_resource_id" "uuid", "p_enabled" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  actor_id uuid := auth.uid();
  profile_row public.provider_profiles%rowtype;
  normalized_phone text;
  notice_version constant text := 'doctor_queue_v1';
  notice_text constant text := 'The doctor agreed to receive operational shift and booking-count notifications on the listed WhatsApp number. Messages exclude patient names and clinical information. Consent can be withdrawn at any time.';
begin
  if actor_id is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  if not private.is_organization_member(p_organization_id, 'admin') then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  select * into profile_row
  from public.provider_profiles
  where organization_id = p_organization_id and resource_id = p_resource_id
  for update;
  if not found then raise exception 'Doctor profile not found' using errcode = 'P0002'; end if;

  normalized_phone := private.normalize_phone_identity(profile_row.contact_phone);
  if p_enabled and normalized_phone is null then
    raise exception 'A valid doctor WhatsApp number is required';
  end if;

  update public.provider_profiles
  set queue_notifications_enabled = p_enabled,
      whatsapp_queue_consent_at = case when p_enabled then now() else null end,
      whatsapp_queue_consent_notice_version = case when p_enabled then notice_version else null end,
      whatsapp_queue_consent_recorded_by = actor_id,
      updated_at = now()
  where organization_id = p_organization_id and resource_id = p_resource_id;

  insert into public.doctor_queue_consent_events (
    organization_id, resource_id, action, notice_version, notice_text,
    channel, phone_identity, recorded_by
  ) values (
    p_organization_id, p_resource_id,
    case when p_enabled then 'enabled' else 'withdrawn' end,
    notice_version, notice_text, 'whatsapp', normalized_phone, actor_id
  );

  return jsonb_build_object(
    'resource_id', p_resource_id,
    'enabled', p_enabled,
    'consent_recorded_at', case when p_enabled then now() else null end,
    'notice_version', notice_version
  );
end;
$$;


ALTER FUNCTION "public"."set_doctor_queue_consent"("p_organization_id" "uuid", "p_resource_id" "uuid", "p_enabled" boolean) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."patient_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "phone" "text",
    "email" "text",
    "age" smallint,
    "health_concern" "text",
    "locality" "text",
    "pincode" "text",
    "patient_summary" "text",
    "care_communications_consent" boolean DEFAULT true NOT NULL,
    "marketing_consent" boolean DEFAULT false NOT NULL,
    "source" "text" DEFAULT 'appointment'::"text" NOT NULL,
    "first_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "date_of_birth" "date",
    "primary_contact_phone" "text",
    "identity_status" "text" DEFAULT 'unverified'::"text" NOT NULL,
    "avatar_storage_path" "text",
    "avatar_updated_at" timestamp with time zone,
    "normalized_phone" "text" GENERATED ALWAYS AS ("private"."normalize_phone_identity"("phone")) STORED,
    CONSTRAINT "patient_profiles_age_check" CHECK ((("age" >= 0) AND ("age" <= 120))),
    CONSTRAINT "patient_profiles_contact_check" CHECK ((("phone" IS NOT NULL) OR ("email" IS NOT NULL) OR ("primary_contact_phone" IS NOT NULL))),
    CONSTRAINT "patient_profiles_identity_status_check" CHECK (("identity_status" = ANY (ARRAY['unverified'::"text", 'verified'::"text", 'staff_verified'::"text"]))),
    CONSTRAINT "patient_profiles_pincode_check" CHECK ((("pincode" IS NULL) OR ("pincode" ~ '^[0-9]{6}$'::"text")))
);


ALTER TABLE "public"."patient_profiles" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_patient_consents"("p_patient_id" "uuid", "p_care_communications" boolean, "p_marketing" boolean, "p_source" "text" DEFAULT 'staff_profile'::"text", "p_note" "text" DEFAULT NULL::"text") RETURNS "public"."patient_profiles"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  updated_patient public.patient_profiles;
begin
  perform set_config(
    'omnirelay.consent_source',
    coalesce(nullif(trim(p_source), ''), 'staff_profile'),
    true
  );
  perform set_config('omnirelay.consent_note', coalesce(p_note, ''), true);

  update public.patient_profiles
  set
    care_communications_consent = p_care_communications,
    marketing_consent = p_marketing
  where id = p_patient_id
  returning * into updated_patient;

  if updated_patient.id is null then
    raise exception 'Patient not found or access denied';
  end if;

  return updated_patient;
end;
$$;


ALTER FUNCTION "public"."set_patient_consents"("p_patient_id" "uuid", "p_care_communications" boolean, "p_marketing" boolean, "p_source" "text", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_queue_now_serving"("p_organization_id" "uuid", "p_resource_id" "uuid", "p_location_id" "uuid", "p_queue_date" "date", "p_token_number" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare target public.appointment_queue_entries%rowtype;
begin
  if not private.is_organization_member(p_organization_id,'admin') then raise exception 'Administrator access required'; end if;
  select * into target from public.appointment_queue_entries where organization_id=p_organization_id and resource_id=p_resource_id and location_id=p_location_id and queue_date=p_queue_date and token_number=p_token_number for update;
  if target.id is null then raise exception 'Queue token not found'; end if;
  update public.appointment_queue_entries set queue_status='waiting',updated_at=now() where organization_id=p_organization_id and resource_id=p_resource_id and location_id=p_location_id and queue_date=p_queue_date and queue_status='called';
  update public.appointment_queue_entries set queue_status='called',updated_at=now() where id=target.id;
  return jsonb_build_object('token_number',target.token_number,'queue_status','called','whatsapp_delivery','disabled_until_patient_queue_template_is_approved');
end; $$;


ALTER FUNCTION "public"."set_queue_now_serving"("p_organization_id" "uuid", "p_resource_id" "uuid", "p_location_id" "uuid", "p_queue_date" "date", "p_token_number" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."track_conversation_usage"("p_organization_id" "uuid", "p_contact_address" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    active_window_exists BOOLEAN;
    current_quota INT;
    current_used INT;
    quota_status TEXT := 'ok';
BEGIN
    -- Check if active 24-hour window exists for this contact
    SELECT EXISTS (
        SELECT 1 FROM public.usage_metering
        WHERE organization_id = p_organization_id
          AND contact_address = p_contact_address
          AND conversation_window_end > NOW()
    ) INTO active_window_exists;

    IF NOT active_window_exists THEN
        -- Get plan quota
        SELECT conversations_quota INTO current_quota
        FROM public.entitlements
        WHERE organization_id = p_organization_id;

        -- Count conversations opened this month
        SELECT COUNT(*) INTO current_used
        FROM public.usage_metering
        WHERE organization_id = p_organization_id
          AND conversation_window_start >= date_trunc('month', NOW());

        IF current_used >= COALESCE(current_quota, 1000) THEN
            quota_status := 'over_quota';
        ELSE
            -- Open new 24h conversation window
            INSERT INTO public.usage_metering (organization_id, contact_address, conversation_window_start, conversation_window_end)
            VALUES (p_organization_id, p_contact_address, NOW(), NOW() + INTERVAL '24 hours');
            current_used := current_used + 1;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'status', quota_status,
        'window_active', active_window_exists,
        'used', current_used,
        'quota', current_quota
    );
END;
$$;


ALTER FUNCTION "public"."track_conversation_usage"("p_organization_id" "uuid", "p_contact_address" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_appointment_status"("p_organization_id" "uuid", "p_appointment_id" "uuid", "p_status" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare a public.appointments%rowtype; old_status text; reminder_channel text; reminder_recipient text;
begin
  if not private.is_organization_member(p_organization_id,'admin') then raise exception 'Administrator access required'; end if;
  select * into a from public.appointments where id=p_appointment_id and organization_id=p_organization_id for update;
  if a.id is null then raise exception 'Appointment not found'; end if;
  old_status:=a.status;
  if not ((old_status='pending' and p_status in('confirmed','cancelled')) or (old_status='confirmed' and p_status in('arrived','completed','cancelled','no_show','rescheduling_required')) or (old_status='arrived' and p_status in('in_consultation','completed','cancelled')) or (old_status='in_consultation' and p_status in('completed','cancelled')) or (old_status='rescheduling_required' and p_status in('confirmed','cancelled')) or old_status=p_status) then raise exception 'Invalid appointment transition from % to %',old_status,p_status; end if;
  update public.appointments set status=p_status,updated_at=now() where id=p_appointment_id;
  insert into public.appointment_events(organization_id,appointment_id,event_type,actor_type,actor_id,details) values(p_organization_id,p_appointment_id,'status_changed','staff',auth.uid(),jsonb_build_object('from',old_status,'to',p_status));
  if p_status in('cancelled','completed','no_show','rescheduling_required') then update public.reminder_events set status='cancelled',updated_at=now() where appointment_id=p_appointment_id and status='scheduled'; end if;
  if p_status='cancelled' and a.care_communications_consent then
    reminder_channel:=case when nullif(trim(coalesce(a.customer_phone,'')),'') is not null then 'whatsapp' else 'email' end;reminder_recipient:=coalesce(nullif(trim(coalesce(a.customer_phone,'')),''),nullif(trim(coalesce(a.customer_email,'')),''));
    if reminder_recipient is not null then insert into public.reminder_events(organization_id,appointment_id,event_type,scheduled_for,channel,recipient,status,provider_response) values(p_organization_id,p_appointment_id,'cancellation',now(),reminder_channel,reminder_recipient,'scheduled',jsonb_build_object('purpose','manual_cancellation')) on conflict(appointment_id,event_type,channel) do update set scheduled_for=excluded.scheduled_for,recipient=excluded.recipient,status='scheduled',attempts=0,provider_response=excluded.provider_response,updated_at=now(); end if;
  end if;
end; $$;


ALTER FUNCTION "public"."update_appointment_status"("p_organization_id" "uuid", "p_appointment_id" "uuid", "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_booking_phone_otp"("p_challenge_id" "uuid", "p_code" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
end;$$;


ALTER FUNCTION "public"."verify_booking_phone_otp"("p_challenge_id" "uuid", "p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."write_shadow_audit_record"("p_record" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into private.shadow_audit_records (run_id,test_set_version,question_id,tenant_id,provider,model_name,latency_ms,finish_reason,word_count,passed_safety,passed_content,passed_assertion,passed_gate,expected_handoff,source_ids,prompt_tokens,completion_tokens,thoughts_tokens,total_tokens,output_hash)
  values ((p_record->>'run_id')::uuid,p_record->>'test_set_version',p_record->>'question_id',(p_record->>'tenant_id')::uuid,(p_record->>'provider')::private.shadow_provider,p_record->>'model_name',(p_record->>'latency_ms')::integer,(p_record->>'finish_reason')::private.shadow_finish_reason,(p_record->>'word_count')::integer,(p_record->>'passed_safety')::boolean,(p_record->>'passed_content')::boolean,(p_record->>'passed_assertion')::boolean,(p_record->>'passed_gate')::boolean,(p_record->>'expected_handoff')::boolean,coalesce(array(select jsonb_array_elements_text(p_record->'source_ids'))::uuid[],'{}'),nullif(p_record->>'prompt_tokens','')::integer,nullif(p_record->>'completion_tokens','')::integer,nullif(p_record->>'thoughts_tokens','')::integer,nullif(p_record->>'total_tokens','')::integer,p_record->>'output_hash');
end $$;


ALTER FUNCTION "public"."write_shadow_audit_record"("p_record" "jsonb") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "billing"."accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "billing"."accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "billing"."costs" (
    "provider" "text" NOT NULL,
    "product" "text" NOT NULL,
    "effective_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "quantity" numeric NOT NULL,
    "unit" "text" NOT NULL,
    "pricing" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "billing"."costs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "billing"."invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "period_start" timestamp with time zone,
    "period_end" timestamp with time zone,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "subtotal" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "invoices_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'issued'::"text", 'paid'::"text", 'void'::"text"])))
);


ALTER TABLE "billing"."invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "billing"."invoices_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "plan_id" "text",
    "product_id" "text",
    "ledger_id" "uuid",
    "quantity" numeric NOT NULL,
    "unit_price" numeric NOT NULL,
    "amount" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "invoices_items_type_check" CHECK (("type" = ANY (ARRAY['plan'::"text", 'credit'::"text", 'overage'::"text"])))
);


ALTER TABLE "billing"."invoices_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "billing"."ledger" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "product_id" "text" NOT NULL,
    "type" "text" NOT NULL,
    "quantity" numeric NOT NULL,
    "agent_id" "uuid",
    "message_id" "uuid",
    "provider" "text",
    "model" "text",
    "metadata" "jsonb",
    "billable" boolean,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ledger_type_check" CHECK (("type" = ANY (ARRAY['grant'::"text", 'consumption'::"text", 'topup'::"text"])))
);


ALTER TABLE "billing"."ledger" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "billing"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "account_id" "uuid",
    "amount" numeric NOT NULL,
    "method" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "external_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'succeeded'::"text", 'failed'::"text", 'refunded'::"text"])))
);


ALTER TABLE "billing"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "billing"."plans" (
    "id" "text" NOT NULL,
    "min_tier" integer NOT NULL,
    "price" numeric NOT NULL,
    "billing_cycle" "text",
    "is_default" boolean DEFAULT false NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "plans_billing_cycle_check" CHECK (("billing_cycle" = ANY (ARRAY['month'::"text", 'year'::"text"])))
);


ALTER TABLE "billing"."plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "billing"."plans_products" (
    "plan_id" "text" NOT NULL,
    "product_id" "text" NOT NULL,
    "interval" "text" NOT NULL,
    "included" numeric,
    "unit_price" numeric,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "plans_products_interval_check" CHECK (("interval" = ANY (ARRAY['month'::"text", 'lifetime'::"text"])))
);


ALTER TABLE "billing"."plans_products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "billing"."products" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "unit" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "products_kind_check" CHECK (("kind" = ANY (ARRAY['counter'::"text", 'gauge'::"text", 'balance'::"text"]))),
    CONSTRAINT "products_unit_check" CHECK (("unit" = ANY (ARRAY['count'::"text", 'gb'::"text", 'usd'::"text"])))
);


ALTER TABLE "billing"."products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "billing"."subscriptions" (
    "organization_id" "uuid" NOT NULL,
    "tier_id" "text" NOT NULL,
    "plan_id" "text",
    "account_id" "uuid",
    "current_period_start" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "razorpay_subscription_id" "text",
    "razorpay_customer_id" "text",
    "razorpay_plan_id" "text",
    "cancel_at_period_end" boolean DEFAULT false
);


ALTER TABLE "billing"."subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "billing"."tiers" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "level" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "billing"."tiers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "billing"."tiers_products" (
    "tier_id" "text" NOT NULL,
    "product_id" "text" NOT NULL,
    "interval" "text" NOT NULL,
    "cap" numeric,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tiers_products_interval_check" CHECK (("interval" = ANY (ARRAY['month'::"text", 'lifetime'::"text"])))
);


ALTER TABLE "billing"."tiers_products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "billing"."usage" (
    "organization_id" "uuid" NOT NULL,
    "product_id" "text" NOT NULL,
    "interval" "text" DEFAULT 'lifetime'::"text" NOT NULL,
    "period" "date" DEFAULT '1970-01-01'::"date" NOT NULL,
    "quantity" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "usage_interval_check" CHECK (("interval" = ANY (ARRAY['day'::"text", 'month'::"text", 'lifetime'::"text"])))
);


ALTER TABLE "billing"."usage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."ai_provider_state" (
    "provider_config_key" "text" NOT NULL,
    "state" "text" DEFAULT 'closed'::"text" NOT NULL,
    "failure_count" integer DEFAULT 0 NOT NULL,
    "last_failure_at" timestamp with time zone,
    "open_until" timestamp with time zone,
    "half_open_probe_in_flight" boolean DEFAULT false NOT NULL,
    "window_started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "window_request_count" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_provider_state_failure_count_check" CHECK (("failure_count" >= 0)),
    CONSTRAINT "ai_provider_state_state_check" CHECK (("state" = ANY (ARRAY['closed'::"text", 'open'::"text", 'half_open'::"text"]))),
    CONSTRAINT "ai_provider_state_window_request_count_check" CHECK (("window_request_count" >= 0))
);


ALTER TABLE "private"."ai_provider_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."api_rate_limits" (
    "actor_user_id" "uuid" NOT NULL,
    "bucket" "text" NOT NULL,
    "window_started_at" timestamp with time zone NOT NULL,
    "hit_count" integer DEFAULT 1 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "api_rate_limits_hit_count_check" CHECK (("hit_count" > 0))
);


ALTER TABLE "private"."api_rate_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."booking_phone_otp_challenges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "phone_hash" "bytea" NOT NULL,
    "code_hash" "bytea" NOT NULL,
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "verified_at" timestamp with time zone,
    "verification_token_hash" "bytea",
    "verification_expires_at" timestamp with time zone,
    "consumed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "booking_phone_otp_challenges_attempt_count_check" CHECK ((("attempt_count" >= 0) AND ("attempt_count" <= 5)))
);


ALTER TABLE "private"."booking_phone_otp_challenges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."customer_booking_access" (
    "appointment_id" "uuid" NOT NULL,
    "booking_reference" "text" NOT NULL,
    "token_hash" "bytea" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "private"."customer_booking_access" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."oem_audit_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_user_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "oem_audit_events_event_type_check" CHECK (("event_type" = 'tenant_health_viewed'::"text"))
);


ALTER TABLE "private"."oem_audit_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."patient_portal_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "conversation_id" "uuid",
    "token_hash" "bytea" NOT NULL,
    "scope" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "last_accessed_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "consumed_at" timestamp with time zone,
    "access_token_hash" "bytea",
    CONSTRAINT "patient_portal_sessions_scope_check" CHECK (("scope" = ANY (ARRAY['bookings'::"text", 'records'::"text", 'all'::"text"])))
);


ALTER TABLE "private"."patient_portal_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."platform_operators" (
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'oem_admin'::"text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "granted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "granted_by" "uuid",
    "notes" "text",
    CONSTRAINT "platform_operators_role_check" CHECK (("role" = ANY (ARRAY['oem_admin'::"text", 'oem_support'::"text", 'oem_billing'::"text"])))
);


ALTER TABLE "private"."platform_operators" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "private"."saas_invoice_number_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "private"."saas_invoice_number_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."shadow_audit_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "run_id" "uuid" NOT NULL,
    "test_set_version" "text" NOT NULL,
    "question_id" "text" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "provider" "private"."shadow_provider" NOT NULL,
    "model_name" "text" NOT NULL,
    "latency_ms" integer NOT NULL,
    "finish_reason" "private"."shadow_finish_reason" NOT NULL,
    "word_count" integer NOT NULL,
    "passed_safety" boolean NOT NULL,
    "passed_content" boolean NOT NULL,
    "passed_assertion" boolean NOT NULL,
    "passed_gate" boolean NOT NULL,
    "expected_handoff" boolean NOT NULL,
    "source_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "prompt_tokens" integer,
    "completion_tokens" integer,
    "thoughts_tokens" integer,
    "total_tokens" integer,
    "output_hash" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "shadow_audit_records_completion_tokens_check" CHECK ((("completion_tokens" IS NULL) OR ("completion_tokens" >= 0))),
    CONSTRAINT "shadow_audit_records_latency_ms_check" CHECK (("latency_ms" >= 0)),
    CONSTRAINT "shadow_audit_records_output_hash_check" CHECK (("output_hash" ~ '^[a-f0-9]{64}$'::"text")),
    CONSTRAINT "shadow_audit_records_prompt_tokens_check" CHECK ((("prompt_tokens" IS NULL) OR ("prompt_tokens" >= 0))),
    CONSTRAINT "shadow_audit_records_thoughts_tokens_check" CHECK ((("thoughts_tokens" IS NULL) OR ("thoughts_tokens" >= 0))),
    CONSTRAINT "shadow_audit_records_total_tokens_check" CHECK ((("total_tokens" IS NULL) OR ("total_tokens" >= 0))),
    CONSTRAINT "shadow_audit_records_word_count_check" CHECK ((("word_count" >= 0) AND ("word_count" <= 1000)))
);


ALTER TABLE "private"."shadow_audit_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."shadow_evaluation_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "test_set_version" "text" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "provider" "private"."shadow_provider" NOT NULL,
    "model_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "private"."shadow_evaluation_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."whatsapp_booking_handoffs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "session_id" "uuid" NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "source_message_id" "uuid" NOT NULL,
    "consent_evidence_id" "uuid" NOT NULL,
    "token_hash" "bytea" NOT NULL,
    "service_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "patient_name" "text" NOT NULL,
    "booking_contact_name" "text" NOT NULL,
    "booking_contact_phone" "text" NOT NULL,
    "patient_relationship" "text" NOT NULL,
    "appointment_id" "uuid",
    "expires_at" timestamp with time zone NOT NULL,
    "consumed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "whatsapp_booking_handoffs_patient_relationship_check" CHECK (("patient_relationship" = ANY (ARRAY['self'::"text", 'child'::"text", 'parent'::"text", 'spouse'::"text", 'relative'::"text", 'other'::"text"])))
);


ALTER TABLE "private"."whatsapp_booking_handoffs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."action_centre_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "item_kind" "text" NOT NULL,
    "subject_id" "uuid" NOT NULL,
    "assigned_to" "uuid",
    "status" "text" DEFAULT 'claimed'::"text" NOT NULL,
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "action_centre_assignments_item_kind_check" CHECK (("item_kind" = ANY (ARRAY['booking_approval'::"text", 'waitlist'::"text", 'schedule_disruption'::"text", 'care_retry'::"text", 'appointment_retry'::"text", 'care_task'::"text"]))),
    CONSTRAINT "action_centre_assignments_status_check" CHECK (("status" = ANY (ARRAY['claimed'::"text", 'reviewed'::"text", 'released'::"text"])))
);


ALTER TABLE "public"."action_centre_assignments" OWNER TO "postgres";


COMMENT ON TABLE "public"."action_centre_assignments" IS 'Coordination-only ownership for heterogeneous clinic exceptions; never mutates the underlying clinical or booking record.';



CREATE TABLE IF NOT EXISTS "public"."action_centre_deployments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "actor_user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'deployed'::"text" NOT NULL,
    "deployed_count" integer DEFAULT 0 NOT NULL,
    "automatic_count" integer DEFAULT 0 NOT NULL,
    "exception_count" integer DEFAULT 0 NOT NULL,
    "snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "action_centre_deployments_automatic_count_check" CHECK (("automatic_count" >= 0)),
    CONSTRAINT "action_centre_deployments_deployed_count_check" CHECK (("deployed_count" >= 0)),
    CONSTRAINT "action_centre_deployments_exception_count_check" CHECK (("exception_count" >= 0)),
    CONSTRAINT "action_centre_deployments_status_check" CHECK (("status" = ANY (ARRAY['deployed'::"text", 'partial'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."action_centre_deployments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agents" (
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "picture" "text",
    "ai" boolean NOT NULL,
    "extra" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."agents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_agent_channel_bindings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "agent_role" "text" DEFAULT 'sales_rag'::"text" NOT NULL,
    "service" "text" DEFAULT 'whatsapp'::"text" NOT NULL,
    "organization_address" "text" NOT NULL,
    "delivery_mode" "text" DEFAULT 'shadow'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_agent_channel_bindings_delivery_mode_check" CHECK (("delivery_mode" = ANY (ARRAY['shadow'::"text", 'live'::"text", 'paused'::"text"]))),
    CONSTRAINT "ai_agent_channel_bindings_service_check" CHECK (("service" = 'whatsapp'::"text"))
);


ALTER TABLE "public"."ai_agent_channel_bindings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_agent_conversation_state" (
    "organization_id" "uuid" NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "agent_role" "text" NOT NULL,
    "stage" "text" DEFAULT 'discovery'::"text" NOT NULL,
    "last_prompt" "text",
    "opted_out_at" timestamp with time zone,
    "last_inbound_message_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_agent_conversation_state_stage_check" CHECK (("stage" = ANY (ARRAY['discovery'::"text", 'qualification'::"text", 'handoff'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."ai_agent_conversation_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_agent_dispatches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "binding_id" "uuid" NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "message_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "classification" "text" DEFAULT 'pending'::"text" NOT NULL,
    "source_document_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "response_message_id" "uuid",
    "failure_reason" "text",
    "processed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "shadow_response_text" "text",
    "model_status" "text",
    CONSTRAINT "ai_agent_dispatches_shadow_response_text_length" CHECK ((("shadow_response_text" IS NULL) OR ("char_length"("shadow_response_text") <= 900))),
    CONSTRAINT "ai_agent_dispatches_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processed'::"text", 'failed'::"text", 'shadowed'::"text"])))
);


ALTER TABLE "public"."ai_agent_dispatches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_agent_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "role" "text" DEFAULT 'booking_concierge'::"text" NOT NULL,
    "status" "text" DEFAULT 'training'::"text" NOT NULL,
    "instructions" "text" DEFAULT 'Answer only from approved workspace knowledge. Never diagnose, prescribe, or invent prices, availability, policies, or medical advice.'::"text" NOT NULL,
    "handoff_message" "text" DEFAULT 'I will connect you with the clinic team for this question.'::"text" NOT NULL,
    "channels" "text"[] DEFAULT ARRAY['web'::"text"] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_agent_profiles_status_check" CHECK (("status" = ANY (ARRAY['training'::"text", 'ready'::"text", 'paused'::"text", 'live'::"text"])))
);


ALTER TABLE "public"."ai_agent_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."api_keys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text" NOT NULL,
    "role" "public"."role" DEFAULT 'member'::"public"."role" NOT NULL
);


ALTER TABLE "public"."api_keys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "recipient_user_id" "uuid" NOT NULL,
    "notification_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "href" "text",
    "entity_type" "text",
    "entity_id" "uuid",
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "escalation_level" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "app_notifications_escalation_level_check" CHECK ((("escalation_level" >= 0) AND ("escalation_level" <= 3))),
    CONSTRAINT "app_notifications_notification_type_check" CHECK (("notification_type" = ANY (ARRAY['task_assigned'::"text", 'task_updated'::"text", 'team_invitation'::"text", 'system'::"text", 'serious_action'::"text"]))),
    CONSTRAINT "app_notifications_priority_check" CHECK (("priority" = ANY (ARRAY['normal'::"text", 'high'::"text", 'critical'::"text"]))),
    CONSTRAINT "app_notifications_title_check" CHECK ((("char_length"(TRIM(BOTH FROM "title")) >= 2) AND ("char_length"(TRIM(BOTH FROM "title")) <= 160)))
);


ALTER TABLE "public"."app_notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."appointment_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "appointment_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "actor_type" "text" NOT NULL,
    "actor_id" "uuid",
    "details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "appointment_events_actor_type_check" CHECK (("actor_type" = ANY (ARRAY['customer'::"text", 'patient_portal'::"text", 'staff'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."appointment_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."appointment_queue_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "appointment_id" "uuid" NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "queue_date" "date" NOT NULL,
    "token_number" integer NOT NULL,
    "queue_status" "text" DEFAULT 'waiting'::"text" NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "appointment_queue_entries_queue_status_check" CHECK (("queue_status" = ANY (ARRAY['waiting'::"text", 'called'::"text", 'served'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "appointment_queue_entries_token_number_check" CHECK ((("token_number" >= 1) AND ("token_number" <= 9999)))
);


ALTER TABLE "public"."appointment_queue_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."appointment_waitlist" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "booking_request_id" "uuid",
    "patient_id" "uuid",
    "patient_name" "text" NOT NULL,
    "patient_phone" "text" NOT NULL,
    "service_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "resource_id" "uuid",
    "preferred_date" "date",
    "preferred_starts_at" timestamp with time zone,
    "status" "text" DEFAULT 'waiting'::"text" NOT NULL,
    "priority" smallint DEFAULT 100 NOT NULL,
    "offer_expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "appointment_waitlist_status_check" CHECK (("status" = ANY (ARRAY['waiting'::"text", 'offered'::"text", 'booked'::"text", 'expired'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."appointment_waitlist" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."appointments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "service_id" "uuid" NOT NULL,
    "customer_name" "text" NOT NULL,
    "customer_phone" "text",
    "customer_email" "text",
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'confirmed'::"text" NOT NULL,
    "source" "text" DEFAULT 'dashboard'::"text" NOT NULL,
    "notes" "text",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "hold_expires_at" timestamp with time zone,
    "payment_status" "text" DEFAULT 'not_required'::"text" NOT NULL,
    "patient_id" "uuid",
    "patient_age" smallint,
    "health_concern" "text",
    "patient_locality" "text",
    "patient_pincode" "text",
    "patient_summary" "text",
    "care_communications_consent" boolean DEFAULT true NOT NULL,
    "marketing_consent" boolean DEFAULT false NOT NULL,
    "follow_up_at" timestamp with time zone,
    "follow_up_note" "text",
    "booking_contact_name" "text",
    "booking_contact_phone" "text",
    "patient_relationship" "text" DEFAULT 'self'::"text" NOT NULL,
    "patient_date_of_birth" "date",
    "booking_phone_verified_at" timestamp with time zone,
    "booking_phone_verification_id" "uuid",
    "booking_consent_evidence_id" "uuid",
    CONSTRAINT "appointments_check" CHECK (("ends_at" > "starts_at")),
    CONSTRAINT "appointments_patient_age_check" CHECK ((("patient_age" >= 0) AND ("patient_age" <= 120))),
    CONSTRAINT "appointments_patient_pincode_check" CHECK ((("patient_pincode" IS NULL) OR ("patient_pincode" ~ '^[0-9]{6}$'::"text"))),
    CONSTRAINT "appointments_patient_relationship_check" CHECK (("patient_relationship" = ANY (ARRAY['self'::"text", 'child'::"text", 'parent'::"text", 'spouse'::"text", 'relative'::"text", 'other'::"text"]))),
    CONSTRAINT "appointments_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['not_required'::"text", 'pending'::"text", 'paid'::"text", 'failed'::"text", 'refunded'::"text", 'partial_refund'::"text"]))),
    CONSTRAINT "appointments_source_check" CHECK (("source" = ANY (ARRAY['dashboard'::"text", 'whatsapp'::"text", 'instagram'::"text", 'web'::"text", 'import'::"text"]))),
    CONSTRAINT "appointments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'payment_pending'::"text", 'confirmed'::"text", 'arrived'::"text", 'in_consultation'::"text", 'completed'::"text", 'cancelled'::"text", 'no_show'::"text", 'rescheduling_required'::"text"])))
);


ALTER TABLE "public"."appointments" OWNER TO "postgres";


COMMENT ON COLUMN "public"."appointments"."created_by" IS 'Authenticated staff user who created the appointment; null for verified public customer self-bookings.';



CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "actor_id" "uuid",
    "action" "text" NOT NULL,
    "details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."automation_recovery_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "actor_user_id" "uuid" NOT NULL,
    "job_kind" "text" NOT NULL,
    "job_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "previous_status" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "automation_recovery_events_action_check" CHECK (("action" = 'manual_retry'::"text")),
    CONSTRAINT "automation_recovery_events_job_kind_check" CHECK (("job_kind" = ANY (ARRAY['appointment_reminder'::"text", 'care_reminder'::"text"]))),
    CONSTRAINT "automation_recovery_events_reason_check" CHECK ((("char_length"(TRIM(BOTH FROM "reason")) >= 3) AND ("char_length"(TRIM(BOTH FROM "reason")) <= 240)))
);


ALTER TABLE "public"."automation_recovery_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."availability_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "weekday" smallint NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "slot_interval_minutes" integer DEFAULT 15 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "effective_from" "date",
    "effective_to" "date",
    CONSTRAINT "availability_effective_window" CHECK ((("effective_to" IS NULL) OR ("effective_from" IS NULL) OR ("effective_to" >= "effective_from"))),
    CONSTRAINT "availability_rules_check" CHECK (("end_time" > "start_time")),
    CONSTRAINT "availability_rules_slot_interval_minutes_check" CHECK ((("slot_interval_minutes" >= 5) AND ("slot_interval_minutes" <= 240))),
    CONSTRAINT "availability_rules_weekday_check" CHECK ((("weekday" >= 0) AND ("weekday" <= 6)))
);


ALTER TABLE "public"."availability_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."billing_notice_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "notice_type" "text" NOT NULL,
    "channel" "text" DEFAULT 'in_app'::"text" NOT NULL,
    "recipient" "text",
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "scheduled_for" timestamp with time zone NOT NULL,
    "sent_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "billing_notice_events_channel_check" CHECK (("channel" = ANY (ARRAY['in_app'::"text", 'email'::"text", 'whatsapp'::"text"]))),
    CONSTRAINT "billing_notice_events_notice_type_check" CHECK (("notice_type" = ANY (ARRAY['trial_3_days'::"text", 'trial_1_day'::"text", 'trial_expired'::"text", 'renewal_due'::"text", 'payment_failed'::"text"]))),
    CONSTRAINT "billing_notice_events_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'sent'::"text", 'failed'::"text", 'dismissed'::"text"])))
);


ALTER TABLE "public"."billing_notice_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."billing_webhook_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" DEFAULT 'razorpay'::"text" NOT NULL,
    "provider_event_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "provider_order_id" "text",
    "provider_payment_id" "text",
    "payload_digest" "text" NOT NULL,
    "status" "text" DEFAULT 'received'::"text" NOT NULL,
    "failure_reason" "text",
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    CONSTRAINT "billing_webhook_events_status_check" CHECK (("status" = ANY (ARRAY['received'::"text", 'processed'::"text", 'ignored'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."billing_webhook_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."booking_pages" (
    "organization_id" "uuid" NOT NULL,
    "slug" "text" NOT NULL,
    "headline" "text" DEFAULT 'Book an appointment'::"text" NOT NULL,
    "description" "text",
    "accent_color" "text" DEFAULT '#1688d5'::"text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "booking_pages_slug_check" CHECK ((("slug" = "lower"("slug")) AND ("slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::"text")))
);


ALTER TABLE "public"."booking_pages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."booking_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "appointment_id" "uuid" NOT NULL,
    "provider" "text" DEFAULT 'razorpay'::"text" NOT NULL,
    "payment_mode" "text" NOT NULL,
    "amount_paise" integer NOT NULL,
    "currency" "text" DEFAULT 'INR'::"text" NOT NULL,
    "status" "text" DEFAULT 'created'::"text" NOT NULL,
    "provider_order_id" "text",
    "provider_payment_id" "text",
    "provider_signature" "text",
    "expires_at" timestamp with time zone NOT NULL,
    "paid_at" timestamp with time zone,
    "failure_code" "text",
    "failure_message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "booking_payments_amount_paise_check" CHECK (("amount_paise" > 0)),
    CONSTRAINT "booking_payments_payment_mode_check" CHECK (("payment_mode" = ANY (ARRAY['full_online'::"text", 'deposit_online'::"text"]))),
    CONSTRAINT "booking_payments_status_check" CHECK (("status" = ANY (ARRAY['created'::"text", 'authorized'::"text", 'paid'::"text", 'failed'::"text", 'expired'::"text", 'refunded'::"text", 'partially_refunded'::"text"])))
);


ALTER TABLE "public"."booking_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."booking_resources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "name" "text" NOT NULL,
    "resource_type" "text" DEFAULT 'staff'::"text" NOT NULL,
    "timezone" "text" DEFAULT 'Asia/Kolkata'::"text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "booking_resources_resource_type_check" CHECK (("resource_type" = ANY (ARRAY['staff'::"text", 'doctor'::"text", 'coach'::"text", 'room'::"text", 'table_group'::"text", 'equipment'::"text"])))
);


ALTER TABLE "public"."booking_resources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."business_locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "location_type" "text" DEFAULT 'branch'::"text" NOT NULL,
    "timezone" "text" DEFAULT 'Asia/Kolkata'::"text" NOT NULL,
    "address" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "phone" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "google_maps_url" "text",
    CONSTRAINT "business_locations_google_maps_url_https" CHECK ((("google_maps_url" IS NULL) OR ("google_maps_url" ~* '^https://[^[:space:]]+$'::"text"))),
    CONSTRAINT "business_locations_location_type_check" CHECK (("location_type" = ANY (ARRAY['chamber'::"text", 'clinic'::"text", 'branch'::"text", 'restaurant'::"text", 'virtual'::"text"])))
);


ALTER TABLE "public"."business_locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "recipient_id" "uuid",
    "event_type" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "actor_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."campaign_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_recipients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "recipient_address" "text" NOT NULL,
    "consent_basis" "text" NOT NULL,
    "status" "text" DEFAULT 'approved'::"text" NOT NULL,
    "scheduled_for" timestamp with time zone,
    "message_id" "uuid",
    "provider_message_id" "text",
    "failure_reason" "text",
    "sent_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "campaign_recipients_consent_basis_check" CHECK (("consent_basis" = ANY (ARRAY['care'::"text", 'marketing'::"text", 'emergency'::"text"]))),
    CONSTRAINT "campaign_recipients_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'queued'::"text", 'sent'::"text", 'delivered'::"text", 'read'::"text", 'failed'::"text", 'skipped'::"text", 'opted_out'::"text"])))
);


ALTER TABLE "public"."campaign_recipients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "campaign_type" "text" NOT NULL,
    "channel" "text" DEFAULT 'whatsapp'::"text" NOT NULL,
    "template_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "audience_filter" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "message_note" "text",
    "scheduled_for" timestamp with time zone,
    "timezone" "text" DEFAULT 'Asia/Kolkata'::"text" NOT NULL,
    "frequency_cap_hours" integer DEFAULT 72 NOT NULL,
    "total_count" integer DEFAULT 0 NOT NULL,
    "eligible_count" integer DEFAULT 0 NOT NULL,
    "sent_count" integer DEFAULT 0 NOT NULL,
    "delivered_count" integer DEFAULT 0 NOT NULL,
    "read_count" integer DEFAULT 0 NOT NULL,
    "failed_count" integer DEFAULT 0 NOT NULL,
    "skipped_count" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "campaigns_campaign_type_check" CHECK (("campaign_type" = ANY (ARRAY['care'::"text", 'marketing'::"text", 'emergency'::"text"]))),
    CONSTRAINT "campaigns_channel_check" CHECK (("channel" = 'whatsapp'::"text")),
    CONSTRAINT "campaigns_emergency_doctor_scope_check" CHECK ((("campaign_type" <> 'emergency'::"text") OR (("audience_filter" ? 'location_id'::"text") AND ("audience_filter" ? 'resource_id'::"text") AND ("audience_filter" ? 'appointment_date'::"text") AND ("audience_filter" ? 'action'::"text") AND (("audience_filter" ->> 'action'::"text") = ANY (ARRAY['reschedule_required'::"text", 'notify_only'::"text"]))))),
    CONSTRAINT "campaigns_frequency_cap_hours_check" CHECK ((("frequency_cap_hours" >= 1) AND ("frequency_cap_hours" <= 720))),
    CONSTRAINT "campaigns_name_check" CHECK ((("char_length"("name") >= 2) AND ("char_length"("name") <= 120))),
    CONSTRAINT "campaigns_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'scheduled'::"text", 'queued'::"text", 'running'::"text", 'paused'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."campaigns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."care_reminders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "prescription_id" "uuid",
    "prescription_item_id" "uuid",
    "encounter_id" "uuid",
    "reminder_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "instructions" "text",
    "schedule_kind" "text" NOT NULL,
    "scheduled_for" timestamp with time zone,
    "time_of_day" time without time zone,
    "starts_on" "date",
    "ends_on" "date",
    "timezone" "text" DEFAULT 'Asia/Kolkata'::"text" NOT NULL,
    "channel" "text" DEFAULT 'whatsapp'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "consent_snapshot" boolean DEFAULT false NOT NULL,
    "next_run_at" timestamp with time zone NOT NULL,
    "last_run_at" timestamp with time zone,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "care_plan_id" "uuid",
    "approval_mode" "text" DEFAULT 'manual'::"text" NOT NULL,
    CONSTRAINT "care_reminders_approval_mode_check" CHECK (("approval_mode" = ANY (ARRAY['manual'::"text", 'automatic'::"text"]))),
    CONSTRAINT "care_reminders_channel_check" CHECK (("channel" = ANY (ARRAY['whatsapp'::"text", 'email'::"text", 'manual'::"text"]))),
    CONSTRAINT "care_reminders_check" CHECK (((("schedule_kind" = 'one_time'::"text") AND ("scheduled_for" IS NOT NULL)) OR (("schedule_kind" = 'daily'::"text") AND ("time_of_day" IS NOT NULL) AND ("starts_on" IS NOT NULL)))),
    CONSTRAINT "care_reminders_check1" CHECK ((("ends_on" IS NULL) OR ("starts_on" IS NULL) OR ("ends_on" >= "starts_on"))),
    CONSTRAINT "care_reminders_reminder_type_check" CHECK (("reminder_type" = ANY (ARRAY['medication'::"text", 'follow_up'::"text", 'test'::"text", 'care'::"text"]))),
    CONSTRAINT "care_reminders_schedule_kind_check" CHECK (("schedule_kind" = ANY (ARRAY['one_time'::"text", 'daily'::"text"]))),
    CONSTRAINT "care_reminders_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'paused'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."care_reminders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."channel_connections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "channel" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "status" "text" DEFAULT 'not_connected'::"text" NOT NULL,
    "external_account_id" "text",
    "external_phone_number_id" "text",
    "display_name" "text",
    "display_address" "text",
    "capabilities" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_verified_at" timestamp with time zone,
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "channel_connections_channel_check" CHECK (("channel" = ANY (ARRAY['whatsapp'::"text", 'instagram'::"text", 'email'::"text"]))),
    CONSTRAINT "channel_connections_provider_check" CHECK (("provider" = ANY (ARRAY['meta_cloud'::"text", 'open_bsp'::"text", 'resend'::"text"]))),
    CONSTRAINT "channel_connections_status_check" CHECK (("status" = ANY (ARRAY['not_connected'::"text", 'pending'::"text", 'test'::"text", 'live'::"text", 'error'::"text", 'disabled'::"text"])))
);


ALTER TABLE "public"."channel_connections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."channel_message_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "channel" "text" DEFAULT 'whatsapp'::"text" NOT NULL,
    "event_type" "text" NOT NULL,
    "provider_template_name" "text" NOT NULL,
    "language_code" "text" DEFAULT 'en'::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "variable_map" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "channel_message_templates_channel_check" CHECK (("channel" = ANY (ARRAY['whatsapp'::"text", 'email'::"text"]))),
    CONSTRAINT "channel_message_templates_event_type_check" CHECK (("event_type" = ANY (ARRAY['confirmation'::"text", 'reminder_24h'::"text", 'reminder_2h'::"text", 'follow_up'::"text", 'cancellation'::"text", 'reschedule'::"text", 'care_campaign'::"text", 'marketing_campaign'::"text", 'emergency_notice'::"text", 'booking_otp'::"text", 'doctor_queue'::"text", 'care_reminder'::"text", 'payment_action'::"text", 'payment_confirmation'::"text"]))),
    CONSTRAINT "channel_message_templates_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'submitted'::"text", 'approved'::"text", 'rejected'::"text", 'paused'::"text"])))
);


ALTER TABLE "public"."channel_message_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clinic_departments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "code" "text",
    "description" "text",
    "active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "clinic_departments_code_check" CHECK ((("code" IS NULL) OR ("code" ~ '^[a-z0-9_-]{2,40}$'::"text"))),
    CONSTRAINT "clinic_departments_description_check" CHECK ((("description" IS NULL) OR ("char_length"("description") <= 500))),
    CONSTRAINT "clinic_departments_name_check" CHECK ((("char_length"(TRIM(BOTH FROM "name")) >= 2) AND ("char_length"(TRIM(BOTH FROM "name")) <= 80))),
    CONSTRAINT "clinic_departments_sort_order_check" CHECK ((("sort_order" >= 0) AND ("sort_order" <= 10000)))
);


ALTER TABLE "public"."clinic_departments" OWNER TO "postgres";


COMMENT ON TABLE "public"."clinic_departments" IS 'Tenant-scoped department and specialty navigation for multi-doctor clinic booking.';



CREATE TABLE IF NOT EXISTS "public"."clinic_pilot_controls" (
    "organization_id" "uuid" NOT NULL,
    "pilot_owner_name" "text" NOT NULL,
    "rollback_owner_name" "text" NOT NULL,
    "health_status" "text" DEFAULT 'hold'::"text" NOT NULL,
    "health_note" "text",
    "reviewed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "planned_start_date" "date",
    CONSTRAINT "clinic_pilot_controls_health_note_check" CHECK ((("health_note" IS NULL) OR (("char_length"(TRIM(BOTH FROM "health_note")) >= 3) AND ("char_length"(TRIM(BOTH FROM "health_note")) <= 500)))),
    CONSTRAINT "clinic_pilot_controls_health_status_check" CHECK (("health_status" = ANY (ARRAY['hold'::"text", 'go'::"text"]))),
    CONSTRAINT "clinic_pilot_controls_pilot_owner_name_check" CHECK ((("char_length"(TRIM(BOTH FROM "pilot_owner_name")) >= 2) AND ("char_length"(TRIM(BOTH FROM "pilot_owner_name")) <= 120))),
    CONSTRAINT "clinic_pilot_controls_rollback_owner_name_check" CHECK ((("char_length"(TRIM(BOTH FROM "rollback_owner_name")) >= 2) AND ("char_length"(TRIM(BOTH FROM "rollback_owner_name")) <= 120)))
);


ALTER TABLE "public"."clinic_pilot_controls" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."communication_opt_outs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "patient_id" "uuid",
    "channel" "text" DEFAULT 'whatsapp'::"text" NOT NULL,
    "address" "text" NOT NULL,
    "scope" "text" DEFAULT 'marketing'::"text" NOT NULL,
    "source" "text" DEFAULT 'customer_request'::"text" NOT NULL,
    "reason" "text",
    "opted_out_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "recorded_by" "uuid",
    CONSTRAINT "communication_opt_outs_channel_check" CHECK (("channel" = ANY (ARRAY['whatsapp'::"text", 'email'::"text", 'sms'::"text"]))),
    CONSTRAINT "communication_opt_outs_scope_check" CHECK (("scope" = ANY (ARRAY['care'::"text", 'marketing'::"text", 'all'::"text"])))
);


ALTER TABLE "public"."communication_opt_outs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contacts" (
    "organization_id" "uuid" NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text",
    "extra" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL
);


ALTER TABLE "public"."contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contacts_addresses" (
    "organization_id" "uuid" NOT NULL,
    "service" "public"."service" NOT NULL,
    "address" "text" NOT NULL,
    "extra" "jsonb",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "contact_id" "uuid"
);


ALTER TABLE "public"."contacts_addresses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "organization_id" "uuid" NOT NULL,
    "service" "public"."service" NOT NULL,
    "organization_address" "text" NOT NULL,
    "contact_address" "text",
    "name" "text",
    "extra" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "group_address" "text",
    "ai_paused" boolean DEFAULT false NOT NULL,
    "paused_at" timestamp with time zone,
    "assigned_agent_id" "uuid"
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."device_push_deliveries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "notification_id" "uuid" NOT NULL,
    "subscription_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "max_attempts" integer DEFAULT 3 NOT NULL,
    "next_attempt_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "claimed_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "failure_reason" "text",
    "provider_response" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "device_push_deliveries_attempts_check" CHECK ((("attempts" >= 0) AND ("attempts" <= 3))),
    CONSTRAINT "device_push_deliveries_max_attempts_check" CHECK ((("max_attempts" >= 1) AND ("max_attempts" <= 3))),
    CONSTRAINT "device_push_deliveries_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'processing'::"text", 'delivered'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."device_push_deliveries" OWNER TO "postgres";


COMMENT ON TABLE "public"."device_push_deliveries" IS 'Service-role-only delivery queue for opt-in, privacy-safe staff device alerts.';



CREATE TABLE IF NOT EXISTS "public"."device_push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh_key" "text" NOT NULL,
    "auth_key" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revoked_at" timestamp with time zone,
    CONSTRAINT "device_push_subscriptions_auth_key_check" CHECK ((("length"("auth_key") >= 8) AND ("length"("auth_key") <= 256))),
    CONSTRAINT "device_push_subscriptions_endpoint_check" CHECK (("endpoint" ~~ 'https://%'::"text")),
    CONSTRAINT "device_push_subscriptions_p256dh_key_check" CHECK ((("length"("p256dh_key") >= 16) AND ("length"("p256dh_key") <= 512))),
    CONSTRAINT "device_push_subscriptions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'revoked'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."device_push_subscriptions" OWNER TO "postgres";


COMMENT ON TABLE "public"."device_push_subscriptions" IS 'User-consented device endpoints for privacy-safe serious-action push notifications. Never stores patient data.';



CREATE TABLE IF NOT EXISTS "public"."doctor_import_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "source_format" "text" NOT NULL,
    "row_count" integer NOT NULL,
    "imported_count" integer DEFAULT 0 NOT NULL,
    "status" "text" NOT NULL,
    "payload_hash" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "doctor_import_jobs_imported_count_check" CHECK (("imported_count" >= 0)),
    CONSTRAINT "doctor_import_jobs_row_count_check" CHECK ((("row_count" >= 1) AND ("row_count" <= 200))),
    CONSTRAINT "doctor_import_jobs_source_format_check" CHECK (("source_format" = ANY (ARRAY['csv'::"text", 'json'::"text"]))),
    CONSTRAINT "doctor_import_jobs_status_check" CHECK (("status" = ANY (ARRAY['completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."doctor_import_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."doctor_queue_consent_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "notice_version" "text" NOT NULL,
    "notice_text" "text" NOT NULL,
    "channel" "text" NOT NULL,
    "phone_identity" "text",
    "recorded_by" "uuid" NOT NULL,
    "recorded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "doctor_queue_consent_events_action_check" CHECK (("action" = ANY (ARRAY['enabled'::"text", 'withdrawn'::"text"]))),
    CONSTRAINT "doctor_queue_consent_events_channel_check" CHECK (("channel" = 'whatsapp'::"text"))
);


ALTER TABLE "public"."doctor_queue_consent_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."entitlements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "plan_id" "text" DEFAULT 'launch'::"text" NOT NULL,
    "max_workspaces" integer DEFAULT 1 NOT NULL,
    "max_seats" integer DEFAULT 2 NOT NULL,
    "conversations_quota" integer DEFAULT 1000 NOT NULL,
    "channels" "jsonb" DEFAULT '["whatsapp", "webchat"]'::"jsonb" NOT NULL,
    "features" "jsonb" DEFAULT '["rag_single_kb", "starter_templates"]'::"jsonb" NOT NULL,
    "white_label" boolean DEFAULT false NOT NULL,
    "mautic_enabled" boolean DEFAULT false NOT NULL,
    "status" "text" DEFAULT 'trialing'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "trial_started_at" timestamp with time zone,
    "trial_ends_at" timestamp with time zone,
    "grace_ends_at" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "cancel_at_period_end" boolean DEFAULT false NOT NULL,
    CONSTRAINT "entitlements_status_check" CHECK (("status" = ANY (ARRAY['trialing'::"text", 'active'::"text", 'past_due'::"text", 'suspended'::"text", 'cancelled'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."entitlements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."eval_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "query_text" "text" NOT NULL,
    "matched_chunk_id" "uuid",
    "similarity_score" double precision NOT NULL,
    "eval_status" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "eval_runs_eval_status_check" CHECK (("eval_status" = ANY (ARRAY['grounded'::"text", 'low_similarity_escalated'::"text", 'hallucination_flagged'::"text"])))
);


ALTER TABLE "public"."eval_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."knowledge_bases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" DEFAULT 'general'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."knowledge_bases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."knowledge_chunks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "embedding" "public"."vector"(1536),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source_updated_at" timestamp with time zone
);


ALTER TABLE "public"."knowledge_chunks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."knowledge_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "knowledge_base_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "filename" "text" NOT NULL,
    "file_type" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "knowledge_documents_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'indexing'::"text", 'indexed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."knowledge_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "organization_address" "text",
    "level" "public"."log_level" NOT NULL,
    "category" "text" NOT NULL,
    "message" "text" NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "service" "public"."service"
);


ALTER TABLE "public"."logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."medicine_catalog_entries" (
    "id" bigint NOT NULL,
    "release_id" "uuid" NOT NULL,
    "source_identifier" "text" NOT NULL,
    "entry_type" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "generic_identifier" "text",
    "generic_name" "text",
    "product_identifier" "text",
    "product_name" "text",
    "supplier_identifier" "text",
    "supplier_name" "text",
    "dose_form_identifier" "text",
    "dose_form_name" "text",
    "route_identifiers" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "route_names" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "search_text" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "quality_flags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "medicine_catalog_entries_entry_type_check" CHECK (("entry_type" = ANY (ARRAY['brand'::"text", 'generic'::"text"]))),
    CONSTRAINT "medicine_catalog_entries_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'quarantined'::"text"])))
);


ALTER TABLE "public"."medicine_catalog_entries" OWNER TO "postgres";


ALTER TABLE "public"."medicine_catalog_entries" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."medicine_catalog_entries_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."medicine_catalog_releases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_name" "text" NOT NULL,
    "edition" "text" NOT NULL,
    "release_date" "date" NOT NULL,
    "package_sha256" "text" NOT NULL,
    "licence_name" "text" NOT NULL,
    "licence_url" "text" NOT NULL,
    "status" "text" DEFAULT 'staged'::"text" NOT NULL,
    "row_counts" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "activated_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "medicine_catalog_releases_status_check" CHECK (("status" = ANY (ARRAY['staged'::"text", 'active'::"text", 'superseded'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."medicine_catalog_releases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "external_id" "text",
    "service" "public"."service" NOT NULL,
    "organization_address" "text" NOT NULL,
    "contact_address" "text",
    "direction" "public"."direction" NOT NULL,
    "content" "jsonb" NOT NULL,
    "agent_id" "uuid",
    "status" "jsonb" DEFAULT "jsonb_build_object"('pending', "now"()) NOT NULL,
    "timestamp" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "group_address" "text",
    "thread_id" "text"
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."n8n_instances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "instance_url" "text" NOT NULL,
    "webhook_slug" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."n8n_instances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."n8n_template_registry" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "description" "text",
    "workflow_json" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."n8n_template_registry" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."onboarding_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "business_category" "text" NOT NULL,
    "business_name" "text" NOT NULL,
    "timezone" "text" DEFAULT 'Asia/Kolkata'::"text" NOT NULL,
    "services_offered" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "description" "text",
    "primary_phone" "text",
    "email" "text",
    "website" "text",
    "working_hours" "jsonb" DEFAULT '{"fri": {"open": "09:00", "close": "18:00", "enabled": true}, "mon": {"open": "09:00", "close": "18:00", "enabled": true}, "sat": {"open": "09:00", "close": "14:00", "enabled": true}, "sun": {"open": "09:00", "close": "14:00", "enabled": false}, "thu": {"open": "09:00", "close": "18:00", "enabled": true}, "tue": {"open": "09:00", "close": "18:00", "enabled": true}, "wed": {"open": "09:00", "close": "18:00", "enabled": true}}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "clinic_mode" "text" DEFAULT 'solo_practitioner'::"text" NOT NULL,
    "custom_brochure_url" "text",
    "custom_brochure_storage_path" "text",
    CONSTRAINT "onboarding_profiles_clinic_mode_check" CHECK (("clinic_mode" = ANY (ARRAY['solo_practitioner'::"text", 'multi_doctor_clinic'::"text", 'diagnostic_centre'::"text"]))),
    CONSTRAINT "onboarding_profiles_custom_brochure_url_https" CHECK ((("custom_brochure_url" IS NULL) OR ("custom_brochure_url" ~* '^https://[^[:space:]]+$'::"text")))
);


ALTER TABLE "public"."onboarding_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."onboarding_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "used_at" timestamp with time zone,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "name" "text" NOT NULL,
    "service" "public"."service" NOT NULL,
    "callback_url" "text",
    "verify_token" "text",
    CONSTRAINT "onboarding_tokens_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'used'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."onboarding_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."operational_billing_settings" (
    "organization_id" "uuid" NOT NULL,
    "mode" "text" DEFAULT 'shadow'::"text" NOT NULL,
    "charging_enabled" boolean DEFAULT false NOT NULL,
    "send_blocking_enabled" boolean DEFAULT false NOT NULL,
    "warning_threshold_paise" integer DEFAULT 50000 NOT NULL,
    "critical_threshold_paise" integer DEFAULT 20000 NOT NULL,
    "activated_at" timestamp with time zone,
    "activated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "wallet_topups_enabled" boolean DEFAULT false NOT NULL,
    "creative_billing_enabled" boolean DEFAULT false NOT NULL,
    "rate_activation_enabled" boolean DEFAULT false NOT NULL,
    CONSTRAINT "operational_billing_commercial_lock" CHECK ((("mode" = 'active'::"text") OR (("wallet_topups_enabled" = false) AND ("creative_billing_enabled" = false) AND ("rate_activation_enabled" = false)))),
    CONSTRAINT "operational_billing_settings_critical_threshold_paise_check" CHECK (("critical_threshold_paise" >= 0)),
    CONSTRAINT "operational_billing_settings_mode_check" CHECK (("mode" = ANY (ARRAY['shadow'::"text", 'active'::"text"]))),
    CONSTRAINT "operational_billing_settings_warning_threshold_paise_check" CHECK (("warning_threshold_paise" >= 0)),
    CONSTRAINT "operational_billing_shadow_guard" CHECK ((("mode" = 'active'::"text") OR (("charging_enabled" = false) AND ("send_blocking_enabled" = false) AND ("activated_at" IS NULL))))
);


ALTER TABLE "public"."operational_billing_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."operational_creative_reservations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "creative_kind" "text" NOT NULL,
    "amount_paise" bigint NOT NULL,
    "status" "text" DEFAULT 'disabled'::"text" NOT NULL,
    "reference_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "operational_creative_reservations_amount_paise_check" CHECK (("amount_paise" >= 0)),
    CONSTRAINT "operational_creative_reservations_creative_kind_check" CHECK (("creative_kind" = ANY (ARRAY['image'::"text", 'video'::"text"]))),
    CONSTRAINT "operational_creative_reservations_status_check" CHECK (("status" = ANY (ARRAY['disabled'::"text", 'reserved'::"text", 'captured'::"text", 'released'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."operational_creative_reservations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."operational_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "actor_user_id" "uuid",
    "event_source" "text" NOT NULL,
    "severity" "text" DEFAULT 'error'::"text" NOT NULL,
    "error_code" "text" NOT NULL,
    "safe_message" "text" NOT NULL,
    "request_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "operational_events_error_code_check" CHECK ((("char_length"(TRIM(BOTH FROM "error_code")) >= 2) AND ("char_length"(TRIM(BOTH FROM "error_code")) <= 100))),
    CONSTRAINT "operational_events_event_source_check" CHECK ((("char_length"(TRIM(BOTH FROM "event_source")) >= 2) AND ("char_length"(TRIM(BOTH FROM "event_source")) <= 120))),
    CONSTRAINT "operational_events_safe_message_check" CHECK ((("char_length"(TRIM(BOTH FROM "safe_message")) >= 2) AND ("char_length"(TRIM(BOTH FROM "safe_message")) <= 500))),
    CONSTRAINT "operational_events_severity_check" CHECK (("severity" = ANY (ARRAY['warning'::"text", 'error'::"text", 'critical'::"text"])))
);


ALTER TABLE "public"."operational_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."operational_rate_card_audit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "rate_card_id" "uuid",
    "action" "text" NOT NULL,
    "source_url" "text" NOT NULL,
    "source_version" "text" NOT NULL,
    "actor_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "operational_rate_card_audit_action_check" CHECK (("action" = ANY (ARRAY['draft_created'::"text", 'source_updated'::"text", 'verified'::"text", 'activation_requested'::"text", 'retired'::"text"])))
);


ALTER TABLE "public"."operational_rate_card_audit" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."operational_reconciliation_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "status" "text" DEFAULT 'not_started'::"text" NOT NULL,
    "meta_bill_paise" bigint,
    "razorpay_settlement_paise" bigint,
    "ledger_total_paise" bigint,
    "variance_paise" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_at" timestamp with time zone,
    "reviewed_by" "uuid",
    CONSTRAINT "operational_reconciliation_runs_status_check" CHECK (("status" = ANY (ARRAY['not_started'::"text", 'in_review'::"text", 'reconciled'::"text", 'variance_found'::"text"])))
);


ALTER TABLE "public"."operational_reconciliation_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."operational_statements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "usage_total_paise" numeric(16,4) DEFAULT 0 NOT NULL,
    "wallet_movement_paise" bigint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "operational_statements_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'issued'::"text", 'void'::"text"])))
);


ALTER TABLE "public"."operational_statements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."operational_topup_intents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "amount_paise" bigint NOT NULL,
    "provider" "text" DEFAULT 'razorpay'::"text" NOT NULL,
    "status" "text" DEFAULT 'disabled'::"text" NOT NULL,
    "provider_reference" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "operational_topup_intents_amount_paise_check" CHECK (("amount_paise" > 0)),
    CONSTRAINT "operational_topup_intents_status_check" CHECK (("status" = ANY (ARRAY['disabled'::"text", 'created'::"text", 'paid'::"text", 'failed'::"text", 'refunded'::"text"])))
);


ALTER TABLE "public"."operational_topup_intents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."operational_usage_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "source_type" "text" NOT NULL,
    "source_id" "uuid" NOT NULL,
    "provider_message_id" "text",
    "channel" "text" DEFAULT 'whatsapp'::"text" NOT NULL,
    "message_category" "text" NOT NULL,
    "delivery_status" "text" DEFAULT 'sent'::"text" NOT NULL,
    "rate_card_id" "uuid",
    "base_cost_paise" numeric(16,4) DEFAULT 0 NOT NULL,
    "platform_fee_paise" numeric(16,4) DEFAULT 0 NOT NULL,
    "estimated_total_paise" numeric(16,4) DEFAULT 0 NOT NULL,
    "charged_total_paise" numeric(16,4) DEFAULT 0 NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "operational_usage_events_base_cost_paise_check" CHECK (("base_cost_paise" >= (0)::numeric)),
    CONSTRAINT "operational_usage_events_channel_check" CHECK (("channel" = ANY (ARRAY['whatsapp'::"text", 'rcs'::"text", 'instagram'::"text"]))),
    CONSTRAINT "operational_usage_events_charged_total_paise_check" CHECK (("charged_total_paise" >= (0)::numeric)),
    CONSTRAINT "operational_usage_events_delivery_status_check" CHECK (("delivery_status" = ANY (ARRAY['queued'::"text", 'sent'::"text", 'delivered'::"text", 'read'::"text", 'failed'::"text"]))),
    CONSTRAINT "operational_usage_events_estimated_total_paise_check" CHECK (("estimated_total_paise" >= (0)::numeric)),
    CONSTRAINT "operational_usage_events_message_category_check" CHECK (("message_category" = ANY (ARRAY['utility'::"text", 'marketing'::"text", 'authentication'::"text", 'service'::"text", 'creative'::"text"]))),
    CONSTRAINT "operational_usage_events_platform_fee_paise_check" CHECK (("platform_fee_paise" >= (0)::numeric)),
    CONSTRAINT "operational_usage_events_source_type_check" CHECK (("source_type" = ANY (ARRAY['appointment_reminder'::"text", 'care_reminder'::"text", 'campaign'::"text", 'doctor_queue'::"text", 'creative'::"text"])))
);


ALTER TABLE "public"."operational_usage_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."operational_wallet_ledger" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "entry_type" "text" NOT NULL,
    "amount_paise" bigint NOT NULL,
    "balance_after_paise" bigint NOT NULL,
    "reference_type" "text" NOT NULL,
    "reference_id" "text" NOT NULL,
    "description" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "operational_wallet_ledger_amount_paise_check" CHECK (("amount_paise" <> 0)),
    CONSTRAINT "operational_wallet_ledger_balance_after_paise_check" CHECK (("balance_after_paise" >= 0)),
    CONSTRAINT "operational_wallet_ledger_entry_type_check" CHECK (("entry_type" = ANY (ARRAY['top_up'::"text", 'reserve'::"text", 'capture'::"text", 'release'::"text", 'reversal'::"text", 'adjustment'::"text"])))
);


ALTER TABLE "public"."operational_wallet_ledger" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."operational_wallets" (
    "organization_id" "uuid" NOT NULL,
    "balance_paise" bigint DEFAULT 0 NOT NULL,
    "reserved_paise" bigint DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "operational_wallet_available_balance" CHECK (("reserved_paise" <= "balance_paise")),
    CONSTRAINT "operational_wallets_balance_paise_check" CHECK (("balance_paise" >= 0)),
    CONSTRAINT "operational_wallets_reserved_paise_check" CHECK (("reserved_paise" >= 0))
);


ALTER TABLE "public"."operational_wallets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_communication_controls" (
    "organization_id" "uuid" NOT NULL,
    "booking_confirmation_enabled" boolean DEFAULT true NOT NULL,
    "reminder_24h_enabled" boolean DEFAULT true NOT NULL,
    "reminder_2h_enabled" boolean DEFAULT true NOT NULL,
    "follow_up_enabled" boolean DEFAULT true NOT NULL,
    "medication_reminder_enabled" boolean DEFAULT true NOT NULL,
    "marketing_campaigns_enabled" boolean DEFAULT false NOT NULL,
    "emergency_notices_enabled" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_by" "uuid"
);


ALTER TABLE "public"."organization_communication_controls" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "service_type" "text" NOT NULL,
    "duration_minutes" integer DEFAULT 30 NOT NULL,
    "price_paise" integer,
    "currency" "text" DEFAULT 'INR'::"text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "description" "text",
    "buffer_minutes" integer DEFAULT 0 NOT NULL,
    "booking_enabled" boolean DEFAULT true NOT NULL,
    CONSTRAINT "organization_services_buffer_minutes_check" CHECK ((("buffer_minutes" >= 0) AND ("buffer_minutes" <= 240))),
    CONSTRAINT "organization_services_currency_check" CHECK (("currency" = 'INR'::"text")),
    CONSTRAINT "organization_services_duration_minutes_check" CHECK ((("duration_minutes" >= 5) AND ("duration_minutes" <= 1440))),
    CONSTRAINT "organization_services_price_paise_check" CHECK ((("price_paise" IS NULL) OR ("price_paise" >= 0)))
);


ALTER TABLE "public"."organization_services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "extra" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations_addresses" (
    "organization_id" "uuid" NOT NULL,
    "service" "public"."service" NOT NULL,
    "address" "text" NOT NULL,
    "extra" "jsonb",
    "status" "text" DEFAULT 'connected'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."organizations_addresses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."patient_care_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "encounter_id" "uuid",
    "plan_type" "text" DEFAULT 'post_visit'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "goal" "text",
    "instructions" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "starts_on" "date" DEFAULT CURRENT_DATE NOT NULL,
    "target_date" "date",
    "next_review_at" timestamp with time zone,
    "assigned_to" "uuid",
    "created_by" "uuid" NOT NULL,
    "completed_by" "uuid",
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "patient_care_plans_check" CHECK ((("target_date" IS NULL) OR ("target_date" >= "starts_on"))),
    CONSTRAINT "patient_care_plans_goal_check" CHECK ((("goal" IS NULL) OR ("char_length"("goal") <= 1000))),
    CONSTRAINT "patient_care_plans_instructions_check" CHECK ((("instructions" IS NULL) OR ("char_length"("instructions") <= 4000))),
    CONSTRAINT "patient_care_plans_plan_type_check" CHECK (("plan_type" = ANY (ARRAY['chronic_care'::"text", 'post_visit'::"text", 'preventive'::"text", 'recovery'::"text", 'other'::"text"]))),
    CONSTRAINT "patient_care_plans_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'paused'::"text", 'completed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "patient_care_plans_title_check" CHECK ((("char_length"("title") >= 2) AND ("char_length"("title") <= 160)))
);


ALTER TABLE "public"."patient_care_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."patient_care_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "encounter_id" "uuid",
    "appointment_id" "uuid",
    "task_type" "text" DEFAULT 'care'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "details" "text",
    "due_at" timestamp with time zone,
    "priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "assigned_to" "uuid",
    "created_by" "uuid" NOT NULL,
    "completed_by" "uuid",
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "care_plan_id" "uuid",
    CONSTRAINT "patient_care_tasks_check" CHECK (((("status" = 'completed'::"text") AND ("completed_at" IS NOT NULL) AND ("completed_by" IS NOT NULL)) OR (("status" <> 'completed'::"text") AND ("completed_at" IS NULL) AND ("completed_by" IS NULL)))),
    CONSTRAINT "patient_care_tasks_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'normal'::"text", 'high'::"text", 'urgent'::"text"]))),
    CONSTRAINT "patient_care_tasks_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'in_progress'::"text", 'completed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "patient_care_tasks_task_type_check" CHECK (("task_type" = ANY (ARRAY['follow_up'::"text", 'call'::"text", 'test_review'::"text", 'document'::"text", 'care'::"text", 'other'::"text"]))),
    CONSTRAINT "patient_care_tasks_title_check" CHECK ((("char_length"(TRIM(BOTH FROM "title")) >= 2) AND ("char_length"(TRIM(BOTH FROM "title")) <= 160)))
);


ALTER TABLE "public"."patient_care_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."patient_consent_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "consent_type" "text" NOT NULL,
    "previous_status" boolean,
    "new_status" boolean NOT NULL,
    "source" "text" DEFAULT 'patient_profile'::"text" NOT NULL,
    "captured_by" "uuid",
    "captured_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "note" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "patient_consent_events_consent_type_check" CHECK (("consent_type" = ANY (ARRAY['care_communications'::"text", 'marketing'::"text"])))
);


ALTER TABLE "public"."patient_consent_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."patient_data_request_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "request_id" "uuid" NOT NULL,
    "actor_user_id" "uuid",
    "event_type" "text" NOT NULL,
    "from_status" "text",
    "to_status" "text" NOT NULL,
    "safe_summary" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "patient_data_request_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['submitted'::"text", 'status_changed'::"text", 'review_updated'::"text"]))),
    CONSTRAINT "patient_data_request_events_safe_summary_check" CHECK ((("char_length"(TRIM(BOTH FROM "safe_summary")) >= 2) AND ("char_length"(TRIM(BOTH FROM "safe_summary")) <= 500)))
);


ALTER TABLE "public"."patient_data_request_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."patient_data_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "reference" "text" DEFAULT ('DSR-'::"text" || "upper"("substr"("replace"(("gen_random_uuid"())::"text", '-'::"text", ''::"text"), 1, 8))) NOT NULL,
    "request_type" "text" NOT NULL,
    "status" "text" DEFAULT 'submitted'::"text" NOT NULL,
    "source_channel" "text" NOT NULL,
    "request_summary" "text" NOT NULL,
    "identity_method" "text" NOT NULL,
    "identity_verified_at" timestamp with time zone NOT NULL,
    "retention_review" "text" DEFAULT 'pending'::"text" NOT NULL,
    "retention_reason" "text",
    "decision_summary" "text",
    "assigned_to" "uuid",
    "created_by" "uuid",
    "updated_by" "uuid",
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "patient_data_requests_check" CHECK ((("status" <> 'completed'::"text") OR (("retention_review" <> 'pending'::"text") AND ("decision_summary" IS NOT NULL) AND ("completed_at" IS NOT NULL)))),
    CONSTRAINT "patient_data_requests_check1" CHECK ((("request_type" <> 'erasure'::"text") OR ("status" <> ALL (ARRAY['approved'::"text", 'processing'::"text", 'completed'::"text"])) OR ("retention_review" <> 'pending'::"text"))),
    CONSTRAINT "patient_data_requests_decision_summary_check" CHECK ((("decision_summary" IS NULL) OR (("char_length"(TRIM(BOTH FROM "decision_summary")) >= 5) AND ("char_length"(TRIM(BOTH FROM "decision_summary")) <= 1000)))),
    CONSTRAINT "patient_data_requests_request_summary_check" CHECK ((("char_length"(TRIM(BOTH FROM "request_summary")) >= 5) AND ("char_length"(TRIM(BOTH FROM "request_summary")) <= 1000))),
    CONSTRAINT "patient_data_requests_request_type_check" CHECK (("request_type" = ANY (ARRAY['access_export'::"text", 'correction'::"text", 'consent_withdrawal'::"text", 'erasure'::"text"]))),
    CONSTRAINT "patient_data_requests_retention_reason_check" CHECK ((("retention_reason" IS NULL) OR (("char_length"(TRIM(BOTH FROM "retention_reason")) >= 5) AND ("char_length"(TRIM(BOTH FROM "retention_reason")) <= 1000)))),
    CONSTRAINT "patient_data_requests_retention_review_check" CHECK (("retention_review" = ANY (ARRAY['pending'::"text", 'retain_full'::"text", 'retain_partial'::"text", 'eligible'::"text"]))),
    CONSTRAINT "patient_data_requests_source_channel_check" CHECK (("source_channel" = ANY (ARRAY['patient_portal'::"text", 'clinic_staff'::"text"]))),
    CONSTRAINT "patient_data_requests_status_check" CHECK (("status" = ANY (ARRAY['submitted'::"text", 'identity_verified'::"text", 'under_review'::"text", 'approved'::"text", 'processing'::"text", 'completed'::"text", 'rejected'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."patient_data_requests" OWNER TO "postgres";


COMMENT ON TABLE "public"."patient_data_requests" IS 'Controlled patient access, correction, consent-withdrawal and erasure requests; no automatic record deletion.';



CREATE TABLE IF NOT EXISTS "public"."patient_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "encounter_id" "uuid",
    "appointment_id" "uuid",
    "document_type" "text" DEFAULT 'report'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "storage_bucket" "text" DEFAULT 'clinical-documents'::"text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "mime_type" "text" NOT NULL,
    "file_size_bytes" bigint NOT NULL,
    "uploaded_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "patient_documents_document_type_check" CHECK (("document_type" = ANY (ARRAY['prescription'::"text", 'lab_report'::"text", 'imaging'::"text", 'referral'::"text", 'consent'::"text", 'other'::"text"]))),
    CONSTRAINT "patient_documents_file_size_bytes_check" CHECK ((("file_size_bytes" > 0) AND ("file_size_bytes" <= 10485760)))
);


ALTER TABLE "public"."patient_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."patient_encounters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "appointment_id" "uuid",
    "encounter_type" "text" DEFAULT 'consultation'::"text" NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "diagnosis" "text",
    "clinical_note" "text" NOT NULL,
    "treatment_plan" "text",
    "follow_up_at" timestamp with time zone,
    "follow_up_status" "text" DEFAULT 'not_required'::"text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "patient_encounters_check" CHECK ((("follow_up_at" IS NULL) OR ("follow_up_status" <> 'not_required'::"text"))),
    CONSTRAINT "patient_encounters_encounter_type_check" CHECK (("encounter_type" = ANY (ARRAY['consultation'::"text", 'follow_up'::"text", 'procedure'::"text", 'vaccination'::"text", 'other'::"text"]))),
    CONSTRAINT "patient_encounters_follow_up_status_check" CHECK (("follow_up_status" = ANY (ARRAY['not_required'::"text", 'scheduled'::"text", 'due'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."patient_encounters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."patient_guardian_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "guardian_name" "text" NOT NULL,
    "guardian_phone" "text" NOT NULL,
    "relationship" "text" NOT NULL,
    "verification_status" "text" DEFAULT 'unverified'::"text" NOT NULL,
    "verified_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "normalized_phone" "text" GENERATED ALWAYS AS ("private"."normalize_phone_identity"("guardian_phone")) STORED,
    CONSTRAINT "patient_guardian_links_relationship_check" CHECK (("relationship" = ANY (ARRAY['self'::"text", 'child'::"text", 'parent'::"text", 'spouse'::"text", 'relative'::"text", 'other'::"text"]))),
    CONSTRAINT "patient_guardian_links_verification_status_check" CHECK (("verification_status" = ANY (ARRAY['unverified'::"text", 'otp_verified'::"text", 'staff_verified'::"text"])))
);


ALTER TABLE "public"."patient_guardian_links" OWNER TO "postgres";


COMMENT ON TABLE "public"."patient_guardian_links" IS 'OTP-ready relationship boundary between a booking contact and one or more patients. Clinical history is never exposed through this table.';



CREATE TABLE IF NOT EXISTS "public"."patient_identity_verification_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "patient_id" "uuid",
    "conversation_id" "uuid" NOT NULL,
    "session_id" "uuid",
    "source_message_id" "uuid" NOT NULL,
    "identity_type" "text" NOT NULL,
    "verification_method" "text" NOT NULL,
    "identity_hash" "bytea" NOT NULL,
    "identity_last4" "text" NOT NULL,
    "verified_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "patient_identity_verification_events_identity_last4_check" CHECK (("identity_last4" ~ '^[0-9]{4}$'::"text")),
    CONSTRAINT "patient_identity_verification_events_identity_type_check" CHECK (("identity_type" = 'whatsapp'::"text")),
    CONSTRAINT "patient_identity_verification_events_verification_method_check" CHECK (("verification_method" = 'inbound_channel_possession'::"text"))
);


ALTER TABLE "public"."patient_identity_verification_events" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."patient_medication_adherence" WITH ("security_invoker"='true') AS
 SELECT "run"."organization_id",
    "run"."patient_id",
    ("count"(*) FILTER (WHERE ("reminder"."reminder_type" = 'medication'::"text")))::integer AS "total_doses",
    ("count"(*) FILTER (WHERE (("reminder"."reminder_type" = 'medication'::"text") AND ("run"."response_kind" = 'confirmed'::"text"))))::integer AS "taken_doses",
    ("count"(*) FILTER (WHERE (("reminder"."reminder_type" = 'medication'::"text") AND ("run"."response_kind" = 'missed'::"text"))))::integer AS "skipped_doses",
    ("count"(*) FILTER (WHERE (("reminder"."reminder_type" = 'medication'::"text") AND ("run"."response_kind" = 'snoozed'::"text"))))::integer AS "snoozed_doses",
    ("count"(*) FILTER (WHERE (("reminder"."reminder_type" = 'medication'::"text") AND ("run"."response_kind" = 'help'::"text"))))::integer AS "help_requests",
    "round"(((100.0 * ("count"(*) FILTER (WHERE (("reminder"."reminder_type" = 'medication'::"text") AND ("run"."response_kind" = 'confirmed'::"text"))))::numeric) / (NULLIF("count"(*) FILTER (WHERE (("reminder"."reminder_type" = 'medication'::"text") AND ("run"."response_kind" = ANY (ARRAY['confirmed'::"text", 'missed'::"text"])))), 0))::numeric), 1) AS "adherence_percent",
    "max"("run"."response_received_at") AS "last_response_at"
   FROM ("public"."care_reminder_runs" "run"
     JOIN "public"."care_reminders" "reminder" ON (("reminder"."id" = "run"."reminder_id")))
  WHERE ("run"."scheduled_for" >= ("now"() - '30 days'::interval))
  GROUP BY "run"."organization_id", "run"."patient_id";


ALTER VIEW "public"."patient_medication_adherence" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_gateway_connections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "status" "text" DEFAULT 'not_connected'::"text" NOT NULL,
    "account_label" "text",
    "supported_methods" "text"[] DEFAULT ARRAY['upi'::"text", 'card'::"text", 'netbanking'::"text"] NOT NULL,
    "last_verified_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payment_gateway_connections_provider_check" CHECK (("provider" = 'razorpay'::"text")),
    CONSTRAINT "payment_gateway_connections_status_check" CHECK (("status" = ANY (ARRAY['not_connected'::"text", 'test'::"text", 'live'::"text", 'disabled'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."payment_gateway_connections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prescription_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "prescription_id" "uuid" NOT NULL,
    "medicine_name" "text" NOT NULL,
    "dosage" "text",
    "frequency" "text" NOT NULL,
    "duration" "text",
    "instructions" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "catalog_entry_id" bigint,
    "medicine_identifier" "text",
    "medicine_source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "catalogue_snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "prescription_items_medicine_source_check" CHECK (("medicine_source" = ANY (ARRAY['manual'::"text", 'cdci_flat'::"text"])))
);


ALTER TABLE "public"."prescription_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prescriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "encounter_id" "uuid",
    "appointment_id" "uuid",
    "prescription_number" "text" NOT NULL,
    "issued_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'issued'::"text" NOT NULL,
    "diagnosis" "text",
    "advice" "text",
    "tests_requested" "text",
    "follow_up_at" timestamp with time zone,
    "version" integer DEFAULT 1 NOT NULL,
    "supersedes_id" "uuid",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "prescriptions_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'issued'::"text", 'void'::"text"]))),
    CONSTRAINT "prescriptions_version_check" CHECK (("version" > 0))
);


ALTER TABLE "public"."prescriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."production_readiness_checks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "check_key" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "notes" "text",
    "evidence_at" timestamp with time zone,
    "updated_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "production_readiness_checks_check_key_check" CHECK (("check_key" = ANY (ARRAY['backup_export'::"text", 'restore_drill'::"text", 'pilot_booking'::"text", 'pilot_care_plan'::"text", 'pilot_follow_up'::"text", 'pilot_reminder'::"text", 'pilot_signoff'::"text"]))),
    CONSTRAINT "production_readiness_checks_notes_check" CHECK ((("notes" IS NULL) OR (("char_length"(TRIM(BOTH FROM "notes")) >= 3) AND ("char_length"(TRIM(BOTH FROM "notes")) <= 500)))),
    CONSTRAINT "production_readiness_checks_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'ready'::"text", 'blocked'::"text"])))
);


ALTER TABLE "public"."production_readiness_checks" OWNER TO "postgres";


COMMENT ON TABLE "public"."production_readiness_checks" IS 'Tenant-scoped owner evidence for backup, restore-drill and controlled clinic-pilot lifecycle gates.';



CREATE TABLE IF NOT EXISTS "public"."provider_departments" (
    "organization_id" "uuid" NOT NULL,
    "department_id" "uuid" NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "primary_department" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."provider_departments" OWNER TO "postgres";


COMMENT ON TABLE "public"."provider_departments" IS 'Tenant-safe provider-to-department assignments used by web and WhatsApp booking funnels.';



CREATE TABLE IF NOT EXISTS "public"."provider_location_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "effective_from" "date" DEFAULT CURRENT_DATE NOT NULL,
    "effective_to" "date",
    "booking_window_days" integer DEFAULT 60 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "provider_location_assignments_booking_window_days_check" CHECK ((("booking_window_days" >= 1) AND ("booking_window_days" <= 365))),
    CONSTRAINT "provider_location_assignments_check" CHECK ((("effective_to" IS NULL) OR ("effective_to" >= "effective_from")))
);


ALTER TABLE "public"."provider_location_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."provider_location_services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "assignment_id" "uuid" NOT NULL,
    "service_id" "uuid" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "duration_minutes" integer,
    "buffer_minutes" integer,
    "price_paise" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payment_mode" "text" DEFAULT 'pay_at_location'::"text" NOT NULL,
    "deposit_paise" integer,
    "allowed_payment_modes" "text"[] DEFAULT ARRAY['pay_at_location'::"text"] NOT NULL,
    CONSTRAINT "provider_location_services_allowed_payment_modes" CHECK ((("cardinality"("allowed_payment_modes") > 0) AND ("allowed_payment_modes" <@ ARRAY['pay_at_location'::"text", 'full_online'::"text", 'deposit_online'::"text"]) AND ("payment_mode" = ANY ("allowed_payment_modes")))),
    CONSTRAINT "provider_location_services_buffer_minutes_check" CHECK ((("buffer_minutes" >= 0) AND ("buffer_minutes" <= 240))),
    CONSTRAINT "provider_location_services_deposit" CHECK (((('deposit_online'::"text" = ANY ("allowed_payment_modes")) AND ("deposit_paise" IS NOT NULL) AND ("deposit_paise" > 0)) OR ((NOT ('deposit_online'::"text" = ANY ("allowed_payment_modes"))) AND ("deposit_paise" IS NULL)))),
    CONSTRAINT "provider_location_services_duration_minutes_check" CHECK ((("duration_minutes" >= 5) AND ("duration_minutes" <= 480))),
    CONSTRAINT "provider_location_services_payment_mode" CHECK (("payment_mode" = ANY (ARRAY['pay_at_location'::"text", 'full_online'::"text", 'deposit_online'::"text"]))),
    CONSTRAINT "provider_location_services_price_paise_check" CHECK (("price_paise" >= 0))
);


ALTER TABLE "public"."provider_location_services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."provider_profiles" (
    "resource_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "photo_path" "text",
    "specialization" "text",
    "qualifications" "text",
    "registration_number" "text",
    "experience_years" integer,
    "languages" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "biography" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "contact_phone" "text",
    "contact_email" "text",
    "queue_notifications_enabled" boolean DEFAULT false NOT NULL,
    "whatsapp_queue_consent_at" timestamp with time zone,
    "whatsapp_queue_consent_notice_version" "text",
    "whatsapp_queue_consent_recorded_by" "uuid",
    CONSTRAINT "provider_profiles_experience_years_check" CHECK ((("experience_years" IS NULL) OR (("experience_years" >= 0) AND ("experience_years" <= 80))))
);


ALTER TABLE "public"."provider_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quick_replies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."quick_replies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rag_knowledge_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "source_type" "text" DEFAULT 'faq'::"text" NOT NULL,
    "content" "text" NOT NULL,
    "status" "text" DEFAULT 'approved'::"text" NOT NULL,
    "language_code" "text" DEFAULT 'en'::"text" NOT NULL,
    "embedding_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rag_knowledge_items_content_check" CHECK ((("char_length"(TRIM(BOTH FROM "content")) >= 10) AND ("char_length"(TRIM(BOTH FROM "content")) <= 20000))),
    CONSTRAINT "rag_knowledge_items_embedding_status_check" CHECK (("embedding_status" = ANY (ARRAY['pending'::"text", 'indexed'::"text", 'failed'::"text"]))),
    CONSTRAINT "rag_knowledge_items_source_type_check" CHECK (("source_type" = ANY (ARRAY['faq'::"text", 'policy'::"text", 'service'::"text", 'clinical_guidance'::"text", 'business_info'::"text"]))),
    CONSTRAINT "rag_knowledge_items_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'approved'::"text", 'archived'::"text"]))),
    CONSTRAINT "rag_knowledge_items_title_check" CHECK ((("char_length"(TRIM(BOTH FROM "title")) >= 2) AND ("char_length"(TRIM(BOTH FROM "title")) <= 160)))
);


ALTER TABLE "public"."rag_knowledge_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "permissions" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."saas_billing_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "plan_id" "text" NOT NULL,
    "created_by" "uuid",
    "provider" "text" DEFAULT 'razorpay'::"text" NOT NULL,
    "provider_order_id" "text",
    "provider_payment_id" "text",
    "amount_paise" integer NOT NULL,
    "currency" "text" DEFAULT 'INR'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "receipt" "text" NOT NULL,
    "period_start" timestamp with time zone,
    "period_end" timestamp with time zone,
    "failure_reason" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "saas_billing_orders_amount_paise_check" CHECK (("amount_paise" > 0)),
    CONSTRAINT "saas_billing_orders_currency_check" CHECK (("currency" = 'INR'::"text")),
    CONSTRAINT "saas_billing_orders_provider_check" CHECK (("provider" = 'razorpay'::"text")),
    CONSTRAINT "saas_billing_orders_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'failed'::"text", 'refunded'::"text"])))
);


ALTER TABLE "public"."saas_billing_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."saas_invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "billing_order_id" "uuid" NOT NULL,
    "invoice_number" "text" NOT NULL,
    "plan_id" "text" NOT NULL,
    "subtotal_paise" integer NOT NULL,
    "tax_paise" integer DEFAULT 0 NOT NULL,
    "total_paise" integer NOT NULL,
    "currency" "text" DEFAULT 'INR'::"text" NOT NULL,
    "status" "text" DEFAULT 'paid'::"text" NOT NULL,
    "issued_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "period_start" timestamp with time zone NOT NULL,
    "period_end" timestamp with time zone NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "saas_invoices_currency_check" CHECK (("currency" = 'INR'::"text")),
    CONSTRAINT "saas_invoices_status_check" CHECK (("status" = ANY (ARRAY['paid'::"text", 'void'::"text", 'refunded'::"text"]))),
    CONSTRAINT "saas_invoices_subtotal_paise_check" CHECK (("subtotal_paise" > 0)),
    CONSTRAINT "saas_invoices_tax_paise_check" CHECK (("tax_paise" >= 0)),
    CONSTRAINT "saas_invoices_total_paise_check" CHECK (("total_paise" > 0))
);


ALTER TABLE "public"."saas_invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."saas_plans" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "monthly_price_paise" integer NOT NULL,
    "currency" "text" DEFAULT 'INR'::"text" NOT NULL,
    "max_locations" integer NOT NULL,
    "max_seats" integer NOT NULL,
    "conversations_quota" integer NOT NULL,
    "channels" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "features" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "saas_plans_conversations_quota_check" CHECK (("conversations_quota" >= 0)),
    CONSTRAINT "saas_plans_currency_check" CHECK (("currency" = 'INR'::"text")),
    CONSTRAINT "saas_plans_max_locations_check" CHECK (("max_locations" > 0)),
    CONSTRAINT "saas_plans_max_seats_check" CHECK (("max_seats" > 0)),
    CONSTRAINT "saas_plans_monthly_price_paise_check" CHECK (("monthly_price_paise" >= 0))
);


ALTER TABLE "public"."saas_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schedule_exceptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "resource_id" "uuid",
    "location_id" "uuid",
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "exception_type" "text" DEFAULT 'unavailable'::"text" NOT NULL,
    "reason" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "schedule_exceptions_check" CHECK (("ends_at" > "starts_at")),
    CONSTRAINT "schedule_exceptions_check1" CHECK ((("resource_id" IS NOT NULL) OR ("location_id" IS NOT NULL))),
    CONSTRAINT "schedule_exceptions_exception_type_check" CHECK (("exception_type" = ANY (ARRAY['unavailable'::"text", 'emergency'::"text", 'leave'::"text", 'holiday'::"text"]))),
    CONSTRAINT "schedule_exceptions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."schedule_exceptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."security_incident_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "incident_id" "uuid" NOT NULL,
    "actor_user_id" "uuid",
    "event_type" "text" NOT NULL,
    "from_status" "text",
    "to_status" "text",
    "safe_summary" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "security_incident_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['created'::"text", 'status_changed'::"text", 'ownership_changed'::"text", 'details_updated'::"text"]))),
    CONSTRAINT "security_incident_events_safe_summary_check" CHECK ((("char_length"(TRIM(BOTH FROM "safe_summary")) >= 2) AND ("char_length"(TRIM(BOTH FROM "safe_summary")) <= 500)))
);


ALTER TABLE "public"."security_incident_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."security_incidents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "reference" "text" DEFAULT ('INC-'::"text" || "upper"("substr"("replace"(("gen_random_uuid"())::"text", '-'::"text", ''::"text"), 1, 8))) NOT NULL,
    "severity" "text" NOT NULL,
    "category" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "safe_summary" "text" NOT NULL,
    "owner_user_id" "uuid",
    "containment_summary" "text",
    "resolution_summary" "text",
    "created_by" "uuid" NOT NULL,
    "updated_by" "uuid" NOT NULL,
    "contained_at" timestamp with time zone,
    "resolved_at" timestamp with time zone,
    "closed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "security_incidents_category_check" CHECK (("category" = ANY (ARRAY['unauthorized_access'::"text", 'data_exposure'::"text", 'credential_compromise'::"text", 'service_outage'::"text", 'provider_failure'::"text", 'suspicious_activity'::"text", 'other'::"text"]))),
    CONSTRAINT "security_incidents_check" CHECK ((("status" <> ALL (ARRAY['resolved'::"text", 'closed'::"text"])) OR ("resolution_summary" IS NOT NULL))),
    CONSTRAINT "security_incidents_check1" CHECK ((("status" <> 'closed'::"text") OR ("closed_at" IS NOT NULL))),
    CONSTRAINT "security_incidents_containment_summary_check" CHECK ((("containment_summary" IS NULL) OR (("char_length"(TRIM(BOTH FROM "containment_summary")) >= 5) AND ("char_length"(TRIM(BOTH FROM "containment_summary")) <= 1000)))),
    CONSTRAINT "security_incidents_resolution_summary_check" CHECK ((("resolution_summary" IS NULL) OR (("char_length"(TRIM(BOTH FROM "resolution_summary")) >= 5) AND ("char_length"(TRIM(BOTH FROM "resolution_summary")) <= 1000)))),
    CONSTRAINT "security_incidents_safe_summary_check" CHECK ((("char_length"(TRIM(BOTH FROM "safe_summary")) >= 5) AND ("char_length"(TRIM(BOTH FROM "safe_summary")) <= 1000))),
    CONSTRAINT "security_incidents_severity_check" CHECK (("severity" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'critical'::"text"]))),
    CONSTRAINT "security_incidents_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'contained'::"text", 'monitoring'::"text", 'resolved'::"text", 'closed'::"text"]))),
    CONSTRAINT "security_incidents_title_check" CHECK ((("char_length"(TRIM(BOTH FROM "title")) >= 5) AND ("char_length"(TRIM(BOTH FROM "title")) <= 160)))
);


ALTER TABLE "public"."security_incidents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "requested_by" "uuid" NOT NULL,
    "request_type" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "admin_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "service_requests_request_type_check" CHECK (("request_type" = ANY (ARRAY['mautic_provisioning'::"text", 'custom_automation'::"text", 'website_building'::"text"]))),
    CONSTRAINT "service_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'in_progress'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."service_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_audit_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "actor_user_id" "uuid",
    "subject_agent_id" "uuid",
    "event_type" "text" NOT NULL,
    "summary" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "team_audit_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['invitation_created'::"text", 'invitation_delivered'::"text", 'invitation_revoked'::"text", 'member_role_changed'::"text", 'member_deactivated'::"text", 'member_reactivated'::"text", 'production_readiness_updated'::"text"]))),
    CONSTRAINT "team_audit_events_summary_check" CHECK ((("char_length"(TRIM(BOTH FROM "summary")) >= 2) AND ("char_length"(TRIM(BOTH FROM "summary")) <= 240)))
);


ALTER TABLE "public"."team_audit_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."usage_metering" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "contact_address" "text" NOT NULL,
    "conversation_window_start" timestamp with time zone NOT NULL,
    "conversation_window_end" timestamp with time zone NOT NULL,
    "period_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."usage_metering" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "role_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."waitlist_offers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "waitlist_id" "uuid" NOT NULL,
    "service_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "message_id" "uuid",
    "appointment_id" "uuid",
    "responded_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "waitlist_offers_check" CHECK (("ends_at" > "starts_at")),
    CONSTRAINT "waitlist_offers_check1" CHECK (("expires_at" > "created_at")),
    CONSTRAINT "waitlist_offers_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text", 'expired'::"text", 'revoked'::"text"])))
);


ALTER TABLE "public"."waitlist_offers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."webhook_events" (
    "event_id" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "organization_id" "uuid",
    "processed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "webhook_events_provider_check" CHECK (("provider" = ANY (ARRAY['razorpay'::"text", 'meta'::"text", 'instagram'::"text", 'generic'::"text"])))
);


ALTER TABLE "public"."webhook_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."webhooks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "table_name" "public"."webhook_table" NOT NULL,
    "operations" "public"."webhook_operation"[] NOT NULL,
    "url" character varying NOT NULL,
    "token" character varying,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."webhooks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_acceptance_observations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "run_id" "uuid" NOT NULL,
    "source_message_id" "uuid" NOT NULL,
    "response_message_id" "uuid" NOT NULL,
    "observation_key" "text" NOT NULL,
    "safe_summary" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "whatsapp_acceptance_observations_observation_key_check" CHECK (("observation_key" = ANY (ARRAY['stop'::"text", 'start'::"text", 'menu'::"text", 'handoff'::"text"])))
);


ALTER TABLE "public"."whatsapp_acceptance_observations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_acceptance_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "run_id" "uuid" NOT NULL,
    "amount_paise" integer DEFAULT 100 NOT NULL,
    "currency" "text" DEFAULT 'INR'::"text" NOT NULL,
    "status" "text" DEFAULT 'created'::"text" NOT NULL,
    "provider_order_id" "text",
    "provider_payment_id" "text",
    "access_token_hash" "bytea" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "whatsapp_acceptance_payments_amount_paise_check" CHECK (("amount_paise" = 100)),
    CONSTRAINT "whatsapp_acceptance_payments_currency_check" CHECK (("currency" = 'INR'::"text")),
    CONSTRAINT "whatsapp_acceptance_payments_status_check" CHECK (("status" = ANY (ARRAY['created'::"text", 'paid'::"text", 'failed'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."whatsapp_acceptance_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_acceptance_test_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "run_id" "uuid" NOT NULL,
    "scenario_key" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "safe_summary" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "whatsapp_acceptance_test_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['claimed'::"text", 'passed'::"text", 'failed'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."whatsapp_acceptance_test_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_booking_consent_evidence" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "session_id" "uuid",
    "source_message_id" "uuid" NOT NULL,
    "notice_version" "text" NOT NULL,
    "notice_text" "text" NOT NULL,
    "action" "text" NOT NULL,
    "channel" "text" DEFAULT 'whatsapp'::"text" NOT NULL,
    "channel_identity_hash" "bytea" NOT NULL,
    "channel_identity_last4" "text" NOT NULL,
    "identity_verified_by_channel" boolean DEFAULT true NOT NULL,
    "captured_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "whatsapp_booking_consent_evidence_action_check" CHECK (("action" = ANY (ARRAY['accepted'::"text", 'declined'::"text"]))),
    CONSTRAINT "whatsapp_booking_consent_evidence_channel_check" CHECK (("channel" = 'whatsapp'::"text")),
    CONSTRAINT "whatsapp_booking_consent_evidence_channel_identity_last4_check" CHECK (("channel_identity_last4" ~ '^[0-9]{4}$'::"text"))
);


ALTER TABLE "public"."whatsapp_booking_consent_evidence" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_booking_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "session_id" "uuid",
    "conversation_id" "uuid",
    "appointment_id" "uuid",
    "patient_name" "text",
    "patient_phone" "text",
    "service_id" "uuid",
    "location_id" "uuid",
    "resource_id" "uuid",
    "starts_at" timestamp with time zone,
    "status" "text" DEFAULT 'collecting'::"text" NOT NULL,
    "decision_note" "text",
    "decided_by" "uuid",
    "decided_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "booking_consent_evidence_id" "uuid",
    CONSTRAINT "whatsapp_booking_requests_status_check" CHECK (("status" = ANY (ARRAY['collecting'::"text", 'pending_approval'::"text", 'confirmed'::"text", 'rejected'::"text", 'waitlisted'::"text", 'expired'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."whatsapp_booking_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_booking_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "contact_address" "text" NOT NULL,
    "state" "text" DEFAULT 'welcome'::"text" NOT NULL,
    "context" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_message_id" "uuid",
    "expires_at" timestamp with time zone DEFAULT ("now"() + '00:30:00'::interval) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."whatsapp_booking_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_booking_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "enabled" boolean DEFAULT false NOT NULL,
    "confirmation_mode" "text" DEFAULT 'instant'::"text" NOT NULL,
    "allow_secure_history" boolean DEFAULT true NOT NULL,
    "welcome_message" "text" DEFAULT 'Welcome. I can help you book an appointment, view an existing booking, or request human assistance.'::"text" NOT NULL,
    "session_timeout_minutes" integer DEFAULT 30 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "waitlist_offer_minutes" integer DEFAULT 30 NOT NULL,
    "patient_portal_base_url" "text" DEFAULT 'https://omnirelay-light.alam-kkhurshid.chatgpt.site'::"text" NOT NULL,
    CONSTRAINT "whatsapp_booking_settings_confirmation_mode_check" CHECK (("confirmation_mode" = ANY (ARRAY['instant'::"text", 'manual'::"text"]))),
    CONSTRAINT "whatsapp_booking_settings_patient_portal_url_check" CHECK (("patient_portal_base_url" ~ '^https://[^[:space:]]+$'::"text")),
    CONSTRAINT "whatsapp_booking_settings_session_timeout_minutes_check" CHECK ((("session_timeout_minutes" >= 5) AND ("session_timeout_minutes" <= 1440))),
    CONSTRAINT "whatsapp_booking_settings_waitlist_offer_minutes_check" CHECK ((("waitlist_offer_minutes" >= 5) AND ("waitlist_offer_minutes" <= 120)))
);


ALTER TABLE "public"."whatsapp_booking_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_concierge_dispatches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "message_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "request_id" bigint,
    "next_attempt_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_error" "text",
    "processed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "whatsapp_concierge_dispatches_attempts_check" CHECK ((("attempts" >= 0) AND ("attempts" <= 3))),
    CONSTRAINT "whatsapp_concierge_dispatches_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processed'::"text", 'exhausted'::"text"])))
);


ALTER TABLE "public"."whatsapp_concierge_dispatches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_preference_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "patient_id" "uuid",
    "conversation_id" "uuid" NOT NULL,
    "session_id" "uuid" NOT NULL,
    "source_message_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "channel" "text" DEFAULT 'whatsapp'::"text" NOT NULL,
    "identity_hash" "bytea" NOT NULL,
    "identity_last4" "text" NOT NULL,
    "care_communications_enabled" boolean NOT NULL,
    "marketing_enabled" boolean DEFAULT false NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "whatsapp_preference_events_action_check" CHECK (("action" = 'start'::"text")),
    CONSTRAINT "whatsapp_preference_events_channel_check" CHECK (("channel" = 'whatsapp'::"text")),
    CONSTRAINT "whatsapp_preference_events_identity_last4_check" CHECK (("char_length"("identity_last4") = 4))
);


ALTER TABLE "public"."whatsapp_preference_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."whatsapp_preference_events" IS 'Append-only evidence for verified WhatsApp communication preference commands.';



CREATE TABLE IF NOT EXISTS "public"."whatsapp_rate_cards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "channel" "text" DEFAULT 'whatsapp'::"text" NOT NULL,
    "country_code" "text" DEFAULT 'IN'::"text" NOT NULL,
    "message_category" "text" NOT NULL,
    "base_rate_paise" numeric(16,4) NOT NULL,
    "platform_fee_paise" numeric(16,4) DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'INR'::"text" NOT NULL,
    "source_url" "text" NOT NULL,
    "source_version" "text" NOT NULL,
    "effective_at" timestamp with time zone NOT NULL,
    "expires_at" timestamp with time zone,
    "active" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "verification_status" "text" DEFAULT 'draft'::"text" NOT NULL,
    CONSTRAINT "whatsapp_rate_card_active_requires_verification" CHECK (((NOT "active") OR ("verification_status" = 'verified'::"text"))),
    CONSTRAINT "whatsapp_rate_card_window" CHECK ((("expires_at" IS NULL) OR ("expires_at" > "effective_at"))),
    CONSTRAINT "whatsapp_rate_cards_base_rate_paise_check" CHECK (("base_rate_paise" >= (0)::numeric)),
    CONSTRAINT "whatsapp_rate_cards_channel_check" CHECK (("channel" = ANY (ARRAY['whatsapp'::"text", 'rcs'::"text", 'instagram'::"text"]))),
    CONSTRAINT "whatsapp_rate_cards_currency_check" CHECK (("currency" = 'INR'::"text")),
    CONSTRAINT "whatsapp_rate_cards_message_category_check" CHECK (("message_category" = ANY (ARRAY['utility'::"text", 'marketing'::"text", 'authentication'::"text", 'service'::"text"]))),
    CONSTRAINT "whatsapp_rate_cards_platform_fee_paise_check" CHECK (("platform_fee_paise" >= (0)::numeric)),
    CONSTRAINT "whatsapp_rate_cards_verification_status_check" CHECK (("verification_status" = ANY (ARRAY['draft'::"text", 'verified'::"text", 'retired'::"text"])))
);


ALTER TABLE "public"."whatsapp_rate_cards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_recovery_acceptance_fixtures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "run_id" "uuid" NOT NULL,
    "session_id" "uuid" NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "previous_expires_at" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'prepared'::"text" NOT NULL,
    "prepared_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "whatsapp_recovery_acceptance_fixtures_status_check" CHECK (("status" = ANY (ARRAY['prepared'::"text", 'passed'::"text", 'failed'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."whatsapp_recovery_acceptance_fixtures" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_sales_rag_dispatches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "message_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "source_document_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "classification" "text" DEFAULT 'pending'::"text" NOT NULL,
    "response_message_id" "uuid",
    "failure_reason" "text",
    "processed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "whatsapp_sales_rag_dispatches_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."whatsapp_sales_rag_dispatches" OWNER TO "postgres";


ALTER TABLE ONLY "billing"."accounts"
    ADD CONSTRAINT "accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "billing"."costs"
    ADD CONSTRAINT "costs_pkey" PRIMARY KEY ("provider", "product", "effective_at");



ALTER TABLE ONLY "billing"."invoices_items"
    ADD CONSTRAINT "invoices_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "billing"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "billing"."ledger"
    ADD CONSTRAINT "ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "billing"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "billing"."plans"
    ADD CONSTRAINT "plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "billing"."plans_products"
    ADD CONSTRAINT "plans_products_pkey" PRIMARY KEY ("plan_id", "product_id");



ALTER TABLE ONLY "billing"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "billing"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("organization_id");



ALTER TABLE ONLY "billing"."tiers"
    ADD CONSTRAINT "tiers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "billing"."tiers_products"
    ADD CONSTRAINT "tiers_products_pkey" PRIMARY KEY ("tier_id", "product_id");



ALTER TABLE ONLY "billing"."usage"
    ADD CONSTRAINT "usage_pkey" PRIMARY KEY ("organization_id", "product_id", "interval", "period");



ALTER TABLE ONLY "private"."ai_provider_state"
    ADD CONSTRAINT "ai_provider_state_pkey" PRIMARY KEY ("provider_config_key");



ALTER TABLE ONLY "private"."api_rate_limits"
    ADD CONSTRAINT "api_rate_limits_pkey" PRIMARY KEY ("actor_user_id", "bucket", "window_started_at");



ALTER TABLE ONLY "private"."booking_phone_otp_challenges"
    ADD CONSTRAINT "booking_phone_otp_challenges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "private"."customer_booking_access"
    ADD CONSTRAINT "customer_booking_access_booking_reference_key" UNIQUE ("booking_reference");



ALTER TABLE ONLY "private"."customer_booking_access"
    ADD CONSTRAINT "customer_booking_access_pkey" PRIMARY KEY ("appointment_id");



ALTER TABLE ONLY "private"."oem_audit_events"
    ADD CONSTRAINT "oem_audit_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "private"."patient_portal_sessions"
    ADD CONSTRAINT "patient_portal_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "private"."patient_portal_sessions"
    ADD CONSTRAINT "patient_portal_sessions_token_hash_key" UNIQUE ("token_hash");



ALTER TABLE ONLY "private"."platform_operators"
    ADD CONSTRAINT "platform_operators_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "private"."shadow_audit_records"
    ADD CONSTRAINT "shadow_audit_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "private"."shadow_audit_records"
    ADD CONSTRAINT "shadow_audit_records_run_id_question_id_key" UNIQUE ("run_id", "question_id");



ALTER TABLE ONLY "private"."shadow_evaluation_runs"
    ADD CONSTRAINT "shadow_evaluation_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "private"."whatsapp_booking_handoffs"
    ADD CONSTRAINT "whatsapp_booking_handoffs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "private"."whatsapp_booking_handoffs"
    ADD CONSTRAINT "whatsapp_booking_handoffs_token_hash_key" UNIQUE ("token_hash");



ALTER TABLE ONLY "public"."action_centre_assignments"
    ADD CONSTRAINT "action_centre_assignments_organization_id_item_kind_subject_key" UNIQUE ("organization_id", "item_kind", "subject_id");



ALTER TABLE ONLY "public"."action_centre_assignments"
    ADD CONSTRAINT "action_centre_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."action_centre_deployments"
    ADD CONSTRAINT "action_centre_deployments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agents"
    ADD CONSTRAINT "agents_organization_id_user_id_key" UNIQUE ("organization_id", "user_id");



ALTER TABLE ONLY "public"."agents"
    ADD CONSTRAINT "agents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_agent_channel_bindings"
    ADD CONSTRAINT "ai_agent_channel_bindings_organization_id_agent_role_servic_key" UNIQUE ("organization_id", "agent_role", "service", "organization_address");



ALTER TABLE ONLY "public"."ai_agent_channel_bindings"
    ADD CONSTRAINT "ai_agent_channel_bindings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_agent_conversation_state"
    ADD CONSTRAINT "ai_agent_conversation_state_pkey" PRIMARY KEY ("organization_id", "conversation_id", "agent_role");



ALTER TABLE ONLY "public"."ai_agent_dispatches"
    ADD CONSTRAINT "ai_agent_dispatches_message_id_key" UNIQUE ("message_id");



ALTER TABLE ONLY "public"."ai_agent_dispatches"
    ADD CONSTRAINT "ai_agent_dispatches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_agent_profiles"
    ADD CONSTRAINT "ai_agent_profiles_organization_id_role_key" UNIQUE ("organization_id", "role");



ALTER TABLE ONLY "public"."ai_agent_profiles"
    ADD CONSTRAINT "ai_agent_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_notifications"
    ADD CONSTRAINT "app_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."appointment_events"
    ADD CONSTRAINT "appointment_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."appointment_queue_entries"
    ADD CONSTRAINT "appointment_queue_entries_appointment_id_key" UNIQUE ("appointment_id");



ALTER TABLE ONLY "public"."appointment_queue_entries"
    ADD CONSTRAINT "appointment_queue_entries_organization_id_resource_id_locat_key" UNIQUE ("organization_id", "resource_id", "location_id", "queue_date", "token_number");



ALTER TABLE ONLY "public"."appointment_queue_entries"
    ADD CONSTRAINT "appointment_queue_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."appointment_waitlist"
    ADD CONSTRAINT "appointment_waitlist_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_resource_no_overlap" EXCLUDE USING "gist" ("resource_id" WITH =, "tstzrange"("starts_at", "ends_at", '[)'::"text") WITH &&) WHERE (("status" = ANY (ARRAY['pending'::"text", 'payment_pending'::"text", 'confirmed'::"text"])));



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."automation_recovery_events"
    ADD CONSTRAINT "automation_recovery_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."automation_rollout_reviews"
    ADD CONSTRAINT "automation_rollout_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."automation_runs"
    ADD CONSTRAINT "automation_runs_organization_id_idempotency_key_key" UNIQUE ("organization_id", "idempotency_key");



ALTER TABLE ONLY "public"."automation_runs"
    ADD CONSTRAINT "automation_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."automation_workflows"
    ADD CONSTRAINT "automation_workflows_organization_id_trigger_key_name_key" UNIQUE ("organization_id", "trigger_key", "name");



ALTER TABLE ONLY "public"."automation_workflows"
    ADD CONSTRAINT "automation_workflows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."availability_rules"
    ADD CONSTRAINT "availability_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."availability_rules"
    ADD CONSTRAINT "availability_rules_resource_id_location_id_weekday_start_ti_key" UNIQUE NULLS NOT DISTINCT ("resource_id", "location_id", "weekday", "start_time", "end_time");



ALTER TABLE ONLY "public"."billing_notice_events"
    ADD CONSTRAINT "billing_notice_events_organization_id_notice_type_channel_s_key" UNIQUE ("organization_id", "notice_type", "channel", "scheduled_for");



ALTER TABLE ONLY "public"."billing_notice_events"
    ADD CONSTRAINT "billing_notice_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."billing_webhook_events"
    ADD CONSTRAINT "billing_webhook_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."billing_webhook_events"
    ADD CONSTRAINT "billing_webhook_events_provider_event_id_key" UNIQUE ("provider_event_id");



ALTER TABLE ONLY "public"."booking_pages"
    ADD CONSTRAINT "booking_pages_pkey" PRIMARY KEY ("organization_id");



ALTER TABLE ONLY "public"."booking_pages"
    ADD CONSTRAINT "booking_pages_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."booking_payments"
    ADD CONSTRAINT "booking_payments_appointment_id_key" UNIQUE ("appointment_id");



ALTER TABLE ONLY "public"."booking_payments"
    ADD CONSTRAINT "booking_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_resources"
    ADD CONSTRAINT "booking_resources_id_organization_unique" UNIQUE ("id", "organization_id");



ALTER TABLE ONLY "public"."booking_resources"
    ADD CONSTRAINT "booking_resources_organization_id_name_key" UNIQUE ("organization_id", "name");



ALTER TABLE ONLY "public"."booking_resources"
    ADD CONSTRAINT "booking_resources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."business_locations"
    ADD CONSTRAINT "business_locations_organization_id_name_key" UNIQUE ("organization_id", "name");



ALTER TABLE ONLY "public"."business_locations"
    ADD CONSTRAINT "business_locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_events"
    ADD CONSTRAINT "campaign_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_recipients"
    ADD CONSTRAINT "campaign_recipients_campaign_id_patient_id_key" UNIQUE ("campaign_id", "patient_id");



ALTER TABLE ONLY "public"."campaign_recipients"
    ADD CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."care_reminder_runs"
    ADD CONSTRAINT "care_reminder_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."care_reminder_runs"
    ADD CONSTRAINT "care_reminder_runs_reminder_id_scheduled_for_key" UNIQUE ("reminder_id", "scheduled_for");



ALTER TABLE ONLY "public"."care_reminders"
    ADD CONSTRAINT "care_reminders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."channel_connections"
    ADD CONSTRAINT "channel_connections_organization_id_channel_provider_key" UNIQUE ("organization_id", "channel", "provider");



ALTER TABLE ONLY "public"."channel_connections"
    ADD CONSTRAINT "channel_connections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."channel_message_templates"
    ADD CONSTRAINT "channel_message_templates_organization_id_channel_event_typ_key" UNIQUE ("organization_id", "channel", "event_type", "language_code");



ALTER TABLE ONLY "public"."channel_message_templates"
    ADD CONSTRAINT "channel_message_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clinic_departments"
    ADD CONSTRAINT "clinic_departments_id_organization_id_key" UNIQUE ("id", "organization_id");



ALTER TABLE ONLY "public"."clinic_departments"
    ADD CONSTRAINT "clinic_departments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clinic_pilot_controls"
    ADD CONSTRAINT "clinic_pilot_controls_pkey" PRIMARY KEY ("organization_id");



ALTER TABLE ONLY "public"."communication_opt_outs"
    ADD CONSTRAINT "communication_opt_outs_organization_id_channel_address_scop_key" UNIQUE ("organization_id", "channel", "address", "scope");



ALTER TABLE ONLY "public"."communication_opt_outs"
    ADD CONSTRAINT "communication_opt_outs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contacts_addresses"
    ADD CONSTRAINT "contacts_addresses_pkey" PRIMARY KEY ("organization_id", "service", "address");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."device_push_deliveries"
    ADD CONSTRAINT "device_push_deliveries_notification_id_subscription_id_key" UNIQUE ("notification_id", "subscription_id");



ALTER TABLE ONLY "public"."device_push_deliveries"
    ADD CONSTRAINT "device_push_deliveries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."device_push_subscriptions"
    ADD CONSTRAINT "device_push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."device_push_subscriptions"
    ADD CONSTRAINT "device_push_subscriptions_user_id_endpoint_key" UNIQUE ("user_id", "endpoint");



ALTER TABLE ONLY "public"."doctor_import_jobs"
    ADD CONSTRAINT "doctor_import_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."doctor_queue_consent_events"
    ADD CONSTRAINT "doctor_queue_consent_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."doctor_queue_dispatches"
    ADD CONSTRAINT "doctor_queue_dispatches_organization_id_availability_rule_i_key" UNIQUE ("organization_id", "availability_rule_id", "shift_date");



ALTER TABLE ONLY "public"."doctor_queue_dispatches"
    ADD CONSTRAINT "doctor_queue_dispatches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."entitlements"
    ADD CONSTRAINT "entitlements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."eval_runs"
    ADD CONSTRAINT "eval_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."knowledge_bases"
    ADD CONSTRAINT "knowledge_bases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."knowledge_chunks"
    ADD CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."knowledge_documents"
    ADD CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."logs"
    ADD CONSTRAINT "logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."medicine_catalog_entries"
    ADD CONSTRAINT "medicine_catalog_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."medicine_catalog_entries"
    ADD CONSTRAINT "medicine_catalog_entries_release_id_entry_type_source_ident_key" UNIQUE ("release_id", "entry_type", "source_identifier");



ALTER TABLE ONLY "public"."medicine_catalog_releases"
    ADD CONSTRAINT "medicine_catalog_releases_package_sha256_key" UNIQUE ("package_sha256");



ALTER TABLE ONLY "public"."medicine_catalog_releases"
    ADD CONSTRAINT "medicine_catalog_releases_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."messages"
    ADD CONSTRAINT "messages_content_schema" CHECK ((("content" = '{}'::"jsonb") OR ((("content" ->> 'version'::"text") IS NOT NULL) AND (("content" ->> 'type'::"text") = ANY (ARRAY['text'::"text", 'file'::"text", 'data'::"text"])) AND (("content" ->> 'kind'::"text") IS NOT NULL)))) NOT VALID;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_external_id_key" UNIQUE ("external_id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."n8n_instances"
    ADD CONSTRAINT "n8n_instances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."n8n_template_registry"
    ADD CONSTRAINT "n8n_template_registry_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."n8n_template_registry"
    ADD CONSTRAINT "n8n_template_registry_template_id_key" UNIQUE ("template_id");



ALTER TABLE ONLY "public"."onboarding_profiles"
    ADD CONSTRAINT "onboarding_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."onboarding_tokens"
    ADD CONSTRAINT "onboarding_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."operational_billing_settings"
    ADD CONSTRAINT "operational_billing_settings_pkey" PRIMARY KEY ("organization_id");



ALTER TABLE ONLY "public"."operational_creative_reservations"
    ADD CONSTRAINT "operational_creative_reservations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."operational_creative_reservations"
    ADD CONSTRAINT "operational_creative_reservations_reference_id_key" UNIQUE ("reference_id");



ALTER TABLE ONLY "public"."operational_events"
    ADD CONSTRAINT "operational_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."operational_rate_card_audit"
    ADD CONSTRAINT "operational_rate_card_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."operational_reconciliation_runs"
    ADD CONSTRAINT "operational_reconciliation_ru_organization_id_period_start__key" UNIQUE ("organization_id", "period_start", "period_end");



ALTER TABLE ONLY "public"."operational_reconciliation_runs"
    ADD CONSTRAINT "operational_reconciliation_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."operational_statements"
    ADD CONSTRAINT "operational_statements_organization_id_period_start_period__key" UNIQUE ("organization_id", "period_start", "period_end");



ALTER TABLE ONLY "public"."operational_statements"
    ADD CONSTRAINT "operational_statements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."operational_topup_intents"
    ADD CONSTRAINT "operational_topup_intents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."operational_usage_events"
    ADD CONSTRAINT "operational_usage_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."operational_usage_events"
    ADD CONSTRAINT "operational_usage_events_source_type_source_id_key" UNIQUE ("source_type", "source_id");



ALTER TABLE ONLY "public"."operational_wallet_ledger"
    ADD CONSTRAINT "operational_wallet_ledger_organization_id_reference_type_re_key" UNIQUE ("organization_id", "reference_type", "reference_id", "entry_type");



ALTER TABLE ONLY "public"."operational_wallet_ledger"
    ADD CONSTRAINT "operational_wallet_ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."operational_wallets"
    ADD CONSTRAINT "operational_wallets_pkey" PRIMARY KEY ("organization_id");



ALTER TABLE ONLY "public"."organization_communication_controls"
    ADD CONSTRAINT "organization_communication_controls_pkey" PRIMARY KEY ("organization_id");



ALTER TABLE ONLY "public"."organization_services"
    ADD CONSTRAINT "organization_services_organization_id_name_key" UNIQUE ("organization_id", "name");



ALTER TABLE ONLY "public"."organization_services"
    ADD CONSTRAINT "organization_services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations_addresses"
    ADD CONSTRAINT "organizations_addresses_pkey" PRIMARY KEY ("organization_id", "address");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."patient_care_plans"
    ADD CONSTRAINT "patient_care_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."patient_care_tasks"
    ADD CONSTRAINT "patient_care_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."patient_consent_events"
    ADD CONSTRAINT "patient_consent_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."patient_data_request_events"
    ADD CONSTRAINT "patient_data_request_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."patient_data_requests"
    ADD CONSTRAINT "patient_data_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."patient_data_requests"
    ADD CONSTRAINT "patient_data_requests_reference_key" UNIQUE ("reference");



ALTER TABLE ONLY "public"."patient_documents"
    ADD CONSTRAINT "patient_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."patient_documents"
    ADD CONSTRAINT "patient_documents_storage_bucket_storage_path_key" UNIQUE ("storage_bucket", "storage_path");



ALTER TABLE ONLY "public"."patient_encounters"
    ADD CONSTRAINT "patient_encounters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."patient_guardian_links"
    ADD CONSTRAINT "patient_guardian_links_org_patient_normalized_phone_key" UNIQUE ("organization_id", "patient_id", "normalized_phone");



ALTER TABLE ONLY "public"."patient_guardian_links"
    ADD CONSTRAINT "patient_guardian_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."patient_identity_verification_events"
    ADD CONSTRAINT "patient_identity_verification_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."patient_identity_verification_events"
    ADD CONSTRAINT "patient_identity_verification_organization_id_conversation__key" UNIQUE ("organization_id", "conversation_id", "identity_hash");



ALTER TABLE ONLY "public"."patient_profiles"
    ADD CONSTRAINT "patient_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_gateway_connections"
    ADD CONSTRAINT "payment_gateway_connections_organization_id_provider_key" UNIQUE ("organization_id", "provider");



ALTER TABLE ONLY "public"."payment_gateway_connections"
    ADD CONSTRAINT "payment_gateway_connections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prescription_items"
    ADD CONSTRAINT "prescription_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_organization_id_prescription_number_key" UNIQUE ("organization_id", "prescription_number");



ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."production_readiness_checks"
    ADD CONSTRAINT "production_readiness_checks_organization_id_check_key_key" UNIQUE ("organization_id", "check_key");



ALTER TABLE ONLY "public"."production_readiness_checks"
    ADD CONSTRAINT "production_readiness_checks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."provider_departments"
    ADD CONSTRAINT "provider_departments_pkey" PRIMARY KEY ("department_id", "resource_id");



ALTER TABLE ONLY "public"."provider_location_assignments"
    ADD CONSTRAINT "provider_location_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."provider_location_assignments"
    ADD CONSTRAINT "provider_location_assignments_resource_id_location_id_key" UNIQUE ("resource_id", "location_id");



ALTER TABLE ONLY "public"."provider_location_services"
    ADD CONSTRAINT "provider_location_services_assignment_id_service_id_key" UNIQUE ("assignment_id", "service_id");



ALTER TABLE ONLY "public"."provider_location_services"
    ADD CONSTRAINT "provider_location_services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."provider_profiles"
    ADD CONSTRAINT "provider_profiles_pkey" PRIMARY KEY ("resource_id");



ALTER TABLE ONLY "public"."quick_replies"
    ADD CONSTRAINT "quick_replies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rag_knowledge_items"
    ADD CONSTRAINT "rag_knowledge_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reminder_events"
    ADD CONSTRAINT "reminder_events_appointment_id_event_type_channel_key" UNIQUE ("appointment_id", "event_type", "channel");



ALTER TABLE ONLY "public"."reminder_events"
    ADD CONSTRAINT "reminder_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saas_billing_orders"
    ADD CONSTRAINT "saas_billing_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saas_billing_orders"
    ADD CONSTRAINT "saas_billing_orders_provider_order_id_key" UNIQUE ("provider_order_id");



ALTER TABLE ONLY "public"."saas_billing_orders"
    ADD CONSTRAINT "saas_billing_orders_provider_payment_id_key" UNIQUE ("provider_payment_id");



ALTER TABLE ONLY "public"."saas_billing_orders"
    ADD CONSTRAINT "saas_billing_orders_receipt_key" UNIQUE ("receipt");



ALTER TABLE ONLY "public"."saas_invoices"
    ADD CONSTRAINT "saas_invoices_billing_order_id_key" UNIQUE ("billing_order_id");



ALTER TABLE ONLY "public"."saas_invoices"
    ADD CONSTRAINT "saas_invoices_invoice_number_key" UNIQUE ("invoice_number");



ALTER TABLE ONLY "public"."saas_invoices"
    ADD CONSTRAINT "saas_invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saas_plans"
    ADD CONSTRAINT "saas_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schedule_exceptions"
    ADD CONSTRAINT "schedule_exceptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."security_incident_events"
    ADD CONSTRAINT "security_incident_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."security_incidents"
    ADD CONSTRAINT "security_incidents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."security_incidents"
    ADD CONSTRAINT "security_incidents_reference_key" UNIQUE ("reference");



ALTER TABLE ONLY "public"."service_requests"
    ADD CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_audit_events"
    ADD CONSTRAINT "team_audit_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."entitlements"
    ADD CONSTRAINT "unique_org_entitlement" UNIQUE ("organization_id");



ALTER TABLE ONLY "public"."onboarding_profiles"
    ADD CONSTRAINT "unique_org_onboarding" UNIQUE ("organization_id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "unique_user_org_role" UNIQUE ("user_id", "organization_id", "role_id");



ALTER TABLE ONLY "public"."usage_metering"
    ADD CONSTRAINT "usage_metering_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."waitlist_offers"
    ADD CONSTRAINT "waitlist_offers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webhook_events"
    ADD CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("event_id");



ALTER TABLE ONLY "public"."webhooks"
    ADD CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_acceptance_observations"
    ADD CONSTRAINT "whatsapp_acceptance_observations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_acceptance_observations"
    ADD CONSTRAINT "whatsapp_acceptance_observations_run_id_observation_key_key" UNIQUE ("run_id", "observation_key");



ALTER TABLE ONLY "public"."whatsapp_acceptance_payments"
    ADD CONSTRAINT "whatsapp_acceptance_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_acceptance_payments"
    ADD CONSTRAINT "whatsapp_acceptance_payments_provider_order_id_key" UNIQUE ("provider_order_id");



ALTER TABLE ONLY "public"."whatsapp_acceptance_payments"
    ADD CONSTRAINT "whatsapp_acceptance_payments_run_id_key" UNIQUE ("run_id");



ALTER TABLE ONLY "public"."whatsapp_acceptance_test_events"
    ADD CONSTRAINT "whatsapp_acceptance_test_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_acceptance_test_runs"
    ADD CONSTRAINT "whatsapp_acceptance_test_runs_organization_id_scenario_key_key" UNIQUE ("organization_id", "scenario_key");



ALTER TABLE ONLY "public"."whatsapp_acceptance_test_runs"
    ADD CONSTRAINT "whatsapp_acceptance_test_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_booking_acceptance_checks"
    ADD CONSTRAINT "whatsapp_booking_acceptance_check_organization_id_check_key_key" UNIQUE ("organization_id", "check_key");



ALTER TABLE ONLY "public"."whatsapp_booking_acceptance_checks"
    ADD CONSTRAINT "whatsapp_booking_acceptance_checks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_booking_consent_evidence"
    ADD CONSTRAINT "whatsapp_booking_consent_evid_organization_id_source_messag_key" UNIQUE ("organization_id", "source_message_id");



ALTER TABLE ONLY "public"."whatsapp_booking_consent_evidence"
    ADD CONSTRAINT "whatsapp_booking_consent_evidence_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_booking_requests"
    ADD CONSTRAINT "whatsapp_booking_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_booking_sessions"
    ADD CONSTRAINT "whatsapp_booking_sessions_organization_id_conversation_id_key" UNIQUE ("organization_id", "conversation_id");



ALTER TABLE ONLY "public"."whatsapp_booking_sessions"
    ADD CONSTRAINT "whatsapp_booking_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_booking_settings"
    ADD CONSTRAINT "whatsapp_booking_settings_organization_id_key" UNIQUE ("organization_id");



ALTER TABLE ONLY "public"."whatsapp_booking_settings"
    ADD CONSTRAINT "whatsapp_booking_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_concierge_dispatches"
    ADD CONSTRAINT "whatsapp_concierge_dispatches_message_id_key" UNIQUE ("message_id");



ALTER TABLE ONLY "public"."whatsapp_concierge_dispatches"
    ADD CONSTRAINT "whatsapp_concierge_dispatches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_preference_events"
    ADD CONSTRAINT "whatsapp_preference_events_organization_id_source_message_i_key" UNIQUE ("organization_id", "source_message_id", "action");



ALTER TABLE ONLY "public"."whatsapp_preference_events"
    ADD CONSTRAINT "whatsapp_preference_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_rate_cards"
    ADD CONSTRAINT "whatsapp_rate_cards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_recovery_acceptance_fixtures"
    ADD CONSTRAINT "whatsapp_recovery_acceptance_fix_organization_id_session_id_key" UNIQUE ("organization_id", "session_id");



ALTER TABLE ONLY "public"."whatsapp_recovery_acceptance_fixtures"
    ADD CONSTRAINT "whatsapp_recovery_acceptance_fixtures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_recovery_acceptance_fixtures"
    ADD CONSTRAINT "whatsapp_recovery_acceptance_fixtures_run_id_key" UNIQUE ("run_id");



ALTER TABLE ONLY "public"."whatsapp_sales_rag_dispatches"
    ADD CONSTRAINT "whatsapp_sales_rag_dispatches_message_id_key" UNIQUE ("message_id");



ALTER TABLE ONLY "public"."whatsapp_sales_rag_dispatches"
    ADD CONSTRAINT "whatsapp_sales_rag_dispatches_pkey" PRIMARY KEY ("id");



CREATE INDEX "invoices_items_invoice_id_idx" ON "billing"."invoices_items" USING "btree" ("invoice_id");



CREATE INDEX "invoices_organization_id_idx" ON "billing"."invoices" USING "btree" ("organization_id");



CREATE INDEX "ledger_created_at_idx" ON "billing"."ledger" USING "btree" ("created_at");



CREATE INDEX "ledger_organization_id_idx" ON "billing"."ledger" USING "btree" ("organization_id");



CREATE INDEX "payments_invoice_id_idx" ON "billing"."payments" USING "btree" ("invoice_id");



CREATE INDEX "payments_organization_id_idx" ON "billing"."payments" USING "btree" ("organization_id");



CREATE INDEX "api_rate_limits_updated_at_idx" ON "private"."api_rate_limits" USING "btree" ("updated_at");



CREATE INDEX "booking_phone_otp_phone_created_idx" ON "private"."booking_phone_otp_challenges" USING "btree" ("organization_id", "phone_hash", "created_at" DESC);



CREATE INDEX "oem_audit_events_actor_time_idx" ON "private"."oem_audit_events" USING "btree" ("actor_user_id", "created_at" DESC);



CREATE UNIQUE INDEX "patient_portal_sessions_access_token_idx" ON "private"."patient_portal_sessions" USING "btree" ("access_token_hash") WHERE ("access_token_hash" IS NOT NULL);



CREATE INDEX "patient_portal_sessions_active_idx" ON "private"."patient_portal_sessions" USING "btree" ("expires_at") WHERE ("revoked_at" IS NULL);



CREATE INDEX "patient_portal_sessions_patient_idx" ON "private"."patient_portal_sessions" USING "btree" ("organization_id", "patient_id", "expires_at" DESC);



CREATE INDEX "shadow_audit_provider_model_created_idx" ON "private"."shadow_audit_records" USING "btree" ("provider", "model_name", "created_at" DESC);



CREATE INDEX "shadow_audit_tenant_created_idx" ON "private"."shadow_audit_records" USING "btree" ("tenant_id", "created_at" DESC);



CREATE INDEX "whatsapp_booking_handoffs_expiry_idx" ON "private"."whatsapp_booking_handoffs" USING "btree" ("expires_at") WHERE ("consumed_at" IS NULL);



CREATE INDEX "action_centre_assignments_org_status_idx" ON "public"."action_centre_assignments" USING "btree" ("organization_id", "status", "updated_at" DESC);



CREATE INDEX "action_centre_deployments_org_time_idx" ON "public"."action_centre_deployments" USING "btree" ("organization_id", "created_at" DESC);



CREATE UNIQUE INDEX "active_operational_rate_card_per_category" ON "public"."whatsapp_rate_cards" USING "btree" ("channel", "country_code", "message_category") WHERE "active";



CREATE UNIQUE INDEX "agents_pending_invitation_email_idx" ON "public"."agents" USING "btree" ("organization_id", "lower"((("extra" -> 'invitation'::"text") ->> 'email'::"text"))) WHERE (("ai" = false) AND ("user_id" IS NULL) AND ((("extra" -> 'invitation'::"text") ->> 'status'::"text") = 'pending'::"text"));



CREATE INDEX "agents_user_id_idx" ON "public"."agents" USING "btree" ("user_id");



CREATE INDEX "ai_agent_channel_bindings_active_idx" ON "public"."ai_agent_channel_bindings" USING "btree" ("organization_id", "service", "organization_address") WHERE ("delivery_mode" = ANY (ARRAY['shadow'::"text", 'live'::"text"]));



CREATE INDEX "ai_agent_dispatches_org_created_idx" ON "public"."ai_agent_dispatches" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "api_keys_organization_idx" ON "public"."api_keys" USING "btree" ("organization_id");



CREATE UNIQUE INDEX "app_notifications_open_booking_action_idx" ON "public"."app_notifications" USING "btree" ("recipient_user_id", "entity_type", "entity_id") WHERE (("read_at" IS NULL) AND ("entity_type" = 'whatsapp_booking_request'::"text"));



CREATE INDEX "app_notifications_org_time_idx" ON "public"."app_notifications" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "app_notifications_priority_unread_idx" ON "public"."app_notifications" USING "btree" ("recipient_user_id", "priority", "escalation_level" DESC, "created_at" DESC) WHERE ("read_at" IS NULL);



CREATE INDEX "app_notifications_recipient_unread_idx" ON "public"."app_notifications" USING "btree" ("recipient_user_id", "created_at" DESC) WHERE ("read_at" IS NULL);



CREATE INDEX "appointment_queue_session_idx" ON "public"."appointment_queue_entries" USING "btree" ("organization_id", "resource_id", "location_id", "queue_date", "queue_status", "token_number");



CREATE INDEX "appointment_waitlist_booking_request_idx" ON "public"."appointment_waitlist" USING "btree" ("booking_request_id") WHERE ("booking_request_id" IS NOT NULL);



CREATE INDEX "appointment_waitlist_location_idx" ON "public"."appointment_waitlist" USING "btree" ("location_id") WHERE ("location_id" IS NOT NULL);



CREATE INDEX "appointment_waitlist_patient_idx" ON "public"."appointment_waitlist" USING "btree" ("patient_id") WHERE ("patient_id" IS NOT NULL);



CREATE INDEX "appointment_waitlist_queue_idx" ON "public"."appointment_waitlist" USING "btree" ("organization_id", "status", "preferred_date", "priority", "created_at");



CREATE INDEX "appointment_waitlist_resource_idx" ON "public"."appointment_waitlist" USING "btree" ("resource_id") WHERE ("resource_id" IS NOT NULL);



CREATE INDEX "appointment_waitlist_service_idx" ON "public"."appointment_waitlist" USING "btree" ("service_id");



CREATE INDEX "appointments_emergency_doctor_scope_idx" ON "public"."appointments" USING "btree" ("organization_id", "resource_id", "starts_at") WHERE ("status" = ANY (ARRAY['pending'::"text", 'payment_pending'::"text", 'confirmed'::"text", 'arrived'::"text", 'rescheduling_required'::"text"]));



CREATE INDEX "appointments_org_follow_up" ON "public"."appointments" USING "btree" ("organization_id", "follow_up_at") WHERE ("follow_up_at" IS NOT NULL);



CREATE INDEX "appointments_org_start_idx" ON "public"."appointments" USING "btree" ("organization_id", "starts_at");



CREATE INDEX "appointments_patient_start_idx" ON "public"."appointments" USING "btree" ("patient_id", "starts_at" DESC);



CREATE INDEX "appointments_payment_holds" ON "public"."appointments" USING "btree" ("resource_id", "hold_expires_at") WHERE ("status" = 'payment_pending'::"text");



CREATE INDEX "automation_recovery_events_org_time_idx" ON "public"."automation_recovery_events" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "automation_rollout_reviews_org_time_idx" ON "public"."automation_rollout_reviews" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "automation_runs_due_idx" ON "public"."automation_runs" USING "btree" ("status", "next_attempt_at") WHERE ("status" = ANY (ARRAY['queued'::"text", 'retrying'::"text"]));



CREATE INDEX "automation_runs_message_idx" ON "public"."automation_runs" USING "btree" ("observed_message_id") WHERE ("observed_message_id" IS NOT NULL);



CREATE INDEX "automation_runs_org_created_idx" ON "public"."automation_runs" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "automation_runs_source_idx" ON "public"."automation_runs" USING "btree" ("organization_id", "source_type", "source_id");



CREATE INDEX "automation_workflows_org_status_idx" ON "public"."automation_workflows" USING "btree" ("organization_id", "status", "trigger_key");



CREATE INDEX "availability_resource_weekday_idx" ON "public"."availability_rules" USING "btree" ("resource_id", "weekday") WHERE "active";



CREATE INDEX "availability_rules_chamber_lookup" ON "public"."availability_rules" USING "btree" ("resource_id", "location_id", "weekday", "active");



CREATE INDEX "billing_notice_events_org_idx" ON "public"."billing_notice_events" USING "btree" ("organization_id", "scheduled_for" DESC);



CREATE INDEX "booking_payments_org_status" ON "public"."booking_payments" USING "btree" ("organization_id", "status", "created_at" DESC);



CREATE INDEX "business_locations_organization_idx" ON "public"."business_locations" USING "btree" ("organization_id", "active");



CREATE INDEX "campaign_recipients_campaign_status_idx" ON "public"."campaign_recipients" USING "btree" ("campaign_id", "status");



CREATE INDEX "campaigns_org_status_schedule_idx" ON "public"."campaigns" USING "btree" ("organization_id", "status", "scheduled_for");



CREATE INDEX "care_reminder_runs_adherence_attention_idx" ON "public"."care_reminder_runs" USING "btree" ("organization_id", "response_kind", "response_received_at" DESC) WHERE ("response_kind" = ANY (ARRAY['missed'::"text", 'help'::"text"]));



CREATE INDEX "care_reminder_runs_dispatch_idx" ON "public"."care_reminder_runs" USING "btree" ("status", "next_attempt_at", "scheduled_for") WHERE ("status" = ANY (ARRAY['approved'::"text", 'failed'::"text"]));



CREATE INDEX "care_reminder_runs_org_status_scheduled_idx" ON "public"."care_reminder_runs" USING "btree" ("organization_id", "status", "scheduled_for");



CREATE INDEX "care_reminder_runs_patient_adherence_idx" ON "public"."care_reminder_runs" USING "btree" ("organization_id", "patient_id", "response_received_at" DESC) WHERE ("response_kind" IS NOT NULL);



CREATE INDEX "care_reminder_runs_provider_message_idx" ON "public"."care_reminder_runs" USING "btree" ("provider_message_id") WHERE ("provider_message_id" IS NOT NULL);



CREATE UNIQUE INDEX "care_reminder_runs_response_message_idx" ON "public"."care_reminder_runs" USING "btree" ("response_message_id") WHERE ("response_message_id" IS NOT NULL);



CREATE INDEX "care_reminder_runs_terminal_failure_idx" ON "public"."care_reminder_runs" USING "btree" ("reminder_id", "updated_at" DESC) WHERE ("status" = 'failed'::"text");



CREATE UNIQUE INDEX "care_reminders_care_plan_idx" ON "public"."care_reminders" USING "btree" ("care_plan_id") WHERE ("care_plan_id" IS NOT NULL);



CREATE INDEX "care_reminders_org_next_run_idx" ON "public"."care_reminders" USING "btree" ("organization_id", "status", "next_run_at");



CREATE INDEX "care_reminders_patient_created_idx" ON "public"."care_reminders" USING "btree" ("patient_id", "created_at" DESC);



CREATE INDEX "clinic_departments_active_order_idx" ON "public"."clinic_departments" USING "btree" ("organization_id", "active", "sort_order", "name");



CREATE UNIQUE INDEX "clinic_departments_org_name_unique" ON "public"."clinic_departments" USING "btree" ("organization_id", "lower"("name"));



CREATE INDEX "communication_opt_outs_lookup_idx" ON "public"."communication_opt_outs" USING "btree" ("organization_id", "channel", "address");



CREATE INDEX "contacts_addresses_bsuid_idx" ON "public"."contacts_addresses" USING "btree" ((("extra" ->> 'bsuid'::"text"))) WHERE ("service" = 'whatsapp'::"public"."service");



CREATE INDEX "contacts_addresses_contact_id_idx" ON "public"."contacts_addresses" USING "btree" ("contact_id");



CREATE INDEX "contacts_addresses_phone_number_idx" ON "public"."contacts_addresses" USING "btree" ((("extra" ->> 'phone_number'::"text"))) WHERE ("service" = 'whatsapp'::"public"."service");



CREATE INDEX "contacts_addresses_replaced_by_bsuid_idx" ON "public"."contacts_addresses" USING "btree" ((("extra" ->> 'replaced_by_bsuid'::"text"))) WHERE ("service" = 'whatsapp'::"public"."service");



CREATE INDEX "contacts_organization_id_idx" ON "public"."contacts" USING "btree" ("organization_id");



CREATE INDEX "conversations_contact_address_idx" ON "public"."conversations" USING "btree" ("contact_address");



CREATE INDEX "conversations_group_address_idx" ON "public"."conversations" USING "btree" ("group_address");



CREATE INDEX "conversations_organization_address_idx" ON "public"."conversations" USING "btree" ("organization_address");



CREATE INDEX "conversations_organization_id_idx" ON "public"."conversations" USING "btree" ("organization_id");



CREATE INDEX "conversations_updated_at_idx" ON "public"."conversations" USING "btree" ("updated_at");



CREATE INDEX "device_push_deliveries_claim_idx" ON "public"."device_push_deliveries" USING "btree" ("next_attempt_at", "created_at") WHERE ("status" = 'queued'::"text");



CREATE INDEX "device_push_subscriptions_active_recipient_idx" ON "public"."device_push_subscriptions" USING "btree" ("organization_id", "user_id", "updated_at" DESC) WHERE ("status" = 'active'::"text");



CREATE INDEX "doctor_import_jobs_org_time_idx" ON "public"."doctor_import_jobs" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "doctor_queue_consent_events_org_resource_idx" ON "public"."doctor_queue_consent_events" USING "btree" ("organization_id", "resource_id", "recorded_at" DESC);



CREATE INDEX "doctor_queue_dispatches_due_idx" ON "public"."doctor_queue_dispatches" USING "btree" ("status", "scheduled_for", "next_attempt_at") WHERE ("status" = ANY (ARRAY['scheduled'::"text", 'failed'::"text"]));



CREATE INDEX "doctor_queue_dispatches_message_idx" ON "public"."doctor_queue_dispatches" USING "btree" ("message_id") WHERE ("message_id" IS NOT NULL);



CREATE INDEX "doctor_queue_dispatches_org_idx" ON "public"."doctor_queue_dispatches" USING "btree" ("organization_id", "shift_date" DESC);



CREATE INDEX "doctor_queue_dispatches_provider_message_idx" ON "public"."doctor_queue_dispatches" USING "btree" ("provider_message_id") WHERE ("provider_message_id" IS NOT NULL);



CREATE INDEX "doctor_queue_dispatches_resource_idx" ON "public"."doctor_queue_dispatches" USING "btree" ("resource_id");



CREATE INDEX "doctor_queue_dispatches_rule_idx" ON "public"."doctor_queue_dispatches" USING "btree" ("availability_rule_id");



CREATE INDEX "idx_logs_created_at" ON "public"."logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_logs_organization_id_address" ON "public"."logs" USING "btree" ("organization_id", "organization_address");



CREATE INDEX "idx_usage_metering_active_window" ON "public"."usage_metering" USING "btree" ("organization_id", "contact_address", "conversation_window_end");



CREATE INDEX "knowledge_chunks_embedding_cosine_idx" ON "public"."knowledge_chunks" USING "ivfflat" ("embedding" "public"."vector_cosine_ops") WITH ("lists"='100');



CREATE INDEX "knowledge_chunks_embedding_idx" ON "public"."knowledge_chunks" USING "hnsw" ("embedding" "public"."vector_cosine_ops");



CREATE INDEX "knowledge_chunks_org_document_idx" ON "public"."knowledge_chunks" USING "btree" ("organization_id", "document_id");



CREATE INDEX "knowledge_chunks_org_document_revision_idx" ON "public"."knowledge_chunks" USING "btree" ("organization_id", "document_id", "source_updated_at");



CREATE INDEX "medicine_catalog_entries_display_prefix_idx" ON "public"."medicine_catalog_entries" USING "btree" ("lower"("display_name") "text_pattern_ops") WHERE ("status" = 'active'::"text");



CREATE INDEX "medicine_catalog_entries_generic_prefix_idx" ON "public"."medicine_catalog_entries" USING "btree" ("lower"("generic_name") "text_pattern_ops") WHERE (("status" = 'active'::"text") AND ("generic_name" IS NOT NULL));



CREATE INDEX "medicine_catalog_entries_release_status_idx" ON "public"."medicine_catalog_entries" USING "btree" ("release_id", "status", "entry_type");



CREATE INDEX "medicine_catalog_entries_search_trgm_idx" ON "public"."medicine_catalog_entries" USING "gin" ("search_text" "extensions"."gin_trgm_ops");



CREATE INDEX "medicine_catalog_entries_source_idx" ON "public"."medicine_catalog_entries" USING "btree" ("source_identifier");



CREATE INDEX "medicine_catalog_releases_status_date_idx" ON "public"."medicine_catalog_releases" USING "btree" ("status", "release_date" DESC);



CREATE INDEX "messages_conversation_id_idx" ON "public"."messages" USING "btree" ("conversation_id");



CREATE INDEX "messages_org_conv_timestamp_idx" ON "public"."messages" USING "btree" ("organization_id", "conversation_id", "timestamp" DESC);



CREATE INDEX "messages_organization_id_idx" ON "public"."messages" USING "btree" ("organization_id");



CREATE INDEX "messages_timestamp_idx" ON "public"."messages" USING "btree" ("timestamp");



CREATE INDEX "messages_updated_at_idx" ON "public"."messages" USING "btree" ("updated_at");



CREATE INDEX "operational_events_org_time_idx" ON "public"."operational_events" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "operational_events_unresolved_idx" ON "public"."operational_events" USING "btree" ("severity", "created_at" DESC) WHERE ("resolved_at" IS NULL);



CREATE UNIQUE INDEX "operational_events_whatsapp_message_failure_idx" ON "public"."operational_events" USING "btree" ((("metadata" ->> 'message_id'::"text"))) WHERE (("event_source" = 'whatsapp_delivery'::"text") AND ("metadata" ? 'message_id'::"text"));



CREATE INDEX "operational_usage_events_org_time_idx" ON "public"."operational_usage_events" USING "btree" ("organization_id", "occurred_at" DESC);



CREATE UNIQUE INDEX "operational_usage_provider_message_unique" ON "public"."operational_usage_events" USING "btree" ("provider_message_id") WHERE ("provider_message_id" IS NOT NULL);



CREATE INDEX "operational_wallet_ledger_org_time_idx" ON "public"."operational_wallet_ledger" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "organization_services_organization_idx" ON "public"."organization_services" USING "btree" ("organization_id", "active");



CREATE INDEX "organizations_addresses_phone_number_idx" ON "public"."organizations_addresses" USING "btree" ((("extra" ->> 'phone_number'::"text"))) WHERE ("service" = 'whatsapp'::"public"."service");



CREATE INDEX "organizations_addresses_waba_id_idx" ON "public"."organizations_addresses" USING "btree" ((("extra" ->> 'waba_id'::"text"))) WHERE ("service" = 'whatsapp'::"public"."service");



CREATE INDEX "patient_care_plans_assignee_idx" ON "public"."patient_care_plans" USING "btree" ("organization_id", "assigned_to", "status") WHERE ("assigned_to" IS NOT NULL);



CREATE INDEX "patient_care_plans_org_status_review_idx" ON "public"."patient_care_plans" USING "btree" ("organization_id", "status", "next_review_at");



CREATE INDEX "patient_care_plans_patient_created_idx" ON "public"."patient_care_plans" USING "btree" ("patient_id", "created_at" DESC);



CREATE UNIQUE INDEX "patient_care_tasks_appointment_follow_up_unique" ON "public"."patient_care_tasks" USING "btree" ("appointment_id", "task_type") WHERE (("appointment_id" IS NOT NULL) AND ("task_type" = 'follow_up'::"text"));



CREATE INDEX "patient_care_tasks_assignee_queue_idx" ON "public"."patient_care_tasks" USING "btree" ("assigned_to", "status", "due_at") WHERE (("assigned_to" IS NOT NULL) AND ("status" = ANY (ARRAY['open'::"text", 'in_progress'::"text"])));



CREATE UNIQUE INDEX "patient_care_tasks_care_plan_idx" ON "public"."patient_care_tasks" USING "btree" ("care_plan_id") WHERE ("care_plan_id" IS NOT NULL);



CREATE INDEX "patient_care_tasks_org_queue_idx" ON "public"."patient_care_tasks" USING "btree" ("organization_id", "status", "due_at") WHERE ("status" = ANY (ARRAY['open'::"text", 'in_progress'::"text"]));



CREATE INDEX "patient_care_tasks_patient_time_idx" ON "public"."patient_care_tasks" USING "btree" ("organization_id", "patient_id", "created_at" DESC);



CREATE INDEX "patient_consent_events_patient_time_idx" ON "public"."patient_consent_events" USING "btree" ("organization_id", "patient_id", "captured_at" DESC);



CREATE INDEX "patient_data_request_events_request_idx" ON "public"."patient_data_request_events" USING "btree" ("request_id", "created_at" DESC);



CREATE INDEX "patient_data_requests_org_status_idx" ON "public"."patient_data_requests" USING "btree" ("organization_id", "status", "created_at" DESC);



CREATE INDEX "patient_data_requests_patient_idx" ON "public"."patient_data_requests" USING "btree" ("organization_id", "patient_id", "created_at" DESC);



CREATE INDEX "patient_documents_org_patient_created_idx" ON "public"."patient_documents" USING "btree" ("organization_id", "patient_id", "created_at" DESC);



CREATE UNIQUE INDEX "patient_encounters_appointment_unique" ON "public"."patient_encounters" USING "btree" ("appointment_id") WHERE ("appointment_id" IS NOT NULL);



CREATE INDEX "patient_encounters_org_follow_up_idx" ON "public"."patient_encounters" USING "btree" ("organization_id", "follow_up_at") WHERE (("follow_up_at" IS NOT NULL) AND ("follow_up_status" = ANY (ARRAY['scheduled'::"text", 'due'::"text"])));



CREATE INDEX "patient_encounters_org_patient_time_idx" ON "public"."patient_encounters" USING "btree" ("organization_id", "patient_id", "occurred_at" DESC);



CREATE INDEX "patient_guardian_links_lookup_idx" ON "public"."patient_guardian_links" USING "btree" ("organization_id", "regexp_replace"("guardian_phone", '[^0-9]'::"text", ''::"text", 'g'::"text"));



CREATE INDEX "patient_identity_verification_org_time_idx" ON "public"."patient_identity_verification_events" USING "btree" ("organization_id", "verified_at" DESC);



CREATE UNIQUE INDEX "patient_profiles_org_email_unique" ON "public"."patient_profiles" USING "btree" ("organization_id", "lower"("email")) WHERE ("email" IS NOT NULL);



CREATE INDEX "patient_profiles_org_last_seen_idx" ON "public"."patient_profiles" USING "btree" ("organization_id", "last_seen_at" DESC);



CREATE UNIQUE INDEX "patient_profiles_org_normalized_phone_unique" ON "public"."patient_profiles" USING "btree" ("organization_id", "normalized_phone") WHERE ("normalized_phone" IS NOT NULL);



CREATE INDEX "prescription_items_catalog_entry_idx" ON "public"."prescription_items" USING "btree" ("catalog_entry_id") WHERE ("catalog_entry_id" IS NOT NULL);



CREATE INDEX "prescription_items_prescription_order_idx" ON "public"."prescription_items" USING "btree" ("prescription_id", "sort_order");



CREATE INDEX "prescriptions_org_patient_issued_idx" ON "public"."prescriptions" USING "btree" ("organization_id", "patient_id", "issued_at" DESC);



CREATE INDEX "production_readiness_checks_org_idx" ON "public"."production_readiness_checks" USING "btree" ("organization_id", "check_key");



CREATE INDEX "provider_departments_resource_idx" ON "public"."provider_departments" USING "btree" ("organization_id", "resource_id", "primary_department");



CREATE INDEX "provider_location_assignments_lookup" ON "public"."provider_location_assignments" USING "btree" ("organization_id", "resource_id", "location_id", "active");



CREATE INDEX "provider_location_services_lookup" ON "public"."provider_location_services" USING "btree" ("assignment_id", "service_id", "active");



CREATE INDEX "provider_profiles_organization_idx" ON "public"."provider_profiles" USING "btree" ("organization_id");



CREATE INDEX "quick_replies_organization_idx" ON "public"."quick_replies" USING "btree" ("organization_id");



CREATE INDEX "rag_knowledge_items_org_status_idx" ON "public"."rag_knowledge_items" USING "btree" ("organization_id", "status", "updated_at" DESC);



CREATE INDEX "reminder_events_dispatch" ON "public"."reminder_events" USING "btree" ("channel", "status", "scheduled_for") WHERE ("status" = ANY (ARRAY['scheduled'::"text", 'processing'::"text"]));



CREATE INDEX "reminder_events_due_dispatch" ON "public"."reminder_events" USING "btree" ("scheduled_for", "next_attempt_at") WHERE (("channel" = 'whatsapp'::"text") AND ("status" = 'scheduled'::"text"));



CREATE INDEX "reminder_events_provider_message" ON "public"."reminder_events" USING "btree" ("provider_message_id") WHERE ("provider_message_id" IS NOT NULL);



CREATE INDEX "saas_billing_orders_org_created_idx" ON "public"."saas_billing_orders" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "saas_billing_orders_pending_idx" ON "public"."saas_billing_orders" USING "btree" ("created_at") WHERE ("status" = 'pending'::"text");



CREATE INDEX "saas_invoices_org_issued_idx" ON "public"."saas_invoices" USING "btree" ("organization_id", "issued_at" DESC);



CREATE INDEX "schedule_exceptions_location_idx" ON "public"."schedule_exceptions" USING "btree" ("location_id");



CREATE INDEX "schedule_exceptions_resource_idx" ON "public"."schedule_exceptions" USING "btree" ("resource_id");



CREATE INDEX "schedule_exceptions_scope_idx" ON "public"."schedule_exceptions" USING "btree" ("organization_id", "resource_id", "location_id", "starts_at", "ends_at") WHERE ("status" = 'active'::"text");



CREATE INDEX "security_incident_events_incident_time_idx" ON "public"."security_incident_events" USING "btree" ("incident_id", "created_at" DESC);



CREATE INDEX "security_incidents_org_status_idx" ON "public"."security_incidents" USING "btree" ("organization_id", "status", "severity", "created_at" DESC);



CREATE INDEX "team_audit_events_org_time_idx" ON "public"."team_audit_events" USING "btree" ("organization_id", "created_at" DESC);



CREATE UNIQUE INDEX "waitlist_offers_one_pending_slot_idx" ON "public"."waitlist_offers" USING "btree" ("organization_id", "resource_id", "starts_at", "ends_at") WHERE ("status" = 'pending'::"text");



CREATE INDEX "waitlist_offers_org_status_idx" ON "public"."waitlist_offers" USING "btree" ("organization_id", "status", "expires_at");



CREATE INDEX "waitlist_offers_waitlist_idx" ON "public"."waitlist_offers" USING "btree" ("waitlist_id", "created_at" DESC);



CREATE INDEX "webhooks_organization_idx" ON "public"."webhooks" USING "btree" ("organization_id");



CREATE INDEX "whatsapp_acceptance_observations_org_time_idx" ON "public"."whatsapp_acceptance_observations" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "whatsapp_acceptance_test_events_org_time_idx" ON "public"."whatsapp_acceptance_test_events" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "whatsapp_acceptance_test_runs_org_status_idx" ON "public"."whatsapp_acceptance_test_runs" USING "btree" ("organization_id", "status", "updated_at" DESC);



CREATE INDEX "whatsapp_booking_acceptance_org_status_idx" ON "public"."whatsapp_booking_acceptance_checks" USING "btree" ("organization_id", "status", "updated_at" DESC);



CREATE INDEX "whatsapp_booking_consent_org_time_idx" ON "public"."whatsapp_booking_consent_evidence" USING "btree" ("organization_id", "captured_at" DESC);



CREATE INDEX "whatsapp_booking_requests_org_status_idx" ON "public"."whatsapp_booking_requests" USING "btree" ("organization_id", "status", "created_at" DESC);



CREATE INDEX "whatsapp_booking_sessions_expiry_idx" ON "public"."whatsapp_booking_sessions" USING "btree" ("expires_at");



CREATE INDEX "whatsapp_concierge_dispatches_org_time_idx" ON "public"."whatsapp_concierge_dispatches" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "whatsapp_concierge_dispatches_retry_idx" ON "public"."whatsapp_concierge_dispatches" USING "btree" ("status", "next_attempt_at") WHERE ("status" = 'pending'::"text");



CREATE INDEX "whatsapp_preference_events_org_time_idx" ON "public"."whatsapp_preference_events" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "whatsapp_recovery_acceptance_fixtures_org_time_idx" ON "public"."whatsapp_recovery_acceptance_fixtures" USING "btree" ("organization_id", "prepared_at" DESC);



CREATE INDEX "whatsapp_sales_rag_dispatches_org_created_idx" ON "public"."whatsapp_sales_rag_dispatches" USING "btree" ("organization_id", "created_at" DESC);



CREATE OR REPLACE TRIGGER "a_guard_billing_ledger_product" BEFORE INSERT ON "billing"."ledger" FOR EACH ROW EXECUTE FUNCTION "billing"."guard_ledger_insert"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "billing"."accounts" FOR EACH ROW EXECUTE FUNCTION "public"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "billing"."costs" FOR EACH ROW EXECUTE FUNCTION "public"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "billing"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "billing"."invoices_items" FOR EACH ROW EXECUTE FUNCTION "public"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "billing"."ledger" FOR EACH ROW EXECUTE FUNCTION "public"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "billing"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "billing"."plans" FOR EACH ROW EXECUTE FUNCTION "public"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "billing"."plans_products" FOR EACH ROW EXECUTE FUNCTION "public"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "billing"."products" FOR EACH ROW EXECUTE FUNCTION "public"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "billing"."subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "billing"."tiers" FOR EACH ROW EXECUTE FUNCTION "public"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "billing"."tiers_products" FOR EACH ROW EXECUTE FUNCTION "public"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "billing"."usage" FOR EACH ROW EXECUTE FUNCTION "public"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "update_billing_ledger_usage" AFTER INSERT ON "billing"."ledger" FOR EACH ROW EXECUTE FUNCTION "billing"."process_ledger_entry"();



CREATE OR REPLACE TRIGGER "00_enforce_public_booking_rate_limit" BEFORE INSERT ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "private"."enforce_public_booking_rate_limit"();



CREATE OR REPLACE TRIGGER "appointments_schedule_exception_guard" BEFORE INSERT OR UPDATE OF "starts_at", "ends_at", "status", "resource_id", "location_id" ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_schedule_exception"();



CREATE OR REPLACE TRIGGER "audit_patient_data_request" AFTER INSERT OR UPDATE ON "public"."patient_data_requests" FOR EACH ROW EXECUTE FUNCTION "private"."audit_patient_data_request"();



CREATE OR REPLACE TRIGGER "audit_security_incident_change" AFTER INSERT OR UPDATE ON "public"."security_incidents" FOR EACH ROW EXECUTE FUNCTION "private"."audit_security_incident_change"();



CREATE OR REPLACE TRIGGER "authorize_prescription_medication_schedule" BEFORE INSERT ON "public"."care_reminders" FOR EACH ROW EXECUTE FUNCTION "private"."authorize_prescription_medication_schedule"();



CREATE OR REPLACE TRIGGER "capture_care_reminder_response" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "private"."capture_care_reminder_response"();



CREATE OR REPLACE TRIGGER "capture_whatsapp_delivery_failure" AFTER INSERT OR UPDATE OF "status" ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "private"."capture_whatsapp_delivery_failure"();



CREATE OR REPLACE TRIGGER "capture_whatsapp_opt_out_after_message" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "private"."capture_whatsapp_opt_out"();



CREATE OR REPLACE TRIGGER "check_billing_conversation_limit" BEFORE INSERT ON "public"."conversations" FOR EACH ROW EXECUTE FUNCTION "billing"."check_product_limit"();



CREATE OR REPLACE TRIGGER "check_billing_message_limit" BEFORE INSERT ON "public"."messages" FOR EACH ROW WHEN (("new"."timestamp" >= ("now"() - '00:00:10'::interval))) EXECUTE FUNCTION "billing"."check_product_limit"();



CREATE OR REPLACE TRIGGER "cleanup_orphaned_contact_on_sync" AFTER UPDATE ON "public"."contacts_addresses" FOR EACH ROW WHEN ((("old"."contact_id" IS NOT NULL) AND ("new"."contact_id" IS NULL) AND ((("new"."extra" -> 'synced'::"text") ->> 'action'::"text") = 'remove'::"text"))) EXECUTE FUNCTION "public"."cleanup_orphaned_contact_on_sync"();



CREATE OR REPLACE TRIGGER "cleanup_unlinked_address_if_empty" AFTER UPDATE ON "public"."contacts_addresses" FOR EACH ROW WHEN ((("old"."contact_id" IS NOT NULL) AND ("new"."contact_id" IS NULL) AND ((("new"."extra" -> 'synced'::"text") ->> 'action'::"text") IS DISTINCT FROM 'add'::"text"))) EXECUTE FUNCTION "public"."cleanup_unlinked_address_if_empty"();



CREATE OR REPLACE TRIGGER "enforce_assignee_task_update" BEFORE UPDATE ON "public"."patient_care_tasks" FOR EACH ROW EXECUTE FUNCTION "private"."enforce_assignee_task_update"();



CREATE OR REPLACE TRIGGER "escalate_failed_care_plan_reminder" AFTER INSERT OR UPDATE OF "status", "attempt_count" ON "public"."care_reminder_runs" FOR EACH ROW EXECUTE FUNCTION "private"."escalate_failed_care_plan_reminder"();



CREATE OR REPLACE TRIGGER "handle_incoming_message_to_agent" AFTER INSERT ON "public"."messages" FOR EACH ROW WHEN ((("new"."direction" = 'incoming'::"public"."direction") AND (("new"."status" ->> 'pending'::"text") IS NOT NULL))) EXECUTE FUNCTION "public"."edge_function"('/agent-client', 'post');



CREATE OR REPLACE TRIGGER "handle_mark_as_read_to_dispatcher" AFTER UPDATE ON "public"."messages" FOR EACH ROW WHEN ((("new"."direction" = 'incoming'::"public"."direction") AND ("new"."service" <> 'local'::"public"."service") AND ((("old"."status" ->> 'read'::"text") <> ("new"."status" ->> 'read'::"text")) OR (("old"."status" ->> 'typing'::"text") <> ("new"."status" ->> 'typing'::"text"))) AND (("new"."status" ->> 'pending'::"text") IS NOT NULL))) EXECUTE FUNCTION "public"."dispatcher_edge_function"();



CREATE OR REPLACE TRIGGER "handle_message_to_media_preprocessor" AFTER INSERT ON "public"."messages" FOR EACH ROW WHEN (((("new"."direction" = 'outgoing'::"public"."direction") OR ("new"."direction" = 'incoming'::"public"."direction")) AND (("new"."status" ->> 'pending'::"text") IS NOT NULL) AND (("new"."content" ->> 'type'::"text") = 'file'::"text"))) EXECUTE FUNCTION "public"."edge_function"('/media-preprocessor', 'post');



CREATE OR REPLACE TRIGGER "handle_new_conversation" BEFORE INSERT ON "public"."conversations" FOR EACH ROW EXECUTE FUNCTION "public"."before_insert_on_conversations"();



CREATE OR REPLACE TRIGGER "handle_new_invitation" BEFORE INSERT ON "public"."agents" FOR EACH ROW WHEN ((("new"."ai" = false) AND (("new"."extra" -> 'invitation'::"text") IS NOT NULL))) EXECUTE FUNCTION "public"."lookup_user_id_by_email_before_insert_on_agents"();



CREATE OR REPLACE TRIGGER "handle_new_message" BEFORE INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."before_insert_on_messages"();



CREATE OR REPLACE TRIGGER "handle_new_organization" AFTER INSERT ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."after_insert_on_organizations"();



CREATE OR REPLACE TRIGGER "handle_outgoing_message_to_dispatcher" AFTER INSERT ON "public"."messages" FOR EACH ROW WHEN ((("new"."direction" = 'outgoing'::"public"."direction") AND ("new"."timestamp" <= "now"()) AND (("new"."status" ->> 'pending'::"text") IS NOT NULL))) EXECUTE FUNCTION "public"."dispatcher_edge_function"();



CREATE OR REPLACE TRIGGER "initialize_billing_subscription" AFTER INSERT ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "billing"."initialize_subscription"();



CREATE OR REPLACE TRIGGER "initialize_booking_defaults" AFTER INSERT ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "private"."initialize_booking_defaults"();



CREATE OR REPLACE TRIGGER "initialize_omnirelay_workspace" AFTER INSERT ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "private"."initialize_omnirelay_workspace"();



CREATE OR REPLACE TRIGGER "initialize_operational_billing_workspace" AFTER INSERT ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "private"."initialize_operational_billing_workspace"();



CREATE OR REPLACE TRIGGER "invoke_whatsapp_agent_harness_shadow" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "private"."invoke_whatsapp_agent_harness"();



CREATE OR REPLACE TRIGGER "invoke_whatsapp_booking_concierge" AFTER INSERT ON "public"."messages" FOR EACH ROW WHEN ((("new"."direction" = 'incoming'::"public"."direction") AND ("new"."service" = 'whatsapp'::"public"."service"))) EXECUTE FUNCTION "private"."invoke_whatsapp_booking_concierge"();



CREATE OR REPLACE TRIGGER "invoke_whatsapp_sales_rag" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "private"."invoke_whatsapp_sales_rag"();



CREATE OR REPLACE TRIGGER "issue_saas_invoice_after_payment" AFTER UPDATE OF "status" ON "public"."saas_billing_orders" FOR EACH ROW EXECUTE FUNCTION "private"."issue_saas_invoice_after_payment"();



CREATE OR REPLACE TRIGGER "link_booking_request_consent_after_change" AFTER INSERT OR UPDATE OF "appointment_id" ON "public"."whatsapp_booking_requests" FOR EACH ROW EXECUTE FUNCTION "private"."link_booking_request_consent"();



CREATE OR REPLACE TRIGGER "manage_contact_on_address_sync" BEFORE INSERT OR UPDATE ON "public"."contacts_addresses" FOR EACH ROW WHEN ((("new"."extra" -> 'synced'::"text") IS NOT NULL)) EXECUTE FUNCTION "public"."manage_contact_on_address_sync"();



CREATE OR REPLACE TRIGGER "normalize_patient_care_plan" BEFORE INSERT OR UPDATE ON "public"."patient_care_plans" FOR EACH ROW EXECUTE FUNCTION "private"."normalize_patient_care_plan"();



CREATE OR REPLACE TRIGGER "normalize_patient_care_task" BEFORE INSERT OR UPDATE ON "public"."patient_care_tasks" FOR EACH ROW EXECUTE FUNCTION "private"."normalize_patient_care_task"();



CREATE OR REPLACE TRIGGER "normalize_patient_follow_up" BEFORE INSERT OR UPDATE ON "public"."patient_encounters" FOR EACH ROW EXECUTE FUNCTION "private"."mark_due_patient_follow_ups"();



CREATE OR REPLACE TRIGGER "notify_patient_care_task" AFTER INSERT OR UPDATE OF "assigned_to", "status" ON "public"."patient_care_tasks" FOR EACH ROW EXECUTE FUNCTION "private"."notify_patient_care_task"();



CREATE OR REPLACE TRIGGER "notify_whatsapp_booking_action" AFTER INSERT OR UPDATE OF "status" ON "public"."whatsapp_booking_requests" FOR EACH ROW EXECUTE FUNCTION "private"."notify_whatsapp_booking_action"();



CREATE OR REPLACE TRIGGER "observe_abandoned_recovery_acceptance_after_message" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "private"."observe_abandoned_recovery_acceptance"();



CREATE OR REPLACE TRIGGER "observe_appointment_reminder_automation" AFTER INSERT ON "public"."reminder_events" FOR EACH ROW EXECUTE FUNCTION "private"."observe_appointment_reminder_automation"();



CREATE OR REPLACE TRIGGER "observe_care_reminder_automation" AFTER INSERT ON "public"."care_reminder_runs" FOR EACH ROW EXECUTE FUNCTION "private"."observe_care_reminder_automation"();



CREATE OR REPLACE TRIGGER "observe_doctor_queue_automation" AFTER INSERT ON "public"."doctor_queue_dispatches" FOR EACH ROW EXECUTE FUNCTION "private"."observe_doctor_queue_automation"();



CREATE OR REPLACE TRIGGER "observe_emergency_recipient_automation" AFTER INSERT ON "public"."campaign_recipients" FOR EACH ROW EXECUTE FUNCTION "private"."observe_emergency_recipient_automation"();



CREATE OR REPLACE TRIGGER "observe_pilot_appointment_automation" AFTER UPDATE OF "status", "starts_at", "location_id", "resource_id" ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "private"."observe_pilot_appointment_automation"();



CREATE OR REPLACE TRIGGER "observe_pilot_appointment_insert" AFTER INSERT ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "private"."observe_pilot_appointment_insert"();



CREATE OR REPLACE TRIGGER "observe_shadow_campaign_usage" AFTER INSERT OR UPDATE OF "status", "provider_message_id" ON "public"."campaign_recipients" FOR EACH ROW EXECUTE FUNCTION "private"."observe_shadow_campaign_usage"();



CREATE OR REPLACE TRIGGER "observe_shadow_doctor_queue_usage" AFTER INSERT OR UPDATE OF "status", "provider_message_id" ON "public"."doctor_queue_dispatches" FOR EACH ROW EXECUTE FUNCTION "private"."observe_shadow_doctor_queue_usage"();



CREATE OR REPLACE TRIGGER "observe_shadow_reminder_usage" AFTER INSERT OR UPDATE OF "status", "provider_message_id" ON "public"."reminder_events" FOR EACH ROW EXECUTE FUNCTION "private"."observe_shadow_reminder_usage"();



CREATE OR REPLACE TRIGGER "observe_whatsapp_command_acceptance_after_message" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "private"."observe_whatsapp_command_acceptance"();



CREATE OR REPLACE TRIGGER "offer_released_appointment_slot" AFTER UPDATE OF "status", "starts_at", "ends_at", "resource_id", "location_id", "service_id" ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "private"."offer_released_appointment_slot"();



CREATE OR REPLACE TRIGGER "patient_profiles_capture_consent" AFTER INSERT OR UPDATE OF "care_communications_consent", "marketing_consent" ON "public"."patient_profiles" FOR EACH ROW EXECUTE FUNCTION "private"."capture_patient_consent_changes"();



CREATE OR REPLACE TRIGGER "pause_conversation_on_human_message" AFTER INSERT ON "public"."messages" FOR EACH ROW WHEN ((("new"."direction" = 'outgoing'::"public"."direction") AND ("new"."service" <> 'local'::"public"."service") AND ("new"."timestamp" <= "now"()) AND ("new"."timestamp" >= ("now"() - '00:00:10'::interval)))) EXECUTE FUNCTION "public"."pause_conversation_on_human_message"();



CREATE OR REPLACE TRIGGER "prepare_patient_data_request_update" BEFORE UPDATE ON "public"."patient_data_requests" FOR EACH ROW EXECUTE FUNCTION "private"."prepare_patient_data_request_update"();



CREATE OR REPLACE TRIGGER "prepare_security_incident_update" BEFORE UPDATE ON "public"."security_incidents" FOR EACH ROW EXECUTE FUNCTION "private"."prepare_security_incident_update"();



CREATE OR REPLACE TRIGGER "preserve_direction" BEFORE UPDATE ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."preserve_message_direction"();



CREATE OR REPLACE TRIGGER "prevent_last_owner_deletion_before_delete" BEFORE DELETE ON "public"."agents" FOR EACH ROW WHEN ((("old"."ai" = false) AND (("old"."extra" ->> 'role'::"text") = 'owner'::"text"))) EXECUTE FUNCTION "public"."prevent_last_owner_deletion"();



CREATE OR REPLACE TRIGGER "prevent_last_owner_deletion_before_update" BEFORE UPDATE ON "public"."agents" FOR EACH ROW WHEN ((("new"."ai" = false) AND (("old"."extra" ->> 'role'::"text") = 'owner'::"text") AND (("new"."extra" ->> 'role'::"text") <> 'owner'::"text"))) EXECUTE FUNCTION "public"."prevent_last_owner_deletion"();



CREATE OR REPLACE TRIGGER "prevent_patient_identity_verification_mutation" BEFORE DELETE OR UPDATE ON "public"."patient_identity_verification_events" FOR EACH ROW EXECUTE FUNCTION "private"."prevent_evidence_mutation"();



CREATE OR REPLACE TRIGGER "prevent_whatsapp_booking_consent_mutation" BEFORE DELETE OR UPDATE ON "public"."whatsapp_booking_consent_evidence" FOR EACH ROW EXECUTE FUNCTION "private"."prevent_evidence_mutation"();



CREATE OR REPLACE TRIGGER "queue_device_push_deliveries" AFTER INSERT ON "public"."app_notifications" FOR EACH ROW EXECUTE FUNCTION "private"."queue_device_push_deliveries"();



CREATE OR REPLACE TRIGGER "reconcile_automation_message_delivery" AFTER INSERT OR UPDATE OF "status" ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "private"."reconcile_automation_message_delivery"();



CREATE OR REPLACE TRIGGER "reconcile_deposit_acceptance_payment" AFTER UPDATE OF "status" ON "public"."booking_payments" FOR EACH ROW EXECUTE FUNCTION "private"."reconcile_deposit_acceptance_payment"();



CREATE OR REPLACE TRIGGER "reconcile_isolated_acceptance_payment" AFTER UPDATE OF "status" ON "public"."whatsapp_acceptance_payments" FOR EACH ROW EXECUTE FUNCTION "private"."reconcile_isolated_acceptance_payment"();



CREATE OR REPLACE TRIGGER "redact_dispatched_booking_otp" BEFORE UPDATE OF "external_id" ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "private"."redact_dispatched_booking_otp"();



CREATE OR REPLACE TRIGGER "refresh_automation_workflow_health" AFTER INSERT OR UPDATE OF "status", "delivery_status" ON "public"."automation_runs" FOR EACH ROW EXECUTE FUNCTION "private"."refresh_automation_workflow_health"();



CREATE OR REPLACE TRIGGER "refresh_campaign_counts_after_recipient" AFTER INSERT OR DELETE OR UPDATE ON "public"."campaign_recipients" FOR EACH ROW EXECUTE FUNCTION "private"."refresh_campaign_counts"();



CREATE OR REPLACE TRIGGER "set_extra" BEFORE UPDATE ON "public"."agents" FOR EACH ROW WHEN (("new"."extra" IS NOT NULL)) EXECUTE FUNCTION "public"."merge_update"('extra');



CREATE OR REPLACE TRIGGER "set_extra" BEFORE UPDATE ON "public"."contacts" FOR EACH ROW WHEN (("new"."extra" IS NOT NULL)) EXECUTE FUNCTION "public"."merge_update"('extra');



CREATE OR REPLACE TRIGGER "set_extra" BEFORE UPDATE ON "public"."contacts_addresses" FOR EACH ROW WHEN (("new"."extra" IS NOT NULL)) EXECUTE FUNCTION "public"."merge_update"('extra');



CREATE OR REPLACE TRIGGER "set_extra" BEFORE UPDATE ON "public"."conversations" FOR EACH ROW WHEN (("new"."extra" IS NOT NULL)) EXECUTE FUNCTION "public"."merge_update"('extra');



CREATE OR REPLACE TRIGGER "set_extra" BEFORE UPDATE ON "public"."organizations" FOR EACH ROW WHEN (("new"."extra" IS NOT NULL)) EXECUTE FUNCTION "public"."merge_update"('extra');



CREATE OR REPLACE TRIGGER "set_extra" BEFORE UPDATE ON "public"."organizations_addresses" FOR EACH ROW WHEN (("new"."extra" IS NOT NULL)) EXECUTE FUNCTION "public"."merge_update"('extra');



CREATE OR REPLACE TRIGGER "set_message" BEFORE UPDATE ON "public"."messages" FOR EACH ROW WHEN (("new"."content" IS NOT NULL)) EXECUTE FUNCTION "public"."merge_update"('content');



CREATE OR REPLACE TRIGGER "set_status" BEFORE UPDATE ON "public"."messages" FOR EACH ROW WHEN (("new"."status" IS NOT NULL)) EXECUTE FUNCTION "public"."merge_update"('status');



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."agents" FOR EACH ROW EXECUTE FUNCTION "public"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."api_keys" FOR EACH ROW EXECUTE FUNCTION "public"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."contacts" FOR EACH ROW EXECUTE FUNCTION "public"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."contacts_addresses" FOR EACH ROW EXECUTE FUNCTION "public"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."conversations" FOR EACH ROW EXECUTE FUNCTION "public"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."organizations_addresses" FOR EACH ROW EXECUTE FUNCTION "public"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."quick_replies" FOR EACH ROW EXECUTE FUNCTION "public"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."webhooks" FOR EACH ROW EXECUTE FUNCTION "public"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "sync_campaign_delivery_after_message" AFTER INSERT OR UPDATE OF "status", "external_id" ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "private"."sync_campaign_delivery_status"();



CREATE OR REPLACE TRIGGER "sync_care_plan_patient_reminder" AFTER UPDATE OF "status", "next_review_at" ON "public"."patient_care_plans" FOR EACH ROW EXECUTE FUNCTION "private"."sync_care_plan_patient_reminder"();



CREATE OR REPLACE TRIGGER "sync_care_plan_review_task" AFTER INSERT OR UPDATE OF "title", "goal", "instructions", "status", "next_review_at", "assigned_to", "encounter_id" ON "public"."patient_care_plans" FOR EACH ROW EXECUTE FUNCTION "private"."sync_care_plan_review_task"();



CREATE OR REPLACE TRIGGER "sync_care_reminder_delivery_status" AFTER INSERT OR UPDATE OF "status", "external_id" ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "private"."sync_care_reminder_delivery_status"();



CREATE OR REPLACE TRIGGER "sync_doctor_queue_dispatch_from_message" AFTER INSERT OR UPDATE OF "external_id", "status" ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "private"."sync_doctor_queue_dispatch_from_message"();



CREATE OR REPLACE TRIGGER "sync_patient_after_appointment" AFTER INSERT OR UPDATE OF "customer_name", "customer_phone", "customer_email", "patient_age", "patient_date_of_birth", "booking_contact_name", "booking_contact_phone", "patient_relationship", "health_concern", "patient_locality", "patient_pincode", "patient_summary", "care_communications_consent", "marketing_consent" ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "private"."sync_patient_appointment_trigger"();



CREATE OR REPLACE TRIGGER "sync_reminder_event_from_message" AFTER UPDATE OF "external_id", "status" ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "private"."sync_reminder_event_from_message"();



CREATE OR REPLACE TRIGGER "update_billing_conversation_usage" AFTER INSERT OR DELETE ON "public"."conversations" FOR EACH ROW EXECUTE FUNCTION "billing"."update_product_usage"();



CREATE OR REPLACE TRIGGER "update_billing_message_usage" AFTER INSERT ON "public"."messages" FOR EACH ROW WHEN (("new"."timestamp" >= ("now"() - '00:00:10'::interval))) EXECUTE FUNCTION "billing"."update_product_usage"();



CREATE OR REPLACE TRIGGER "update_billing_message_usage_on_delete" AFTER DELETE ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "billing"."update_product_usage"();



CREATE OR REPLACE TRIGGER "validate_chamber_availability_before_write" BEFORE INSERT OR UPDATE ON "public"."availability_rules" FOR EACH ROW EXECUTE FUNCTION "private"."validate_chamber_availability"();



CREATE OR REPLACE TRIGGER "z_enforce_invitation_status_flow" BEFORE UPDATE ON "public"."agents" FOR EACH ROW WHEN (("new"."ai" = false)) EXECUTE FUNCTION "public"."enforce_invitation_status_flow"();



CREATE OR REPLACE TRIGGER "z_notify_webhook_contacts" AFTER INSERT OR UPDATE ON "public"."contacts" FOR EACH ROW EXECUTE FUNCTION "public"."notify_webhook"();



CREATE OR REPLACE TRIGGER "z_notify_webhook_contacts_addresses" AFTER INSERT OR UPDATE ON "public"."contacts_addresses" FOR EACH ROW EXECUTE FUNCTION "public"."notify_webhook"();



CREATE OR REPLACE TRIGGER "z_notify_webhook_conversations" AFTER INSERT OR UPDATE ON "public"."conversations" FOR EACH ROW EXECUTE FUNCTION "public"."notify_webhook"();



CREATE OR REPLACE TRIGGER "z_notify_webhook_logs" AFTER INSERT ON "public"."logs" FOR EACH ROW EXECUTE FUNCTION "public"."notify_webhook"();



CREATE OR REPLACE TRIGGER "z_notify_webhook_messages" AFTER INSERT OR UPDATE ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."notify_webhook"();



CREATE OR REPLACE TRIGGER "z_notify_webhook_organizations_addresses" AFTER INSERT OR UPDATE ON "public"."organizations_addresses" FOR EACH ROW EXECUTE FUNCTION "public"."notify_webhook"();



ALTER TABLE ONLY "billing"."invoices_items"
    ADD CONSTRAINT "invoices_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "billing"."invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "billing"."invoices_items"
    ADD CONSTRAINT "invoices_items_ledger_id_fkey" FOREIGN KEY ("ledger_id") REFERENCES "billing"."ledger"("id");



ALTER TABLE ONLY "billing"."invoices_items"
    ADD CONSTRAINT "invoices_items_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "billing"."plans"("id");



ALTER TABLE ONLY "billing"."invoices_items"
    ADD CONSTRAINT "invoices_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "billing"."products"("id");



ALTER TABLE ONLY "billing"."invoices"
    ADD CONSTRAINT "invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "billing"."ledger"
    ADD CONSTRAINT "ledger_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "billing"."ledger"
    ADD CONSTRAINT "ledger_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "billing"."ledger"
    ADD CONSTRAINT "ledger_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "billing"."ledger"
    ADD CONSTRAINT "ledger_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "billing"."products"("id");



ALTER TABLE ONLY "billing"."payments"
    ADD CONSTRAINT "payments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "billing"."accounts"("id");



ALTER TABLE ONLY "billing"."payments"
    ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "billing"."invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "billing"."payments"
    ADD CONSTRAINT "payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "billing"."plans_products"
    ADD CONSTRAINT "plans_products_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "billing"."plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "billing"."plans_products"
    ADD CONSTRAINT "plans_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "billing"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "billing"."subscriptions"
    ADD CONSTRAINT "subscriptions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "billing"."accounts"("id");



ALTER TABLE ONLY "billing"."subscriptions"
    ADD CONSTRAINT "subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "billing"."subscriptions"
    ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "billing"."plans"("id");



ALTER TABLE ONLY "billing"."subscriptions"
    ADD CONSTRAINT "subscriptions_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "billing"."tiers"("id");



ALTER TABLE ONLY "billing"."tiers_products"
    ADD CONSTRAINT "tiers_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "billing"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "billing"."tiers_products"
    ADD CONSTRAINT "tiers_products_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "billing"."tiers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "billing"."usage"
    ADD CONSTRAINT "usage_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "billing"."usage"
    ADD CONSTRAINT "usage_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "billing"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "private"."booking_phone_otp_challenges"
    ADD CONSTRAINT "booking_phone_otp_challenges_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "private"."customer_booking_access"
    ADD CONSTRAINT "customer_booking_access_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "private"."oem_audit_events"
    ADD CONSTRAINT "oem_audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "private"."patient_portal_sessions"
    ADD CONSTRAINT "patient_portal_sessions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "private"."patient_portal_sessions"
    ADD CONSTRAINT "patient_portal_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "private"."patient_portal_sessions"
    ADD CONSTRAINT "patient_portal_sessions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patient_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "private"."platform_operators"
    ADD CONSTRAINT "platform_operators_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "private"."platform_operators"
    ADD CONSTRAINT "platform_operators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "private"."shadow_audit_records"
    ADD CONSTRAINT "shadow_audit_records_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "private"."shadow_evaluation_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "private"."shadow_audit_records"
    ADD CONSTRAINT "shadow_audit_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "private"."shadow_evaluation_runs"
    ADD CONSTRAINT "shadow_evaluation_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "private"."whatsapp_booking_handoffs"
    ADD CONSTRAINT "whatsapp_booking_handoffs_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "private"."whatsapp_booking_handoffs"
    ADD CONSTRAINT "whatsapp_booking_handoffs_consent_evidence_id_fkey" FOREIGN KEY ("consent_evidence_id") REFERENCES "public"."whatsapp_booking_consent_evidence"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "private"."whatsapp_booking_handoffs"
    ADD CONSTRAINT "whatsapp_booking_handoffs_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "private"."whatsapp_booking_handoffs"
    ADD CONSTRAINT "whatsapp_booking_handoffs_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."business_locations"("id");



ALTER TABLE ONLY "private"."whatsapp_booking_handoffs"
    ADD CONSTRAINT "whatsapp_booking_handoffs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "private"."whatsapp_booking_handoffs"
    ADD CONSTRAINT "whatsapp_booking_handoffs_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."booking_resources"("id");



ALTER TABLE ONLY "private"."whatsapp_booking_handoffs"
    ADD CONSTRAINT "whatsapp_booking_handoffs_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."organization_services"("id");



ALTER TABLE ONLY "private"."whatsapp_booking_handoffs"
    ADD CONSTRAINT "whatsapp_booking_handoffs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."whatsapp_booking_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "private"."whatsapp_booking_handoffs"
    ADD CONSTRAINT "whatsapp_booking_handoffs_source_message_id_fkey" FOREIGN KEY ("source_message_id") REFERENCES "public"."messages"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."action_centre_assignments"
    ADD CONSTRAINT "action_centre_assignments_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."action_centre_assignments"
    ADD CONSTRAINT "action_centre_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."action_centre_deployments"
    ADD CONSTRAINT "action_centre_deployments_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."action_centre_deployments"
    ADD CONSTRAINT "action_centre_deployments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agents"
    ADD CONSTRAINT "agents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agents"
    ADD CONSTRAINT "agents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_agent_channel_bindings"
    ADD CONSTRAINT "ai_agent_channel_bindings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_agent_conversation_state"
    ADD CONSTRAINT "ai_agent_conversation_state_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_agent_conversation_state"
    ADD CONSTRAINT "ai_agent_conversation_state_last_inbound_message_id_fkey" FOREIGN KEY ("last_inbound_message_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_agent_conversation_state"
    ADD CONSTRAINT "ai_agent_conversation_state_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_agent_dispatches"
    ADD CONSTRAINT "ai_agent_dispatches_binding_id_fkey" FOREIGN KEY ("binding_id") REFERENCES "public"."ai_agent_channel_bindings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_agent_dispatches"
    ADD CONSTRAINT "ai_agent_dispatches_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_agent_dispatches"
    ADD CONSTRAINT "ai_agent_dispatches_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_agent_dispatches"
    ADD CONSTRAINT "ai_agent_dispatches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_agent_dispatches"
    ADD CONSTRAINT "ai_agent_dispatches_response_message_id_fkey" FOREIGN KEY ("response_message_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_agent_profiles"
    ADD CONSTRAINT "ai_agent_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_notifications"
    ADD CONSTRAINT "app_notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_notifications"
    ADD CONSTRAINT "app_notifications_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."appointment_events"
    ADD CONSTRAINT "appointment_events_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."appointment_events"
    ADD CONSTRAINT "appointment_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."appointment_queue_entries"
    ADD CONSTRAINT "appointment_queue_entries_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."appointment_queue_entries"
    ADD CONSTRAINT "appointment_queue_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."appointment_queue_entries"
    ADD CONSTRAINT "appointment_queue_entries_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."business_locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."appointment_queue_entries"
    ADD CONSTRAINT "appointment_queue_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."appointment_queue_entries"
    ADD CONSTRAINT "appointment_queue_entries_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."booking_resources"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."appointment_waitlist"
    ADD CONSTRAINT "appointment_waitlist_booking_request_id_fkey" FOREIGN KEY ("booking_request_id") REFERENCES "public"."whatsapp_booking_requests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."appointment_waitlist"
    ADD CONSTRAINT "appointment_waitlist_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."business_locations"("id");



ALTER TABLE ONLY "public"."appointment_waitlist"
    ADD CONSTRAINT "appointment_waitlist_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."appointment_waitlist"
    ADD CONSTRAINT "appointment_waitlist_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patient_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."appointment_waitlist"
    ADD CONSTRAINT "appointment_waitlist_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."booking_resources"("id");



ALTER TABLE ONLY "public"."appointment_waitlist"
    ADD CONSTRAINT "appointment_waitlist_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."organization_services"("id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_booking_consent_evidence_id_fkey" FOREIGN KEY ("booking_consent_evidence_id") REFERENCES "public"."whatsapp_booking_consent_evidence"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."business_locations"("id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patient_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."booking_resources"("id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."organization_services"("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."automation_recovery_events"
    ADD CONSTRAINT "automation_recovery_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."automation_recovery_events"
    ADD CONSTRAINT "automation_recovery_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."automation_rollout_reviews"
    ADD CONSTRAINT "automation_rollout_reviews_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."automation_rollout_reviews"
    ADD CONSTRAINT "automation_rollout_reviews_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."automation_rollout_reviews"
    ADD CONSTRAINT "automation_rollout_reviews_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "public"."automation_workflows"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."automation_runs"
    ADD CONSTRAINT "automation_runs_observed_message_id_fkey" FOREIGN KEY ("observed_message_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."automation_runs"
    ADD CONSTRAINT "automation_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."automation_runs"
    ADD CONSTRAINT "automation_runs_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "public"."automation_workflows"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."automation_workflows"
    ADD CONSTRAINT "automation_workflows_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."automation_workflows"
    ADD CONSTRAINT "automation_workflows_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."availability_rules"
    ADD CONSTRAINT "availability_rules_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."business_locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."availability_rules"
    ADD CONSTRAINT "availability_rules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."availability_rules"
    ADD CONSTRAINT "availability_rules_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."booking_resources"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."billing_notice_events"
    ADD CONSTRAINT "billing_notice_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_pages"
    ADD CONSTRAINT "booking_pages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_payments"
    ADD CONSTRAINT "booking_payments_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_payments"
    ADD CONSTRAINT "booking_payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_resources"
    ADD CONSTRAINT "booking_resources_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."business_locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."booking_resources"
    ADD CONSTRAINT "booking_resources_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."business_locations"
    ADD CONSTRAINT "business_locations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."business_locations"
    ADD CONSTRAINT "business_locations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_events"
    ADD CONSTRAINT "campaign_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_events"
    ADD CONSTRAINT "campaign_events_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_events"
    ADD CONSTRAINT "campaign_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_events"
    ADD CONSTRAINT "campaign_events_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "public"."campaign_recipients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_recipients"
    ADD CONSTRAINT "campaign_recipients_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_recipients"
    ADD CONSTRAINT "campaign_recipients_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_recipients"
    ADD CONSTRAINT "campaign_recipients_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_recipients"
    ADD CONSTRAINT "campaign_recipients_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patient_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."channel_message_templates"("id");



ALTER TABLE ONLY "public"."care_reminder_runs"
    ADD CONSTRAINT "care_reminder_runs_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."care_reminder_runs"
    ADD CONSTRAINT "care_reminder_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."care_reminder_runs"
    ADD CONSTRAINT "care_reminder_runs_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patient_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."care_reminder_runs"
    ADD CONSTRAINT "care_reminder_runs_reminder_id_fkey" FOREIGN KEY ("reminder_id") REFERENCES "public"."care_reminders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."care_reminder_runs"
    ADD CONSTRAINT "care_reminder_runs_response_message_id_fkey" FOREIGN KEY ("response_message_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."care_reminders"
    ADD CONSTRAINT "care_reminders_care_plan_id_fkey" FOREIGN KEY ("care_plan_id") REFERENCES "public"."patient_care_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."care_reminders"
    ADD CONSTRAINT "care_reminders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."care_reminders"
    ADD CONSTRAINT "care_reminders_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "public"."patient_encounters"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."care_reminders"
    ADD CONSTRAINT "care_reminders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."care_reminders"
    ADD CONSTRAINT "care_reminders_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patient_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."care_reminders"
    ADD CONSTRAINT "care_reminders_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "public"."prescriptions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."care_reminders"
    ADD CONSTRAINT "care_reminders_prescription_item_id_fkey" FOREIGN KEY ("prescription_item_id") REFERENCES "public"."prescription_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."channel_connections"
    ADD CONSTRAINT "channel_connections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."channel_message_templates"
    ADD CONSTRAINT "channel_message_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clinic_departments"
    ADD CONSTRAINT "clinic_departments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clinic_pilot_controls"
    ADD CONSTRAINT "clinic_pilot_controls_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clinic_pilot_controls"
    ADD CONSTRAINT "clinic_pilot_controls_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."communication_opt_outs"
    ADD CONSTRAINT "communication_opt_outs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."communication_opt_outs"
    ADD CONSTRAINT "communication_opt_outs_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patient_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."communication_opt_outs"
    ADD CONSTRAINT "communication_opt_outs_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contacts_addresses"
    ADD CONSTRAINT "contacts_addresses_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contacts_addresses"
    ADD CONSTRAINT "contacts_addresses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_assigned_agent_id_fkey" FOREIGN KEY ("assigned_agent_id") REFERENCES "public"."agents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_contact_address_fkey" FOREIGN KEY ("organization_id", "service", "contact_address") REFERENCES "public"."contacts_addresses"("organization_id", "service", "address");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_organization_address_fkey" FOREIGN KEY ("organization_id", "organization_address") REFERENCES "public"."organizations_addresses"("organization_id", "address");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."device_push_deliveries"
    ADD CONSTRAINT "device_push_deliveries_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "public"."app_notifications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."device_push_deliveries"
    ADD CONSTRAINT "device_push_deliveries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."device_push_deliveries"
    ADD CONSTRAINT "device_push_deliveries_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."device_push_subscriptions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."device_push_subscriptions"
    ADD CONSTRAINT "device_push_subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."device_push_subscriptions"
    ADD CONSTRAINT "device_push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."doctor_import_jobs"
    ADD CONSTRAINT "doctor_import_jobs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."doctor_import_jobs"
    ADD CONSTRAINT "doctor_import_jobs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."doctor_queue_consent_events"
    ADD CONSTRAINT "doctor_queue_consent_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."doctor_queue_consent_events"
    ADD CONSTRAINT "doctor_queue_consent_events_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."doctor_queue_consent_events"
    ADD CONSTRAINT "doctor_queue_consent_events_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."booking_resources"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."doctor_queue_dispatches"
    ADD CONSTRAINT "doctor_queue_dispatches_availability_rule_id_fkey" FOREIGN KEY ("availability_rule_id") REFERENCES "public"."availability_rules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."doctor_queue_dispatches"
    ADD CONSTRAINT "doctor_queue_dispatches_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."doctor_queue_dispatches"
    ADD CONSTRAINT "doctor_queue_dispatches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."doctor_queue_dispatches"
    ADD CONSTRAINT "doctor_queue_dispatches_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."booking_resources"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."entitlements"
    ADD CONSTRAINT "entitlements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."eval_runs"
    ADD CONSTRAINT "eval_runs_matched_chunk_id_fkey" FOREIGN KEY ("matched_chunk_id") REFERENCES "public"."knowledge_chunks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."eval_runs"
    ADD CONSTRAINT "eval_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."knowledge_bases"
    ADD CONSTRAINT "knowledge_bases_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."knowledge_chunks"
    ADD CONSTRAINT "knowledge_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."knowledge_chunks"
    ADD CONSTRAINT "knowledge_chunks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."knowledge_documents"
    ADD CONSTRAINT "knowledge_documents_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_bases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."knowledge_documents"
    ADD CONSTRAINT "knowledge_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."logs"
    ADD CONSTRAINT "logs_organization_address_fkey" FOREIGN KEY ("organization_id", "organization_address") REFERENCES "public"."organizations_addresses"("organization_id", "address") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."logs"
    ADD CONSTRAINT "logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."medicine_catalog_entries"
    ADD CONSTRAINT "medicine_catalog_entries_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "public"."medicine_catalog_releases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."n8n_instances"
    ADD CONSTRAINT "n8n_instances_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."onboarding_profiles"
    ADD CONSTRAINT "onboarding_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."onboarding_tokens"
    ADD CONSTRAINT "onboarding_tokens_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."operational_billing_settings"
    ADD CONSTRAINT "operational_billing_settings_activated_by_fkey" FOREIGN KEY ("activated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."operational_billing_settings"
    ADD CONSTRAINT "operational_billing_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."operational_creative_reservations"
    ADD CONSTRAINT "operational_creative_reservations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."operational_events"
    ADD CONSTRAINT "operational_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."operational_events"
    ADD CONSTRAINT "operational_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."operational_rate_card_audit"
    ADD CONSTRAINT "operational_rate_card_audit_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."operational_rate_card_audit"
    ADD CONSTRAINT "operational_rate_card_audit_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."operational_rate_card_audit"
    ADD CONSTRAINT "operational_rate_card_audit_rate_card_id_fkey" FOREIGN KEY ("rate_card_id") REFERENCES "public"."whatsapp_rate_cards"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."operational_reconciliation_runs"
    ADD CONSTRAINT "operational_reconciliation_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."operational_reconciliation_runs"
    ADD CONSTRAINT "operational_reconciliation_runs_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."operational_statements"
    ADD CONSTRAINT "operational_statements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."operational_topup_intents"
    ADD CONSTRAINT "operational_topup_intents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."operational_usage_events"
    ADD CONSTRAINT "operational_usage_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."operational_usage_events"
    ADD CONSTRAINT "operational_usage_events_rate_card_id_fkey" FOREIGN KEY ("rate_card_id") REFERENCES "public"."whatsapp_rate_cards"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."operational_wallet_ledger"
    ADD CONSTRAINT "operational_wallet_ledger_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."operational_wallets"
    ADD CONSTRAINT "operational_wallets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_communication_controls"
    ADD CONSTRAINT "organization_communication_controls_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_communication_controls"
    ADD CONSTRAINT "organization_communication_controls_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."organization_services"
    ADD CONSTRAINT "organization_services_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organizations_addresses"
    ADD CONSTRAINT "organizations_addresses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patient_care_plans"
    ADD CONSTRAINT "patient_care_plans_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."patient_care_plans"
    ADD CONSTRAINT "patient_care_plans_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."patient_care_plans"
    ADD CONSTRAINT "patient_care_plans_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."patient_care_plans"
    ADD CONSTRAINT "patient_care_plans_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "public"."patient_encounters"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."patient_care_plans"
    ADD CONSTRAINT "patient_care_plans_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patient_care_plans"
    ADD CONSTRAINT "patient_care_plans_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patient_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patient_care_tasks"
    ADD CONSTRAINT "patient_care_tasks_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."patient_care_tasks"
    ADD CONSTRAINT "patient_care_tasks_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."patient_care_tasks"
    ADD CONSTRAINT "patient_care_tasks_care_plan_id_fkey" FOREIGN KEY ("care_plan_id") REFERENCES "public"."patient_care_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patient_care_tasks"
    ADD CONSTRAINT "patient_care_tasks_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."patient_care_tasks"
    ADD CONSTRAINT "patient_care_tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."patient_care_tasks"
    ADD CONSTRAINT "patient_care_tasks_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "public"."patient_encounters"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."patient_care_tasks"
    ADD CONSTRAINT "patient_care_tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patient_care_tasks"
    ADD CONSTRAINT "patient_care_tasks_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patient_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patient_consent_events"
    ADD CONSTRAINT "patient_consent_events_captured_by_fkey" FOREIGN KEY ("captured_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."patient_consent_events"
    ADD CONSTRAINT "patient_consent_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patient_consent_events"
    ADD CONSTRAINT "patient_consent_events_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patient_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patient_data_request_events"
    ADD CONSTRAINT "patient_data_request_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."patient_data_request_events"
    ADD CONSTRAINT "patient_data_request_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."patient_data_request_events"
    ADD CONSTRAINT "patient_data_request_events_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."patient_data_requests"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."patient_data_requests"
    ADD CONSTRAINT "patient_data_requests_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."patient_data_requests"
    ADD CONSTRAINT "patient_data_requests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."patient_data_requests"
    ADD CONSTRAINT "patient_data_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."patient_data_requests"
    ADD CONSTRAINT "patient_data_requests_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patient_profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."patient_data_requests"
    ADD CONSTRAINT "patient_data_requests_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."patient_documents"
    ADD CONSTRAINT "patient_documents_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."patient_documents"
    ADD CONSTRAINT "patient_documents_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "public"."patient_encounters"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."patient_documents"
    ADD CONSTRAINT "patient_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patient_documents"
    ADD CONSTRAINT "patient_documents_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patient_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patient_documents"
    ADD CONSTRAINT "patient_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."patient_encounters"
    ADD CONSTRAINT "patient_encounters_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."patient_encounters"
    ADD CONSTRAINT "patient_encounters_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."patient_encounters"
    ADD CONSTRAINT "patient_encounters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patient_encounters"
    ADD CONSTRAINT "patient_encounters_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patient_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patient_guardian_links"
    ADD CONSTRAINT "patient_guardian_links_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patient_guardian_links"
    ADD CONSTRAINT "patient_guardian_links_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patient_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patient_identity_verification_events"
    ADD CONSTRAINT "patient_identity_verification_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patient_identity_verification_events"
    ADD CONSTRAINT "patient_identity_verification_events_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patient_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."patient_profiles"
    ADD CONSTRAINT "patient_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_gateway_connections"
    ADD CONSTRAINT "payment_gateway_connections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prescription_items"
    ADD CONSTRAINT "prescription_items_catalog_entry_id_fkey" FOREIGN KEY ("catalog_entry_id") REFERENCES "public"."medicine_catalog_entries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."prescription_items"
    ADD CONSTRAINT "prescription_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prescription_items"
    ADD CONSTRAINT "prescription_items_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "public"."prescriptions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "public"."patient_encounters"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patient_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "public"."prescriptions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."production_readiness_checks"
    ADD CONSTRAINT "production_readiness_checks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."production_readiness_checks"
    ADD CONSTRAINT "production_readiness_checks_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."provider_departments"
    ADD CONSTRAINT "provider_departments_department_id_organization_id_fkey" FOREIGN KEY ("department_id", "organization_id") REFERENCES "public"."clinic_departments"("id", "organization_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_departments"
    ADD CONSTRAINT "provider_departments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_departments"
    ADD CONSTRAINT "provider_departments_resource_id_organization_id_fkey" FOREIGN KEY ("resource_id", "organization_id") REFERENCES "public"."booking_resources"("id", "organization_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_location_assignments"
    ADD CONSTRAINT "provider_location_assignments_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."business_locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_location_assignments"
    ADD CONSTRAINT "provider_location_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_location_assignments"
    ADD CONSTRAINT "provider_location_assignments_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."booking_resources"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_location_services"
    ADD CONSTRAINT "provider_location_services_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."provider_location_assignments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_location_services"
    ADD CONSTRAINT "provider_location_services_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_location_services"
    ADD CONSTRAINT "provider_location_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."organization_services"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_profiles"
    ADD CONSTRAINT "provider_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_profiles"
    ADD CONSTRAINT "provider_profiles_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."booking_resources"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provider_profiles"
    ADD CONSTRAINT "provider_profiles_whatsapp_queue_consent_recorded_by_fkey" FOREIGN KEY ("whatsapp_queue_consent_recorded_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."quick_replies"
    ADD CONSTRAINT "quick_replies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rag_knowledge_items"
    ADD CONSTRAINT "rag_knowledge_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rag_knowledge_items"
    ADD CONSTRAINT "rag_knowledge_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reminder_events"
    ADD CONSTRAINT "reminder_events_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reminder_events"
    ADD CONSTRAINT "reminder_events_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "public"."channel_connections"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reminder_events"
    ADD CONSTRAINT "reminder_events_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reminder_events"
    ADD CONSTRAINT "reminder_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saas_billing_orders"
    ADD CONSTRAINT "saas_billing_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."saas_billing_orders"
    ADD CONSTRAINT "saas_billing_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saas_billing_orders"
    ADD CONSTRAINT "saas_billing_orders_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."saas_plans"("id");



ALTER TABLE ONLY "public"."saas_invoices"
    ADD CONSTRAINT "saas_invoices_billing_order_id_fkey" FOREIGN KEY ("billing_order_id") REFERENCES "public"."saas_billing_orders"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."saas_invoices"
    ADD CONSTRAINT "saas_invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saas_invoices"
    ADD CONSTRAINT "saas_invoices_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."saas_plans"("id");



ALTER TABLE ONLY "public"."schedule_exceptions"
    ADD CONSTRAINT "schedule_exceptions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."business_locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedule_exceptions"
    ADD CONSTRAINT "schedule_exceptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedule_exceptions"
    ADD CONSTRAINT "schedule_exceptions_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."booking_resources"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."security_incident_events"
    ADD CONSTRAINT "security_incident_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."security_incident_events"
    ADD CONSTRAINT "security_incident_events_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "public"."security_incidents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."security_incident_events"
    ADD CONSTRAINT "security_incident_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."security_incidents"
    ADD CONSTRAINT "security_incidents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."security_incidents"
    ADD CONSTRAINT "security_incidents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."security_incidents"
    ADD CONSTRAINT "security_incidents_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."security_incidents"
    ADD CONSTRAINT "security_incidents_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."service_requests"
    ADD CONSTRAINT "service_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_requests"
    ADD CONSTRAINT "service_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."team_audit_events"
    ADD CONSTRAINT "team_audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."team_audit_events"
    ADD CONSTRAINT "team_audit_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_audit_events"
    ADD CONSTRAINT "team_audit_events_subject_agent_id_fkey" FOREIGN KEY ("subject_agent_id") REFERENCES "public"."agents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."usage_metering"
    ADD CONSTRAINT "usage_metering_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."waitlist_offers"
    ADD CONSTRAINT "waitlist_offers_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."waitlist_offers"
    ADD CONSTRAINT "waitlist_offers_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."business_locations"("id");



ALTER TABLE ONLY "public"."waitlist_offers"
    ADD CONSTRAINT "waitlist_offers_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."waitlist_offers"
    ADD CONSTRAINT "waitlist_offers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."waitlist_offers"
    ADD CONSTRAINT "waitlist_offers_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."booking_resources"("id");



ALTER TABLE ONLY "public"."waitlist_offers"
    ADD CONSTRAINT "waitlist_offers_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."organization_services"("id");



ALTER TABLE ONLY "public"."waitlist_offers"
    ADD CONSTRAINT "waitlist_offers_waitlist_id_fkey" FOREIGN KEY ("waitlist_id") REFERENCES "public"."appointment_waitlist"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."webhook_events"
    ADD CONSTRAINT "webhook_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."webhooks"
    ADD CONSTRAINT "webhooks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_acceptance_observations"
    ADD CONSTRAINT "whatsapp_acceptance_observations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_acceptance_observations"
    ADD CONSTRAINT "whatsapp_acceptance_observations_response_message_id_fkey" FOREIGN KEY ("response_message_id") REFERENCES "public"."messages"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."whatsapp_acceptance_observations"
    ADD CONSTRAINT "whatsapp_acceptance_observations_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."whatsapp_acceptance_test_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_acceptance_observations"
    ADD CONSTRAINT "whatsapp_acceptance_observations_source_message_id_fkey" FOREIGN KEY ("source_message_id") REFERENCES "public"."messages"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."whatsapp_acceptance_payments"
    ADD CONSTRAINT "whatsapp_acceptance_payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_acceptance_payments"
    ADD CONSTRAINT "whatsapp_acceptance_payments_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."whatsapp_acceptance_test_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_acceptance_test_events"
    ADD CONSTRAINT "whatsapp_acceptance_test_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_acceptance_test_events"
    ADD CONSTRAINT "whatsapp_acceptance_test_events_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."whatsapp_acceptance_test_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_acceptance_test_runs"
    ADD CONSTRAINT "whatsapp_acceptance_test_runs_dispatch_message_id_fkey" FOREIGN KEY ("dispatch_message_id") REFERENCES "public"."messages"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."whatsapp_acceptance_test_runs"
    ADD CONSTRAINT "whatsapp_acceptance_test_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_acceptance_test_runs"
    ADD CONSTRAINT "whatsapp_acceptance_test_runs_subject_acceptance_payment_i_fkey" FOREIGN KEY ("subject_acceptance_payment_id") REFERENCES "public"."whatsapp_acceptance_payments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."whatsapp_acceptance_test_runs"
    ADD CONSTRAINT "whatsapp_acceptance_test_runs_subject_payment_id_fkey" FOREIGN KEY ("subject_payment_id") REFERENCES "public"."booking_payments"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."whatsapp_acceptance_test_runs"
    ADD CONSTRAINT "whatsapp_acceptance_test_runs_verified_message_id_fkey" FOREIGN KEY ("verified_message_id") REFERENCES "public"."messages"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."whatsapp_booking_acceptance_checks"
    ADD CONSTRAINT "whatsapp_booking_acceptance_checks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_booking_acceptance_checks"
    ADD CONSTRAINT "whatsapp_booking_acceptance_checks_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."whatsapp_booking_consent_evidence"
    ADD CONSTRAINT "whatsapp_booking_consent_evidence_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_booking_requests"
    ADD CONSTRAINT "whatsapp_booking_requests_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."whatsapp_booking_requests"
    ADD CONSTRAINT "whatsapp_booking_requests_booking_consent_evidence_id_fkey" FOREIGN KEY ("booking_consent_evidence_id") REFERENCES "public"."whatsapp_booking_consent_evidence"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."whatsapp_booking_requests"
    ADD CONSTRAINT "whatsapp_booking_requests_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."whatsapp_booking_requests"
    ADD CONSTRAINT "whatsapp_booking_requests_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."whatsapp_booking_requests"
    ADD CONSTRAINT "whatsapp_booking_requests_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."business_locations"("id");



ALTER TABLE ONLY "public"."whatsapp_booking_requests"
    ADD CONSTRAINT "whatsapp_booking_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_booking_requests"
    ADD CONSTRAINT "whatsapp_booking_requests_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."booking_resources"("id");



ALTER TABLE ONLY "public"."whatsapp_booking_requests"
    ADD CONSTRAINT "whatsapp_booking_requests_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."organization_services"("id");



ALTER TABLE ONLY "public"."whatsapp_booking_requests"
    ADD CONSTRAINT "whatsapp_booking_requests_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."whatsapp_booking_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."whatsapp_booking_sessions"
    ADD CONSTRAINT "whatsapp_booking_sessions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_booking_sessions"
    ADD CONSTRAINT "whatsapp_booking_sessions_last_message_id_fkey" FOREIGN KEY ("last_message_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."whatsapp_booking_sessions"
    ADD CONSTRAINT "whatsapp_booking_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_booking_settings"
    ADD CONSTRAINT "whatsapp_booking_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_concierge_dispatches"
    ADD CONSTRAINT "whatsapp_concierge_dispatches_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_concierge_dispatches"
    ADD CONSTRAINT "whatsapp_concierge_dispatches_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_concierge_dispatches"
    ADD CONSTRAINT "whatsapp_concierge_dispatches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_preference_events"
    ADD CONSTRAINT "whatsapp_preference_events_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_preference_events"
    ADD CONSTRAINT "whatsapp_preference_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_preference_events"
    ADD CONSTRAINT "whatsapp_preference_events_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patient_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."whatsapp_preference_events"
    ADD CONSTRAINT "whatsapp_preference_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."whatsapp_booking_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_preference_events"
    ADD CONSTRAINT "whatsapp_preference_events_source_message_id_fkey" FOREIGN KEY ("source_message_id") REFERENCES "public"."messages"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."whatsapp_rate_cards"
    ADD CONSTRAINT "whatsapp_rate_cards_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."whatsapp_recovery_acceptance_fixtures"
    ADD CONSTRAINT "whatsapp_recovery_acceptance_fixtures_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_recovery_acceptance_fixtures"
    ADD CONSTRAINT "whatsapp_recovery_acceptance_fixtures_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_recovery_acceptance_fixtures"
    ADD CONSTRAINT "whatsapp_recovery_acceptance_fixtures_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."whatsapp_acceptance_test_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_recovery_acceptance_fixtures"
    ADD CONSTRAINT "whatsapp_recovery_acceptance_fixtures_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."whatsapp_booking_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_sales_rag_dispatches"
    ADD CONSTRAINT "whatsapp_sales_rag_dispatches_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_sales_rag_dispatches"
    ADD CONSTRAINT "whatsapp_sales_rag_dispatches_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_sales_rag_dispatches"
    ADD CONSTRAINT "whatsapp_sales_rag_dispatches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_sales_rag_dispatches"
    ADD CONSTRAINT "whatsapp_sales_rag_dispatches_response_message_id_fkey" FOREIGN KEY ("response_message_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE "billing"."accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "anyone can read costs" ON "billing"."costs" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "anyone can read plans" ON "billing"."plans" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "anyone can read plans_products" ON "billing"."plans_products" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "anyone can read products" ON "billing"."products" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "anyone can read tiers" ON "billing"."tiers" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "anyone can read tiers_products" ON "billing"."tiers_products" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "billing"."costs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "billing"."invoices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "billing"."invoices_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "billing"."ledger" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "members can read their org ledger" ON "billing"."ledger" FOR SELECT TO "authenticated", "anon" USING (("organization_id" IN ( SELECT "public"."get_authorized_orgs"('member'::"public"."role") AS "get_authorized_orgs")));



CREATE POLICY "members can read their org subscription" ON "billing"."subscriptions" FOR SELECT TO "authenticated", "anon" USING (("organization_id" IN ( SELECT "public"."get_authorized_orgs"('member'::"public"."role") AS "get_authorized_orgs")));



CREATE POLICY "members can read their org usage" ON "billing"."usage" FOR SELECT TO "authenticated", "anon" USING (("organization_id" IN ( SELECT "public"."get_authorized_orgs"('member'::"public"."role") AS "get_authorized_orgs")));



CREATE POLICY "owners can read their accounts" ON "billing"."accounts" FOR SELECT TO "authenticated", "anon" USING (("id" IN ( SELECT "s"."account_id"
   FROM "billing"."subscriptions" "s"
  WHERE (("s"."organization_id" IN ( SELECT "public"."get_authorized_orgs"('owner'::"public"."role") AS "get_authorized_orgs")) AND ("s"."account_id" IS NOT NULL)))));



CREATE POLICY "owners can read their org invoice items" ON "billing"."invoices_items" FOR SELECT TO "authenticated", "anon" USING (("invoice_id" IN ( SELECT "i"."id"
   FROM "billing"."invoices" "i"
  WHERE ("i"."organization_id" IN ( SELECT "public"."get_authorized_orgs"('owner'::"public"."role") AS "get_authorized_orgs")))));



CREATE POLICY "owners can read their org invoices" ON "billing"."invoices" FOR SELECT TO "authenticated", "anon" USING (("organization_id" IN ( SELECT "public"."get_authorized_orgs"('owner'::"public"."role") AS "get_authorized_orgs")));



CREATE POLICY "owners can read their org payments" ON "billing"."payments" FOR SELECT TO "authenticated", "anon" USING (("organization_id" IN ( SELECT "public"."get_authorized_orgs"('owner'::"public"."role") AS "get_authorized_orgs")));



ALTER TABLE "billing"."payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "billing"."plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "billing"."plans_products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "billing"."products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "billing"."subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "billing"."tiers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "billing"."tiers_products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "billing"."usage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."ai_provider_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."api_rate_limits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."booking_phone_otp_challenges" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "booking_phone_otp_deny_direct_access" ON "private"."booking_phone_otp_challenges" USING (false) WITH CHECK (false);



ALTER TABLE "private"."customer_booking_access" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."oem_audit_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."patient_portal_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."platform_operators" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."shadow_audit_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."shadow_evaluation_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."whatsapp_booking_handoffs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "whatsapp_booking_handoffs_deny_direct_access" ON "private"."whatsapp_booking_handoffs" USING (false) WITH CHECK (false);



CREATE POLICY "Service Role full access on entitlements" ON "public"."entitlements" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Users can view their organization entitlements" ON "public"."entitlements" FOR SELECT USING (("organization_id" IN ( SELECT "agents"."organization_id"
   FROM "public"."agents"
  WHERE ("agents"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."action_centre_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."action_centre_deployments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "active plans are publicly readable" ON "public"."saas_plans" FOR SELECT TO "authenticated", "anon" USING ("active");



CREATE POLICY "admins add patient documents" ON "public"."patient_documents" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_organization_member"("organization_id", 'admin'::"text") AND ("uploaded_by" = "auth"."uid"())));



CREATE POLICY "admins add prescription items" ON "public"."prescription_items" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_organization_member"("organization_id", 'admin'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."prescriptions" "p"
  WHERE (("p"."id" = "prescription_items"."prescription_id") AND ("p"."organization_id" = "prescription_items"."organization_id") AND ("p"."created_by" = "auth"."uid"()))))));



CREATE POLICY "admins can create business locations" ON "public"."business_locations" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins can create organization services" ON "public"."organization_services" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins can create their orgs ai agents" ON "public"."agents" FOR INSERT TO "authenticated", "anon" WITH CHECK ((("organization_id" IN ( SELECT "public"."get_authorized_orgs"('admin'::"public"."role") AS "get_authorized_orgs")) AND ("ai" = true)));



CREATE POLICY "admins can manage their orgs ai agents" ON "public"."agents" TO "authenticated", "anon" USING ((("organization_id" IN ( SELECT "public"."get_authorized_orgs"('admin'::"public"."role") AS "get_authorized_orgs")) AND ("user_id" IS NULL) AND ("ai" = true)));



CREATE POLICY "admins can manage their orgs quick replies" ON "public"."quick_replies" TO "authenticated", "anon" USING (("organization_id" IN ( SELECT "public"."get_authorized_orgs"('admin'::"public"."role") AS "get_authorized_orgs")));



CREATE POLICY "admins can manage their orgs webhooks" ON "public"."webhooks" TO "authenticated", "anon" USING (("organization_id" IN ( SELECT "public"."get_authorized_orgs"('admin'::"public"."role") AS "get_authorized_orgs")));



CREATE POLICY "admins can update business locations" ON "public"."business_locations" FOR UPDATE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text")) WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins can update onboarding profile" ON "public"."onboarding_profiles" FOR UPDATE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text")) WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins can update organization services" ON "public"."organization_services" FOR UPDATE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text")) WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins can update their orgs, without changing their name" ON "public"."organizations" FOR UPDATE TO "authenticated", "anon" USING (("id" IN ( SELECT "public"."get_authorized_orgs"('admin'::"public"."role") AS "get_authorized_orgs"))) WITH CHECK ((("id" IN ( SELECT "public"."get_authorized_orgs"('admin'::"public"."role") AS "get_authorized_orgs")) AND "public"."org_update_by_admin_rules"("id", "name")));



CREATE POLICY "admins coordinate action ownership" ON "public"."action_centre_assignments" TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text")) WITH CHECK (("private"."is_organization_member"("organization_id", 'admin'::"text") AND (("assigned_to" IS NULL) OR ("assigned_to" = "auth"."uid"()))));



CREATE POLICY "admins create action centre deployments" ON "public"."action_centre_deployments" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_organization_member"("organization_id", 'admin'::"text") AND ("actor_user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "admins create appointment events" ON "public"."appointment_events" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_organization_member"("organization_id", 'admin'::"text") AND ("actor_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "admins create appointments" ON "public"."appointments" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins create automation workflows" ON "public"."automation_workflows" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_organization_member"("organization_id", 'admin'::"text") AND ("created_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "admins create availability" ON "public"."availability_rules" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins create booking resources" ON "public"."booking_resources" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins create care reminders" ON "public"."care_reminders" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_organization_member"("organization_id", 'admin'::"text") AND ("created_by" = "auth"."uid"())));



CREATE POLICY "admins create doctor import jobs" ON "public"."doctor_import_jobs" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_organization_member"("organization_id", 'admin'::"text") AND ("created_by" = "auth"."uid"())));



CREATE POLICY "admins create doctor queue dispatches" ON "public"."doctor_queue_dispatches" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins create knowledge" ON "public"."rag_knowledge_items" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_organization_member"("organization_id", 'admin'::"text") AND ("created_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "admins create patient care plans" ON "public"."patient_care_plans" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_organization_member"("organization_id", 'admin'::"text") AND ("created_by" = "auth"."uid"())));



CREATE POLICY "admins create patient care tasks" ON "public"."patient_care_tasks" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_organization_member"("organization_id", 'admin'::"text") AND ("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND (("assigned_to" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."agents" "a"
  WHERE (("a"."organization_id" = "patient_care_tasks"."organization_id") AND ("a"."user_id" = "patient_care_tasks"."assigned_to")))))));



CREATE POLICY "admins create patient data requests" ON "public"."patient_data_requests" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_organization_member"("organization_id", 'admin'::"text") AND ("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND ("updated_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "admins create patient encounters" ON "public"."patient_encounters" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_organization_member"("organization_id", 'admin'::"text") AND ("created_by" = "auth"."uid"())));



CREATE POLICY "admins create patient profiles" ON "public"."patient_profiles" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins create production readiness evidence" ON "public"."production_readiness_checks" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_organization_member"("organization_id", 'admin'::"text") AND ("updated_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "admins create provider chamber assignments" ON "public"."provider_location_assignments" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins create provider chamber services" ON "public"."provider_location_services" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins create provider profiles" ON "public"."provider_profiles" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins create reminder events" ON "public"."reminder_events" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins create schedule exceptions" ON "public"."schedule_exceptions" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_organization_member"("organization_id", 'admin'::"text") AND ("created_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "admins create security incidents" ON "public"."security_incidents" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_organization_member"("organization_id", 'admin'::"text") AND ("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND ("updated_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "admins decide booking requests" ON "public"."whatsapp_booking_requests" FOR UPDATE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text")) WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins delete guardian links" ON "public"."patient_guardian_links" FOR DELETE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins delete waitlist" ON "public"."appointment_waitlist" FOR DELETE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins delete waitlist offers" ON "public"."waitlist_offers" FOR DELETE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins insert booking bot settings" ON "public"."whatsapp_booking_settings" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins insert clinic pilot controls" ON "public"."clinic_pilot_controls" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_organization_member"("organization_id", 'admin'::"text") AND ("updated_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "admins insert communication controls" ON "public"."organization_communication_controls" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_organization_member"("organization_id", 'admin'::"text") AND ("updated_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "admins insert guardian links" ON "public"."patient_guardian_links" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins insert waitlist" ON "public"."appointment_waitlist" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins insert waitlist offers" ON "public"."waitlist_offers" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins issue prescriptions" ON "public"."prescriptions" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_organization_member"("organization_id", 'admin'::"text") AND ("created_by" = "auth"."uid"())));



CREATE POLICY "admins manage agent channel bindings" ON "public"."ai_agent_channel_bindings" TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text")) WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins manage agents" ON "public"."ai_agent_profiles" TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text")) WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins manage appointment queue" ON "public"."appointment_queue_entries" TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text")) WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins manage booking pages" ON "public"."booking_pages" TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text")) WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins manage clinic departments" ON "public"."clinic_departments" TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text")) WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins manage message templates" ON "public"."channel_message_templates" TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text")) WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins manage provider departments" ON "public"."provider_departments" TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text")) WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins read automation recovery audit" ON "public"."automation_recovery_events" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins read automation rollout reviews" ON "public"."automation_rollout_reviews" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins read doctor queue consent evidence" ON "public"."doctor_queue_consent_events" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins read patient data request history" ON "public"."patient_data_request_events" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins read patient data requests" ON "public"."patient_data_requests" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins read security incident history" ON "public"."security_incident_events" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins read security incidents" ON "public"."security_incidents" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins read team audit events" ON "public"."team_audit_events" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins read workspace operational events" ON "public"."operational_events" FOR SELECT TO "authenticated" USING ((("organization_id" IS NOT NULL) AND "private"."is_organization_member"("organization_id", 'admin'::"text")));



CREATE POLICY "admins record patient consent history" ON "public"."patient_consent_events" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_organization_member"("organization_id", 'admin'::"text") AND ("captured_by" = "auth"."uid"())));



CREATE POLICY "admins update appointments" ON "public"."appointments" FOR UPDATE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text")) WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins update automation runs" ON "public"."automation_runs" FOR UPDATE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text")) WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins update automation workflows" ON "public"."automation_workflows" FOR UPDATE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text")) WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins update availability" ON "public"."availability_rules" FOR UPDATE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text")) WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins update booking bot settings" ON "public"."whatsapp_booking_settings" FOR UPDATE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text")) WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins update booking resources" ON "public"."booking_resources" FOR UPDATE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text")) WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins update care reminder runs" ON "public"."care_reminder_runs" FOR UPDATE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text")) WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins update care reminders" ON "public"."care_reminders" FOR UPDATE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text")) WITH CHECK (("private"."is_organization_member"("organization_id", 'admin'::"text") AND ("created_by" = "auth"."uid"())));



CREATE POLICY "admins update clinic pilot controls" ON "public"."clinic_pilot_controls" FOR UPDATE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text")) WITH CHECK (("private"."is_organization_member"("organization_id", 'admin'::"text") AND ("updated_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "admins update communication controls" ON "public"."organization_communication_controls" FOR UPDATE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text")) WITH CHECK (("private"."is_organization_member"("organization_id", 'admin'::"text") AND ("updated_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "admins update doctor queue dispatches" ON "public"."doctor_queue_dispatches" FOR UPDATE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text")) WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins update guardian links" ON "public"."patient_guardian_links" FOR UPDATE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text")) WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins update knowledge" ON "public"."rag_knowledge_items" FOR UPDATE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text")) WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins update patient care plans" ON "public"."patient_care_plans" FOR UPDATE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text")) WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins update patient care tasks" ON "public"."patient_care_tasks" FOR UPDATE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text")) WITH CHECK (("private"."is_organization_member"("organization_id", 'admin'::"text") AND (("assigned_to" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."agents" "a"
  WHERE (("a"."organization_id" = "patient_care_tasks"."organization_id") AND ("a"."user_id" = "patient_care_tasks"."assigned_to")))))));



CREATE POLICY "admins update patient data requests" ON "public"."patient_data_requests" FOR UPDATE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text")) WITH CHECK (("private"."is_organization_member"("organization_id", 'admin'::"text") AND ("updated_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "admins update patient encounters" ON "public"."patient_encounters" FOR UPDATE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text")) WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins update patient profiles" ON "public"."patient_profiles" FOR UPDATE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text")) WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins update production readiness evidence" ON "public"."production_readiness_checks" FOR UPDATE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text")) WITH CHECK (("private"."is_organization_member"("organization_id", 'admin'::"text") AND ("updated_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "admins update provider chamber assignments" ON "public"."provider_location_assignments" FOR UPDATE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text")) WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins update provider chamber services" ON "public"."provider_location_services" FOR UPDATE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text")) WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins update provider profiles" ON "public"."provider_profiles" FOR UPDATE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text")) WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins update reminder events" ON "public"."reminder_events" FOR UPDATE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text")) WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins update schedule exceptions" ON "public"."schedule_exceptions" FOR UPDATE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text")) WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins update security incidents" ON "public"."security_incidents" FOR UPDATE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text")) WITH CHECK (("private"."is_organization_member"("organization_id", 'admin'::"text") AND ("updated_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "admins update waitlist" ON "public"."appointment_waitlist" FOR UPDATE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text")) WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "admins update waitlist offers" ON "public"."waitlist_offers" FOR UPDATE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text")) WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



ALTER TABLE "public"."agents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_agent_channel_bindings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_agent_conversation_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_agent_dispatches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_agent_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."api_keys" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."appointment_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."appointment_queue_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."appointment_waitlist" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."appointments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assignees update own patient care tasks" ON "public"."patient_care_tasks" FOR UPDATE TO "authenticated" USING ((("assigned_to" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."is_organization_member"("organization_id", 'member'::"text"))) WITH CHECK ((("assigned_to" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."is_organization_member"("organization_id", 'member'::"text")));



ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "authenticated users read active medicine entries" ON "public"."medicine_catalog_entries" FOR SELECT TO "authenticated" USING ((("status" = 'active'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."medicine_catalog_releases" "release"
  WHERE (("release"."id" = "medicine_catalog_entries"."release_id") AND ("release"."status" = 'active'::"text"))))));



CREATE POLICY "authenticated users read active medicine releases" ON "public"."medicine_catalog_releases" FOR SELECT TO "authenticated" USING (("status" = 'active'::"text"));



CREATE POLICY "authenticated users read planning whatsapp rate cards" ON "public"."whatsapp_rate_cards" FOR SELECT TO "authenticated" USING (("verification_status" = ANY (ARRAY['draft'::"text", 'verified'::"text"])));



ALTER TABLE "public"."automation_recovery_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."automation_rollout_reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."automation_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."automation_workflows" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."availability_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."billing_notice_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."billing_webhook_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."booking_pages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."booking_payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."booking_resources" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."business_locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaign_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_events_insert" ON "public"."campaign_events" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_organization_member"("organization_id", 'admin'::"text") AND (("actor_user_id" IS NULL) OR ("actor_user_id" = "auth"."uid"()))));



CREATE POLICY "campaign_events_read" ON "public"."campaign_events" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", NULL::"text"));



ALTER TABLE "public"."campaign_recipients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_recipients_insert" ON "public"."campaign_recipients" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "campaign_recipients_read" ON "public"."campaign_recipients" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", NULL::"text"));



CREATE POLICY "campaign_recipients_update" ON "public"."campaign_recipients" FOR UPDATE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text")) WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



ALTER TABLE "public"."campaigns" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaigns_insert" ON "public"."campaigns" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_organization_member"("organization_id", 'admin'::"text") AND ("created_by" = "auth"."uid"())));



CREATE POLICY "campaigns_read" ON "public"."campaigns" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", NULL::"text"));



CREATE POLICY "campaigns_update" ON "public"."campaigns" FOR UPDATE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text")) WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



ALTER TABLE "public"."care_reminder_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."care_reminders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."channel_connections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."channel_message_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clinic admins read acceptance observations" ON "public"."whatsapp_acceptance_observations" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "clinic admins read acceptance payments" ON "public"."whatsapp_acceptance_payments" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "clinic admins read acceptance test audit" ON "public"."whatsapp_acceptance_test_events" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "clinic admins read acceptance test runs" ON "public"."whatsapp_acceptance_test_runs" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "clinic admins read recovery fixtures" ON "public"."whatsapp_recovery_acceptance_fixtures" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "clinic members read booking acceptance evidence" ON "public"."whatsapp_booking_acceptance_checks" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



ALTER TABLE "public"."clinic_departments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clinic_pilot_controls" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."communication_opt_outs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contacts_addresses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."device_push_deliveries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."device_push_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."doctor_import_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."doctor_queue_consent_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."doctor_queue_dispatches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."entitlements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."eval_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."knowledge_bases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."knowledge_chunks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."knowledge_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."medicine_catalog_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."medicine_catalog_releases" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "members add own device push subscriptions" ON "public"."device_push_subscriptions" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."agents" "a"
  WHERE (("a"."organization_id" = "device_push_subscriptions"."organization_id") AND ("a"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("a"."ai" = false))))));



CREATE POLICY "members can create their orgs messages" ON "public"."messages" FOR INSERT TO "authenticated", "anon" WITH CHECK (("organization_id" IN ( SELECT "public"."get_authorized_orgs"('member'::"public"."role") AS "get_authorized_orgs")));



CREATE POLICY "members can delete non-synced contacts addresses" ON "public"."contacts_addresses" FOR DELETE TO "authenticated", "anon" USING ((("organization_id" IN ( SELECT "public"."get_authorized_orgs"('member'::"public"."role") AS "get_authorized_orgs")) AND ((("extra" -> 'synced'::"text") ->> 'action'::"text") IS DISTINCT FROM 'add'::"text")));



CREATE POLICY "members can delete themselves" ON "public"."agents" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "members can insert contacts addresses" ON "public"."contacts_addresses" FOR INSERT TO "authenticated", "anon" WITH CHECK ((("organization_id" IN ( SELECT "public"."get_authorized_orgs"('member'::"public"."role") AS "get_authorized_orgs")) AND ((("extra" -> 'synced'::"text") ->> 'action'::"text") IS DISTINCT FROM 'add'::"text")));



CREATE POLICY "members can manage their orgs contacts" ON "public"."contacts" TO "authenticated", "anon" USING (("organization_id" IN ( SELECT "public"."get_authorized_orgs"('member'::"public"."role") AS "get_authorized_orgs")));



CREATE POLICY "members can manage their orgs conversations" ON "public"."conversations" TO "authenticated", "anon" USING (("organization_id" IN ( SELECT "public"."get_authorized_orgs"('member'::"public"."role") AS "get_authorized_orgs")));



CREATE POLICY "members can read business locations" ON "public"."business_locations" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members can read onboarding profile" ON "public"."onboarding_profiles" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members can read organization services" ON "public"."organization_services" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members can read their orgs" ON "public"."organizations" FOR SELECT TO "authenticated", "anon" USING (("id" IN ( SELECT "public"."get_authorized_orgs"('member'::"public"."role") AS "get_authorized_orgs")));



CREATE POLICY "members can read their orgs addresses" ON "public"."organizations_addresses" FOR SELECT TO "authenticated", "anon" USING (("organization_id" IN ( SELECT "public"."get_authorized_orgs"('member'::"public"."role") AS "get_authorized_orgs")));



CREATE POLICY "members can read their orgs agents" ON "public"."agents" FOR SELECT TO "authenticated", "anon" USING (("organization_id" IN ( SELECT "public"."get_authorized_orgs"('member'::"public"."role") AS "get_authorized_orgs")));



CREATE POLICY "members can read their orgs contacts addresses" ON "public"."contacts_addresses" FOR SELECT TO "authenticated", "anon" USING (("organization_id" IN ( SELECT "public"."get_authorized_orgs"('member'::"public"."role") AS "get_authorized_orgs")));



CREATE POLICY "members can read their orgs logs" ON "public"."logs" FOR SELECT TO "authenticated", "anon" USING (("organization_id" IN ( SELECT "public"."get_authorized_orgs"('member'::"public"."role") AS "get_authorized_orgs")));



CREATE POLICY "members can read their orgs messages" ON "public"."messages" FOR SELECT TO "authenticated", "anon" USING (("organization_id" IN ( SELECT "public"."get_authorized_orgs"('member'::"public"."role") AS "get_authorized_orgs")));



CREATE POLICY "members can read their orgs quick replies" ON "public"."quick_replies" FOR SELECT TO "authenticated", "anon" USING (("organization_id" IN ( SELECT "public"."get_authorized_orgs"('member'::"public"."role") AS "get_authorized_orgs")));



CREATE POLICY "members can read themselves" ON "public"."agents" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "members can update contacts addresses" ON "public"."contacts_addresses" FOR UPDATE TO "authenticated", "anon" USING (("organization_id" IN ( SELECT "public"."get_authorized_orgs"('member'::"public"."role") AS "get_authorized_orgs"))) WITH CHECK ((("organization_id" IN ( SELECT "public"."get_authorized_orgs"('member'::"public"."role") AS "get_authorized_orgs")) AND "public"."contact_address_update_rules"("organization_id", "service", "address", "extra", "status")));



CREATE POLICY "members can update themselves" ON "public"."agents" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK ("public"."member_self_update_rules"("id", "user_id", "organization_id", "ai", "extra"));



CREATE POLICY "members manage own device push subscriptions" ON "public"."device_push_subscriptions" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "members mark own notifications read" ON "public"."app_notifications" FOR UPDATE TO "authenticated" USING ((("recipient_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."is_organization_member"("organization_id", 'member'::"text"))) WITH CHECK ((("recipient_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."is_organization_member"("organization_id", 'member'::"text")));



CREATE POLICY "members read WhatsApp booking consent evidence" ON "public"."whatsapp_booking_consent_evidence" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read WhatsApp preference events" ON "public"."whatsapp_preference_events" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read action centre deployments" ON "public"."action_centre_deployments" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read action ownership" ON "public"."action_centre_assignments" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read agent channel bindings" ON "public"."ai_agent_channel_bindings" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read agent conversation state" ON "public"."ai_agent_conversation_state" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read agent dispatches" ON "public"."ai_agent_dispatches" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read agents" ON "public"."ai_agent_profiles" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read appointment events" ON "public"."appointment_events" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read appointment queue" ON "public"."appointment_queue_entries" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read appointments" ON "public"."appointments" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read automation runs" ON "public"."automation_runs" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read automation workflows" ON "public"."automation_workflows" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read availability" ON "public"."availability_rules" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read booking bot sessions" ON "public"."whatsapp_booking_sessions" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read booking bot settings" ON "public"."whatsapp_booking_settings" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read booking pages" ON "public"."booking_pages" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read booking payments" ON "public"."booking_payments" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read booking requests" ON "public"."whatsapp_booking_requests" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read booking resources" ON "public"."booking_resources" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read care reminder runs" ON "public"."care_reminder_runs" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read care reminders" ON "public"."care_reminders" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read channel connections" ON "public"."channel_connections" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read clinic departments" ON "public"."clinic_departments" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read clinic pilot controls" ON "public"."clinic_pilot_controls" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read communication controls" ON "public"."organization_communication_controls" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read concierge dispatch health" ON "public"."whatsapp_concierge_dispatches" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read creative reservations" ON "public"."operational_creative_reservations" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read doctor import jobs" ON "public"."doctor_import_jobs" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read doctor queue dispatches" ON "public"."doctor_queue_dispatches" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read guardian links" ON "public"."patient_guardian_links" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read knowledge" ON "public"."rag_knowledge_items" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read message templates" ON "public"."channel_message_templates" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read own notifications" ON "public"."app_notifications" FOR SELECT TO "authenticated" USING ((("recipient_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND "private"."is_organization_member"("organization_id", 'member'::"text")));



CREATE POLICY "members read patient care plans" ON "public"."patient_care_plans" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read patient care tasks" ON "public"."patient_care_tasks" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read patient consent history" ON "public"."patient_consent_events" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read patient documents" ON "public"."patient_documents" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read patient encounters" ON "public"."patient_encounters" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read patient identity verification events" ON "public"."patient_identity_verification_events" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read patient profiles" ON "public"."patient_profiles" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read payment gateway status" ON "public"."payment_gateway_connections" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read prescription items" ON "public"."prescription_items" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read prescriptions" ON "public"."prescriptions" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read production readiness" ON "public"."production_readiness_checks" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read provider chamber assignments" ON "public"."provider_location_assignments" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read provider chamber services" ON "public"."provider_location_services" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read provider departments" ON "public"."provider_departments" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read provider profiles" ON "public"."provider_profiles" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read reconciliations" ON "public"."operational_reconciliation_runs" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read reminder events" ON "public"."reminder_events" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read sales rag dispatches" ON "public"."whatsapp_sales_rag_dispatches" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read schedule exceptions" ON "public"."schedule_exceptions" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read statements" ON "public"."operational_statements" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read topup intents" ON "public"."operational_topup_intents" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read waitlist" ON "public"."appointment_waitlist" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members read waitlist offers" ON "public"."waitlist_offers" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "members revoke own device push subscriptions" ON "public"."device_push_subscriptions" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."n8n_instances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."n8n_template_registry" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."onboarding_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."onboarding_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."operational_billing_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."operational_creative_reservations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."operational_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."operational_rate_card_audit" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."operational_reconciliation_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."operational_statements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."operational_topup_intents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."operational_usage_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."operational_wallet_ledger" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."operational_wallets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "opt_outs_manage" ON "public"."communication_opt_outs" TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'admin'::"text")) WITH CHECK ("private"."is_organization_member"("organization_id", 'admin'::"text"));



CREATE POLICY "opt_outs_read" ON "public"."communication_opt_outs" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", NULL::"text"));



CREATE POLICY "organization members read billing notices" ON "public"."billing_notice_events" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "organization members read billing orders" ON "public"."saas_billing_orders" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "organization members read invoices" ON "public"."saas_invoices" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "organization members read operational billing settings" ON "public"."operational_billing_settings" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "organization members read operational ledger" ON "public"."operational_wallet_ledger" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "organization members read operational usage" ON "public"."operational_usage_events" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



CREATE POLICY "organization members read operational wallets" ON "public"."operational_wallets" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'member'::"text"));



ALTER TABLE "public"."organization_communication_controls" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_services" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations_addresses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "owners can create onboarding profile" ON "public"."onboarding_profiles" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_organization_member"("organization_id", 'owner'::"text"));



CREATE POLICY "owners can create onboarding tokens" ON "public"."onboarding_tokens" FOR INSERT TO "authenticated", "anon" WITH CHECK (("organization_id" IN ( SELECT "public"."get_authorized_orgs"('owner'::"public"."role") AS "get_authorized_orgs")));



CREATE POLICY "owners can create their orgs api keys" ON "public"."api_keys" FOR INSERT TO "authenticated", "anon" WITH CHECK (("organization_id" IN ( SELECT "public"."get_authorized_orgs"('owner'::"public"."role") AS "get_authorized_orgs")));



CREATE POLICY "owners can delete business locations" ON "public"."business_locations" FOR DELETE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'owner'::"text"));



CREATE POLICY "owners can delete onboarding tokens" ON "public"."onboarding_tokens" FOR DELETE TO "authenticated", "anon" USING (("organization_id" IN ( SELECT "public"."get_authorized_orgs"('owner'::"public"."role") AS "get_authorized_orgs")));



CREATE POLICY "owners can delete organization services" ON "public"."organization_services" FOR DELETE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'owner'::"text"));



CREATE POLICY "owners can delete their orgs" ON "public"."organizations" FOR DELETE TO "authenticated", "anon" USING (("id" IN ( SELECT "public"."get_authorized_orgs"('owner'::"public"."role") AS "get_authorized_orgs")));



CREATE POLICY "owners can delete their orgs agents" ON "public"."agents" FOR DELETE TO "authenticated", "anon" USING (("organization_id" IN ( SELECT "public"."get_authorized_orgs"('owner'::"public"."role") AS "get_authorized_orgs")));



CREATE POLICY "owners can delete their orgs api keys" ON "public"."api_keys" FOR DELETE TO "authenticated", "anon" USING (("organization_id" IN ( SELECT "public"."get_authorized_orgs"('owner'::"public"."role") AS "get_authorized_orgs")));



CREATE POLICY "owners can read their org onboarding tokens" ON "public"."onboarding_tokens" FOR SELECT TO "authenticated", "anon" USING (("organization_id" IN ( SELECT "public"."get_authorized_orgs"('owner'::"public"."role") AS "get_authorized_orgs")));



CREATE POLICY "owners can read their orgs api keys" ON "public"."api_keys" FOR SELECT TO "authenticated", "anon" USING ((("key" = (("current_setting"('request.headers'::"text", true))::json ->> 'api-key'::"text")) OR ("organization_id" IN ( SELECT "public"."get_authorized_orgs"('owner'::"public"."role") AS "get_authorized_orgs"))));



CREATE POLICY "owners can send invitations" ON "public"."agents" FOR INSERT TO "authenticated", "anon" WITH CHECK ((("organization_id" IN ( SELECT "public"."get_authorized_orgs"('owner'::"public"."role") AS "get_authorized_orgs")) AND ("ai" = false) AND ((("extra" -> 'invitation'::"text") ->> 'status'::"text") = 'pending'::"text") AND ((("extra" -> 'invitation'::"text") ->> 'email'::"text") IS NOT NULL)));



CREATE POLICY "owners can update their orgs" ON "public"."organizations" FOR UPDATE TO "authenticated", "anon" USING (("id" IN ( SELECT "public"."get_authorized_orgs"('owner'::"public"."role") AS "get_authorized_orgs"))) WITH CHECK (("id" IN ( SELECT "public"."get_authorized_orgs"('owner'::"public"."role") AS "get_authorized_orgs")));



CREATE POLICY "owners can update their orgs agents" ON "public"."agents" FOR UPDATE TO "authenticated", "anon" USING (("organization_id" IN ( SELECT "public"."get_authorized_orgs"('owner'::"public"."role") AS "get_authorized_orgs"))) WITH CHECK ("public"."agent_update_by_owner_rules"("id", "user_id", "organization_id", "ai", "extra"));



CREATE POLICY "owners create booking payments" ON "public"."booking_payments" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_organization_member"("organization_id", 'owner'::"text"));



CREATE POLICY "owners create payment gateway status" ON "public"."payment_gateway_connections" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_organization_member"("organization_id", 'owner'::"text"));



CREATE POLICY "owners delete appointments" ON "public"."appointments" FOR DELETE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'owner'::"text"));



CREATE POLICY "owners delete automation workflows" ON "public"."automation_workflows" FOR DELETE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'owner'::"text"));



CREATE POLICY "owners delete availability" ON "public"."availability_rules" FOR DELETE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'owner'::"text"));



CREATE POLICY "owners delete booking bot settings" ON "public"."whatsapp_booking_settings" FOR DELETE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'owner'::"text"));



CREATE POLICY "owners delete booking payments" ON "public"."booking_payments" FOR DELETE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'owner'::"text"));



CREATE POLICY "owners delete booking resources" ON "public"."booking_resources" FOR DELETE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'owner'::"text"));



CREATE POLICY "owners delete knowledge" ON "public"."rag_knowledge_items" FOR DELETE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'owner'::"text"));



CREATE POLICY "owners delete patient care plans" ON "public"."patient_care_plans" FOR DELETE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'owner'::"text"));



CREATE POLICY "owners delete patient care tasks" ON "public"."patient_care_tasks" FOR DELETE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'owner'::"text"));



CREATE POLICY "owners delete patient documents" ON "public"."patient_documents" FOR DELETE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'owner'::"text"));



CREATE POLICY "owners delete patient encounters" ON "public"."patient_encounters" FOR DELETE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'owner'::"text"));



CREATE POLICY "owners delete patient profiles" ON "public"."patient_profiles" FOR DELETE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'owner'::"text"));



CREATE POLICY "owners delete payment gateway status" ON "public"."payment_gateway_connections" FOR DELETE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'owner'::"text"));



CREATE POLICY "owners delete provider chamber assignments" ON "public"."provider_location_assignments" FOR DELETE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'owner'::"text"));



CREATE POLICY "owners delete provider chamber services" ON "public"."provider_location_services" FOR DELETE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'owner'::"text"));



CREATE POLICY "owners delete provider profiles" ON "public"."provider_profiles" FOR DELETE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'owner'::"text"));



CREATE POLICY "owners manage channel connections" ON "public"."channel_connections" TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'owner'::"text")) WITH CHECK ("private"."is_organization_member"("organization_id", 'owner'::"text"));



CREATE POLICY "owners read rate audit" ON "public"."operational_rate_card_audit" FOR SELECT TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'owner'::"text"));



CREATE POLICY "owners update booking payments" ON "public"."booking_payments" FOR UPDATE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'owner'::"text")) WITH CHECK ("private"."is_organization_member"("organization_id", 'owner'::"text"));



CREATE POLICY "owners update payment gateway status" ON "public"."payment_gateway_connections" FOR UPDATE TO "authenticated" USING ("private"."is_organization_member"("organization_id", 'owner'::"text")) WITH CHECK ("private"."is_organization_member"("organization_id", 'owner'::"text"));



ALTER TABLE "public"."patient_care_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."patient_care_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."patient_consent_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."patient_data_request_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."patient_data_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."patient_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."patient_encounters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."patient_guardian_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."patient_identity_verification_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."patient_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_gateway_connections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "platform operators can read entitlements" ON "public"."entitlements" FOR SELECT TO "authenticated" USING ("private"."is_platform_operator"());



CREATE POLICY "platform operators can read organizations" ON "public"."organizations" FOR SELECT TO "authenticated" USING ("private"."is_platform_operator"());



ALTER TABLE "public"."prescription_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."prescriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."production_readiness_checks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."provider_departments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."provider_location_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."provider_location_services" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."provider_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "public reads active booking pages" ON "public"."booking_pages" FOR SELECT TO "authenticated", "anon" USING ("active");



ALTER TABLE "public"."quick_replies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rag_knowledge_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reminder_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."saas_billing_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."saas_invoices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."saas_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."schedule_exceptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."security_incident_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."security_incidents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."service_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."team_audit_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."usage_metering" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users can create orgs" ON "public"."organizations" FOR INSERT TO "authenticated" WITH CHECK (true);



ALTER TABLE "public"."waitlist_offers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."webhook_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."webhooks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_acceptance_observations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_acceptance_payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_acceptance_test_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_acceptance_test_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_booking_acceptance_checks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_booking_consent_evidence" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_booking_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_booking_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_booking_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_concierge_dispatches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_preference_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_rate_cards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_recovery_acceptance_fixtures" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_sales_rag_dispatches" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."conversations";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."messages";



GRANT USAGE ON SCHEMA "billing" TO "anon";
GRANT USAGE ON SCHEMA "billing" TO "authenticated";
GRANT USAGE ON SCHEMA "billing" TO "service_role";









GRANT USAGE ON SCHEMA "private" TO "authenticated";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";













































GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "billing"."change_plan"("_organization_id" "uuid", "_plan_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "billing"."check_limit"("_organization_id" "uuid", "_product_id" "text", "_amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "billing"."check_product_limit"() TO "service_role";



GRANT ALL ON FUNCTION "billing"."check_storage_limit"() TO "service_role";



GRANT ALL ON FUNCTION "billing"."initialize_subscription"() TO "service_role";



GRANT ALL ON FUNCTION "billing"."process_ledger_entry"() TO "service_role";



GRANT ALL ON FUNCTION "billing"."update_product_usage"() TO "service_role";



GRANT ALL ON FUNCTION "billing"."update_storage_usage"() TO "service_role";



GRANT ALL ON FUNCTION "billing"."update_usage"("_organization_id" "uuid", "_product_id" "text", "_quantity" numeric) TO "service_role";


















































































































































































































































































































































































































































































































































































































































































































































































































GRANT ALL ON TABLE "public"."whatsapp_acceptance_test_runs" TO "service_role";
GRANT SELECT ON TABLE "public"."whatsapp_acceptance_test_runs" TO "authenticated";



REVOKE ALL ON FUNCTION "private"."arm_whatsapp_acceptance_test"("p_organization_id" "uuid", "p_scenario_key" "text", "p_recipient_hash" "bytea", "p_recipient_last4" "text", "p_max_messages" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."arm_whatsapp_acceptance_test"("p_organization_id" "uuid", "p_scenario_key" "text", "p_recipient_hash" "bytea", "p_recipient_last4" "text", "p_max_messages" integer) TO "service_role";



REVOKE ALL ON FUNCTION "private"."arm_whatsapp_acceptance_test_from_delivery"("p_organization_id" "uuid", "p_scenario_key" "text", "p_verified_message_id" "uuid", "p_max_messages" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."arm_whatsapp_acceptance_test_from_delivery"("p_organization_id" "uuid", "p_scenario_key" "text", "p_verified_message_id" "uuid", "p_max_messages" integer) TO "service_role";



REVOKE ALL ON FUNCTION "private"."attach_deposit_acceptance_payment"("p_run_id" "uuid", "p_lease_token" "uuid", "p_payment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."attach_deposit_acceptance_payment"("p_run_id" "uuid", "p_lease_token" "uuid", "p_payment_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "private"."attach_public_booking_identity_core"("p_booking_reference" "text", "p_manage_token" "text", "p_booking_contact_name" "text", "p_booking_contact_phone" "text", "p_patient_relationship" "text", "p_patient_date_of_birth" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."attach_public_booking_identity_core"("p_booking_reference" "text", "p_manage_token" "text", "p_booking_contact_name" "text", "p_booking_contact_phone" "text", "p_patient_relationship" "text", "p_patient_date_of_birth" "date") TO "service_role";



REVOKE ALL ON FUNCTION "private"."audit_patient_data_request"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."audit_security_incident_change"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."authorize_prescription_medication_schedule"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."cancel_customer_booking_core"("p_booking_reference" "text", "p_manage_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."cancel_customer_booking_core"("p_booking_reference" "text", "p_manage_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."cancel_whatsapp_acceptance_tests"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."cancel_whatsapp_acceptance_tests"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "private"."capture_care_reminder_response"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."capture_patient_consent_changes"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."capture_whatsapp_delivery_failure"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."capture_whatsapp_opt_out"() FROM PUBLIC;



GRANT ALL ON TABLE "public"."automation_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."automation_runs" TO "service_role";



REVOKE ALL ON FUNCTION "private"."claim_due_automation_runs"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."claim_due_automation_runs"("p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "private"."claim_due_device_push_deliveries"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."claim_due_device_push_deliveries"("p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "private"."claim_whatsapp_acceptance_test"("p_organization_id" "uuid", "p_scenario_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."claim_whatsapp_acceptance_test"("p_organization_id" "uuid", "p_scenario_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."complete_whatsapp_acceptance_test"("p_run_id" "uuid", "p_lease_token" "uuid", "p_passed" boolean, "p_evidence_reference" "text", "p_failure_summary" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."complete_whatsapp_acceptance_test"("p_run_id" "uuid", "p_lease_token" "uuid", "p_passed" boolean, "p_evidence_reference" "text", "p_failure_summary" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."consume_public_request_limit"("p_bucket" "text", "p_scope" "text", "p_limit" integer, "p_window_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."consume_public_request_limit"("p_bucket" "text", "p_scope" "text", "p_limit" integer, "p_window_seconds" integer) TO "service_role";



REVOKE ALL ON FUNCTION "private"."dispatch_whatsapp_concierge_job"("p_dispatch_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."dispatch_whatsapp_concierge_job"("p_dispatch_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "private"."enforce_assignee_task_update"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."enforce_public_booking_rate_limit"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."enforce_public_booking_rate_limit"() TO "service_role";



REVOKE ALL ON FUNCTION "private"."enqueue_automation_event"("p_organization_id" "uuid", "p_trigger_key" "text", "p_event_key" "text", "p_safe_context" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."enqueue_automation_event"("p_organization_id" "uuid", "p_trigger_key" "text", "p_event_key" "text", "p_safe_context" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "private"."escalate_failed_care_plan_reminder"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."expire_stale_payment_holds"("p_resource_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."expire_waitlist_offers"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."expire_waitlist_offers"() TO "service_role";



REVOKE ALL ON FUNCTION "private"."get_customer_booking_core"("p_booking_reference" "text", "p_manage_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."get_customer_booking_core"("p_booking_reference" "text", "p_manage_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."get_public_booking_page_core"("p_slug" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."get_public_booking_page_core"("p_slug" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."get_public_booking_slots_core"("p_slug" "text", "p_service_id" "uuid", "p_location_id" "uuid", "p_resource_id" "uuid", "p_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."get_public_booking_slots_core"("p_slug" "text", "p_service_id" "uuid", "p_location_id" "uuid", "p_resource_id" "uuid", "p_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "private"."initialize_booking_defaults"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."initialize_omnirelay_workspace"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."initialize_operational_billing_workspace"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."invoke_whatsapp_agent_harness"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."invoke_whatsapp_agent_harness"() TO "service_role";



REVOKE ALL ON FUNCTION "private"."invoke_whatsapp_booking_concierge"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."invoke_whatsapp_booking_concierge"() TO "service_role";



REVOKE ALL ON FUNCTION "private"."invoke_whatsapp_sales_rag"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."invoke_whatsapp_sales_rag"() TO "service_role";



REVOKE ALL ON FUNCTION "private"."is_organization_member"("target_organization_id" "uuid", "minimum_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_organization_member"("target_organization_id" "uuid", "minimum_role" "text") TO "authenticated";



GRANT ALL ON FUNCTION "private"."is_platform_operator"("required_role" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."link_booking_request_consent"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."managed_booking_rollout_ready"("p_organization_id" "uuid", "p_workflow_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."managed_booking_rollout_ready"("p_organization_id" "uuid", "p_workflow_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "private"."mark_due_patient_follow_ups"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."materialize_billing_notices"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."materialize_billing_notices"() TO "service_role";



REVOKE ALL ON FUNCTION "private"."materialize_due_care_reminders"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."normalize_patient_care_task"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."normalize_phone_identity"("p_phone" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."normalize_phone_identity"("p_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "private"."normalize_phone_identity"("p_phone" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."notify_patient_care_task"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."notify_whatsapp_booking_action"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."observe_abandoned_recovery_acceptance"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."observe_abandoned_recovery_acceptance"() TO "service_role";



REVOKE ALL ON FUNCTION "private"."observe_appointment_reminder_automation"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."observe_care_reminder_automation"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."observe_doctor_queue_automation"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."observe_emergency_recipient_automation"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."observe_pilot_appointment_automation"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."observe_pilot_appointment_insert"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."observe_shadow_campaign_usage"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."observe_shadow_doctor_queue_usage"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."observe_shadow_reminder_usage"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."observe_whatsapp_command_acceptance"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."observe_whatsapp_command_acceptance"() TO "service_role";



REVOKE ALL ON FUNCTION "private"."offer_released_appointment_slot"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."offer_released_appointment_slot"() TO "service_role";



REVOKE ALL ON FUNCTION "private"."prepare_patient_data_request_update"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."prepare_security_incident_update"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."prevent_evidence_mutation"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."process_whatsapp_concierge_dispatches"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."process_whatsapp_concierge_dispatches"() TO "service_role";



REVOKE ALL ON FUNCTION "private"."queue_appointment_reminders"("p_appointment_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."queue_device_push_deliveries"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."queue_device_push_deliveries"() TO "service_role";



REVOKE ALL ON FUNCTION "private"."reconcile_automation_message_delivery"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."reconcile_automation_worker_alerts"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."reconcile_deposit_acceptance_payment"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."reconcile_isolated_acceptance_payment"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."record_shadow_operational_usage"("p_organization_id" "uuid", "p_source_type" "text", "p_source_id" "uuid", "p_provider_message_id" "text", "p_category" "text", "p_status" "text", "p_occurred_at" timestamp with time zone) FROM PUBLIC;



GRANT ALL ON TABLE "public"."whatsapp_booking_acceptance_checks" TO "service_role";
GRANT SELECT ON TABLE "public"."whatsapp_booking_acceptance_checks" TO "authenticated";



REVOKE ALL ON FUNCTION "private"."record_whatsapp_booking_acceptance"("p_organization_id" "uuid", "p_check_key" "text", "p_status" "text", "p_evidence_kind" "text", "p_evidence_summary" "text", "p_evidence_reference" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."record_whatsapp_booking_acceptance"("p_organization_id" "uuid", "p_check_key" "text", "p_status" "text", "p_evidence_kind" "text", "p_evidence_summary" "text", "p_evidence_reference" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."recover_stale_whatsapp_acceptance_tests"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."recover_stale_whatsapp_acceptance_tests"() TO "service_role";



REVOKE ALL ON FUNCTION "private"."redact_dispatched_booking_otp"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."refresh_automation_workflow_health"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."refresh_campaign_counts"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."reschedule_customer_booking_core"("p_booking_reference" "text", "p_manage_token" "text", "p_starts_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."reschedule_customer_booking_core"("p_booking_reference" "text", "p_manage_token" "text", "p_starts_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "private"."respond_waitlist_offer"("p_organization_id" "uuid", "p_patient_phone" "text", "p_action" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."respond_waitlist_offer"("p_organization_id" "uuid", "p_patient_phone" "text", "p_action" "text") TO "service_role";



REVOKE ALL ON FUNCTION "private"."run_whatsapp_booking_acceptance"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."run_whatsapp_booking_acceptance"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "private"."run_whatsapp_booking_acceptance_closure"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."run_whatsapp_booking_acceptance_closure"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "private"."stage_operational_rate_card"("p_organization_id" "uuid", "p_channel" "text", "p_country" "text", "p_category" "text", "p_rate" numeric, "p_source_url" "text", "p_source_version" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."sync_campaign_delivery_status"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."sync_care_plan_patient_reminder"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."sync_care_plan_review_task"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."sync_care_reminder_delivery_status"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."sync_care_reminder_run_from_message"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."sync_care_reminder_run_from_message"() TO "service_role";



REVOKE ALL ON FUNCTION "private"."sync_doctor_queue_dispatch_from_message"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."sync_doctor_queue_dispatch_from_message"() TO "service_role";



REVOKE ALL ON FUNCTION "private"."sync_patient_appointment_trigger"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."sync_patient_from_appointment"("p_appointment_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."sync_reminder_event_from_message"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."sync_reminder_event_from_message"() TO "service_role";



REVOKE ALL ON FUNCTION "private"."whatsapp_booking_acceptance_ready"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."whatsapp_booking_acceptance_ready"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."accept_workspace_invitations"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_workspace_invitations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_workspace_invitations"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."acquire_shadow_provider_slot"("p_provider_config_key" "text", "p_max_requests_per_minute" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."acquire_shadow_provider_slot"("p_provider_config_key" "text", "p_max_requests_per_minute" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."activate_medicine_catalog_release"("p_release_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."activate_medicine_catalog_release"("p_release_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."activate_saas_subscription"("p_provider_order_id" "text", "p_provider_payment_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."activate_saas_subscription"("p_provider_order_id" "text", "p_provider_payment_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."after_insert_on_organizations"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."after_insert_on_organizations"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."agent_update_by_owner_rules"("p_id" "uuid", "p_user_id" "uuid", "p_organization_id" "uuid", "p_ai" boolean, "p_extra" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."agent_update_by_owner_rules"("p_id" "uuid", "p_user_id" "uuid", "p_organization_id" "uuid", "p_ai" boolean, "p_extra" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."agent_update_by_owner_rules"("p_id" "uuid", "p_user_id" "uuid", "p_organization_id" "uuid", "p_ai" boolean, "p_extra" "jsonb") TO "service_role";



GRANT ALL ON TABLE "public"."automation_rollout_reviews" TO "service_role";
GRANT SELECT ON TABLE "public"."automation_rollout_reviews" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."approve_automation_rollout"("p_organization_id" "uuid", "p_workflow_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."approve_automation_rollout"("p_organization_id" "uuid", "p_workflow_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_automation_rollout"("p_organization_id" "uuid", "p_workflow_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."assign_appointment_queue_token"("p_organization_id" "uuid", "p_appointment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assign_appointment_queue_token"("p_organization_id" "uuid", "p_appointment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_appointment_queue_token"("p_organization_id" "uuid", "p_appointment_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."attach_public_booking_identity"("p_booking_reference" "text", "p_manage_token" "text", "p_booking_contact_name" "text", "p_booking_contact_phone" "text", "p_patient_relationship" "text", "p_patient_date_of_birth" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."attach_public_booking_identity"("p_booking_reference" "text", "p_manage_token" "text", "p_booking_contact_name" "text", "p_booking_contact_phone" "text", "p_patient_relationship" "text", "p_patient_date_of_birth" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."attach_public_payment_order"("p_booking_reference" "text", "p_manage_token" "text", "p_provider_order_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."attach_public_payment_order"("p_booking_reference" "text", "p_manage_token" "text", "p_provider_order_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."before_insert_on_conversations"() TO "anon";
GRANT ALL ON FUNCTION "public"."before_insert_on_conversations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."before_insert_on_conversations"() TO "service_role";



GRANT ALL ON FUNCTION "public"."before_insert_on_messages"() TO "anon";
GRANT ALL ON FUNCTION "public"."before_insert_on_messages"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."before_insert_on_messages"() TO "service_role";



GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_customer_booking"("p_booking_reference" "text", "p_manage_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_customer_booking"("p_booking_reference" "text", "p_manage_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_deposit_acceptance_dispatch"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_deposit_acceptance_dispatch"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."reminder_events" TO "anon";
GRANT ALL ON TABLE "public"."reminder_events" TO "authenticated";
GRANT ALL ON TABLE "public"."reminder_events" TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_due_appointment_reminders"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_due_appointment_reminders"("p_limit" integer) TO "service_role";



GRANT ALL ON TABLE "public"."care_reminder_runs" TO "anon";
GRANT ALL ON TABLE "public"."care_reminder_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."care_reminder_runs" TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_due_care_reminder_runs"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_due_care_reminder_runs"("p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_due_device_push_deliveries"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_due_device_push_deliveries"("p_limit" integer) TO "service_role";



GRANT ALL ON TABLE "public"."doctor_queue_dispatches" TO "authenticated";
GRANT ALL ON TABLE "public"."doctor_queue_dispatches" TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_due_doctor_queue_dispatches"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_due_doctor_queue_dispatches"("p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_managed_automation_runs"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_managed_automation_runs"("p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_orphaned_contact_on_sync"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_orphaned_contact_on_sync"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_orphaned_contact_on_sync"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_unlinked_address_if_empty"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_unlinked_address_if_empty"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_unlinked_address_if_empty"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."communication_control_enabled"("p_organization_id" "uuid", "p_control" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."communication_control_enabled"("p_organization_id" "uuid", "p_control" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_appointment_visit"("p_organization_id" "uuid", "p_appointment_id" "uuid", "p_clinical_note" "text", "p_diagnosis" "text", "p_treatment_plan" "text", "p_follow_up_at" timestamp with time zone, "p_follow_up_note" "text", "p_encounter_type" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_appointment_visit"("p_organization_id" "uuid", "p_appointment_id" "uuid", "p_clinical_note" "text", "p_diagnosis" "text", "p_treatment_plan" "text", "p_follow_up_at" timestamp with time zone, "p_follow_up_note" "text", "p_encounter_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_appointment_visit"("p_organization_id" "uuid", "p_appointment_id" "uuid", "p_clinical_note" "text", "p_diagnosis" "text", "p_treatment_plan" "text", "p_follow_up_at" timestamp with time zone, "p_follow_up_note" "text", "p_encounter_type" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_clinical_consultation"("p_organization_id" "uuid", "p_appointment_id" "uuid", "p_encounter_type" "text", "p_diagnosis" "text", "p_clinical_note" "text", "p_treatment_plan" "text", "p_follow_up_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_clinical_consultation"("p_organization_id" "uuid", "p_appointment_id" "uuid", "p_encounter_type" "text", "p_diagnosis" "text", "p_clinical_note" "text", "p_treatment_plan" "text", "p_follow_up_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_clinical_consultation"("p_organization_id" "uuid", "p_appointment_id" "uuid", "p_encounter_type" "text", "p_diagnosis" "text", "p_clinical_note" "text", "p_treatment_plan" "text", "p_follow_up_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_deposit_acceptance_dispatch"("p_run_id" "uuid", "p_lease_token" "uuid", "p_passed" boolean, "p_evidence_reference" "text", "p_failure_summary" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_deposit_acceptance_dispatch"("p_run_id" "uuid", "p_lease_token" "uuid", "p_passed" boolean, "p_evidence_reference" "text", "p_failure_summary" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_managed_automation_run"("p_run_id" "uuid", "p_succeeded" boolean, "p_retryable" boolean, "p_failure_code" "text", "p_failure_summary" "text", "p_observed_message_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_managed_automation_run"("p_run_id" "uuid", "p_succeeded" boolean, "p_retryable" boolean, "p_failure_code" "text", "p_failure_summary" "text", "p_observed_message_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_whatsapp_booking_handoff"("p_handoff_token" "text", "p_booking_reference" "text", "p_manage_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_whatsapp_booking_handoff"("p_handoff_token" "text", "p_booking_reference" "text", "p_manage_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_workspace_onboarding"("p_business_name" "text", "p_business_category" "text", "p_location_count" integer, "p_timezone" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_workspace_onboarding"("p_business_name" "text", "p_business_category" "text", "p_location_count" integer, "p_timezone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_workspace_onboarding"("p_business_name" "text", "p_business_category" "text", "p_location_count" integer, "p_timezone" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_workspace_onboarding"("p_business_name" "text", "p_business_category" "text", "p_location_count" integer, "p_timezone" "text", "p_clinic_mode" "text", "p_primary_provider_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_workspace_onboarding"("p_business_name" "text", "p_business_category" "text", "p_location_count" integer, "p_timezone" "text", "p_clinic_mode" "text", "p_primary_provider_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_workspace_onboarding"("p_business_name" "text", "p_business_category" "text", "p_location_count" integer, "p_timezone" "text", "p_clinic_mode" "text", "p_primary_provider_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."confirm_public_payment"("p_booking_reference" "text", "p_manage_token" "text", "p_provider_order_id" "text", "p_provider_payment_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirm_public_payment"("p_booking_reference" "text", "p_manage_token" "text", "p_provider_order_id" "text", "p_provider_payment_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_api_rate_limit"("p_bucket" "text", "p_limit" integer, "p_window_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_api_rate_limit"("p_bucket" "text", "p_limit" integer, "p_window_seconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."consume_api_rate_limit"("p_bucket" "text", "p_limit" integer, "p_window_seconds" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_booking_phone_verification"("p_challenge_id" "uuid", "p_verification_token" "text", "p_booking_reference" "text", "p_manage_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_booking_phone_verification"("p_challenge_id" "uuid", "p_verification_token" "text", "p_booking_reference" "text", "p_manage_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_public_server_rate_limit"("p_bucket" "text", "p_scope" "text", "p_client_signal" "text", "p_limit" integer, "p_window_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_public_server_rate_limit"("p_bucket" "text", "p_scope" "text", "p_client_signal" "text", "p_limit" integer, "p_window_seconds" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."contact_address_update_rules"("p_organization_id" "uuid", "p_service" "public"."service", "p_address" "text", "p_extra" "jsonb", "p_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."contact_address_update_rules"("p_organization_id" "uuid", "p_service" "public"."service", "p_address" "text", "p_extra" "jsonb", "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."contact_address_update_rules"("p_organization_id" "uuid", "p_service" "public"."service", "p_address" "text", "p_extra" "jsonb", "p_status" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."control_automation_run"("p_organization_id" "uuid", "p_run_id" "uuid", "p_action" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."control_automation_run"("p_organization_id" "uuid", "p_run_id" "uuid", "p_action" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."control_automation_run"("p_organization_id" "uuid", "p_run_id" "uuid", "p_action" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_appointment"("p_organization_id" "uuid", "p_resource_id" "uuid", "p_location_id" "uuid", "p_service_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_starts_at" timestamp with time zone, "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_appointment"("p_organization_id" "uuid", "p_resource_id" "uuid", "p_location_id" "uuid", "p_service_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_starts_at" timestamp with time zone, "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_appointment"("p_organization_id" "uuid", "p_resource_id" "uuid", "p_location_id" "uuid", "p_service_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_starts_at" timestamp with time zone, "p_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_booking_phone_otp_challenge"("p_slug" "text", "p_phone" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_booking_phone_otp_challenge"("p_slug" "text", "p_phone" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_patient_data_request_from_portal"("p_token" "text", "p_request_type" "text", "p_summary" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_patient_data_request_from_portal"("p_token" "text", "p_request_type" "text", "p_summary" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_patient_portal_session"("p_organization_id" "uuid", "p_phone" "text", "p_conversation_id" "uuid", "p_scope" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_patient_portal_session"("p_organization_id" "uuid", "p_phone" "text", "p_conversation_id" "uuid", "p_scope" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_public_appointment"("p_slug" "text", "p_resource_id" "uuid", "p_location_id" "uuid", "p_service_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_starts_at" timestamp with time zone, "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_public_appointment"("p_slug" "text", "p_resource_id" "uuid", "p_location_id" "uuid", "p_service_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_starts_at" timestamp with time zone, "p_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_public_appointment_v2"("p_slug" "text", "p_resource_id" "uuid", "p_location_id" "uuid", "p_service_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_starts_at" timestamp with time zone, "p_notes" "text", "p_intake" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_public_appointment_v2"("p_slug" "text", "p_resource_id" "uuid", "p_location_id" "uuid", "p_service_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_starts_at" timestamp with time zone, "p_notes" "text", "p_intake" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_public_appointment_v2"("p_slug" "text", "p_resource_id" "uuid", "p_location_id" "uuid", "p_service_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_starts_at" timestamp with time zone, "p_notes" "text", "p_intake" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_public_appointment_v2"("p_slug" "text", "p_resource_id" "uuid", "p_location_id" "uuid", "p_service_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_starts_at" timestamp with time zone, "p_notes" "text", "p_intake" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_public_payment_intent"("p_slug" "text", "p_resource_id" "uuid", "p_location_id" "uuid", "p_service_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_starts_at" timestamp with time zone, "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_public_payment_intent"("p_slug" "text", "p_resource_id" "uuid", "p_location_id" "uuid", "p_service_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_starts_at" timestamp with time zone, "p_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_public_payment_intent_v2"("p_slug" "text", "p_resource_id" "uuid", "p_location_id" "uuid", "p_service_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_starts_at" timestamp with time zone, "p_notes" "text", "p_intake" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_public_payment_intent_v2"("p_slug" "text", "p_resource_id" "uuid", "p_location_id" "uuid", "p_service_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_starts_at" timestamp with time zone, "p_notes" "text", "p_intake" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_public_payment_intent_v3"("p_slug" "text", "p_resource_id" "uuid", "p_location_id" "uuid", "p_service_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_starts_at" timestamp with time zone, "p_selected_payment_mode" "text", "p_notes" "text", "p_intake" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_public_payment_intent_v3"("p_slug" "text", "p_resource_id" "uuid", "p_location_id" "uuid", "p_service_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_starts_at" timestamp with time zone, "p_selected_payment_mode" "text", "p_notes" "text", "p_intake" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_schedule_exception"("p_organization_id" "uuid", "p_resource_id" "uuid", "p_location_id" "uuid", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_exception_type" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_schedule_exception"("p_organization_id" "uuid", "p_resource_id" "uuid", "p_location_id" "uuid", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_exception_type" "text", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_schedule_exception"("p_organization_id" "uuid", "p_resource_id" "uuid", "p_location_id" "uuid", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_exception_type" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_schedule_exception"("p_organization_id" "uuid", "p_resource_id" "uuid", "p_location_id" "uuid", "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone, "p_exception_type" "text", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_shadow_evaluation_run"("p_test_set_version" "text", "p_tenant_id" "uuid", "p_provider" "text", "p_model_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_shadow_evaluation_run"("p_test_set_version" "text", "p_tenant_id" "uuid", "p_provider" "text", "p_model_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_whatsapp_booking_handoff"("p_organization_id" "uuid", "p_session_id" "uuid", "p_conversation_id" "uuid", "p_source_message_id" "uuid", "p_consent_evidence_id" "uuid", "p_context" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_whatsapp_booking_handoff"("p_organization_id" "uuid", "p_session_id" "uuid", "p_conversation_id" "uuid", "p_source_message_id" "uuid", "p_consent_evidence_id" "uuid", "p_context" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_whatsapp_handoff_appointment"("p_handoff_token" "text", "p_slug" "text", "p_resource_id" "uuid", "p_location_id" "uuid", "p_service_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_starts_at" timestamp with time zone, "p_booking_contact_name" "text", "p_booking_contact_phone" "text", "p_patient_relationship" "text", "p_patient_date_of_birth" "date", "p_notes" "text", "p_intake" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_whatsapp_handoff_appointment"("p_handoff_token" "text", "p_slug" "text", "p_resource_id" "uuid", "p_location_id" "uuid", "p_service_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_starts_at" timestamp with time zone, "p_booking_contact_name" "text", "p_booking_contact_phone" "text", "p_patient_relationship" "text", "p_patient_date_of_birth" "date", "p_notes" "text", "p_intake" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_whatsapp_handoff_payment_intent"("p_handoff_token" "text", "p_slug" "text", "p_resource_id" "uuid", "p_location_id" "uuid", "p_service_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_starts_at" timestamp with time zone, "p_selected_payment_mode" "text", "p_booking_contact_name" "text", "p_booking_contact_phone" "text", "p_patient_relationship" "text", "p_patient_date_of_birth" "date", "p_notes" "text", "p_intake" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_whatsapp_handoff_payment_intent"("p_handoff_token" "text", "p_slug" "text", "p_resource_id" "uuid", "p_location_id" "uuid", "p_service_id" "uuid", "p_customer_name" "text", "p_customer_phone" "text", "p_customer_email" "text", "p_starts_at" timestamp with time zone, "p_selected_payment_mode" "text", "p_booking_contact_name" "text", "p_booking_contact_phone" "text", "p_patient_relationship" "text", "p_patient_date_of_birth" "date", "p_notes" "text", "p_intake" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."decide_whatsapp_booking_request"("p_organization_id" "uuid", "p_request_id" "uuid", "p_decision" "text", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."decide_whatsapp_booking_request"("p_organization_id" "uuid", "p_request_id" "uuid", "p_decision" "text", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."decide_whatsapp_booking_request"("p_organization_id" "uuid", "p_request_id" "uuid", "p_decision" "text", "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."deploy_due_clinic_actions"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."deploy_due_clinic_actions"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."deploy_due_clinic_actions"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."automation_workflows" TO "authenticated";
GRANT ALL ON TABLE "public"."automation_workflows" TO "service_role";



REVOKE ALL ON FUNCTION "public"."disable_managed_booking_canary"("p_organization_id" "uuid", "p_workflow_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."disable_managed_booking_canary"("p_organization_id" "uuid", "p_workflow_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."dispatcher_edge_function"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dispatcher_edge_function"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."edge_function"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."edge_function"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enable_managed_booking_canary"("p_organization_id" "uuid", "p_workflow_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enable_managed_booking_canary"("p_organization_id" "uuid", "p_workflow_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_invitation_status_flow"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_invitation_status_flow"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_invitation_status_flow"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_schedule_exception"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_schedule_exception"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_schedule_exception"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."exchange_patient_portal_link"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."exchange_patient_portal_link"("p_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_authorized_orgs"("role" "public"."role") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_authorized_orgs"("role" "public"."role") TO "anon";
GRANT ALL ON FUNCTION "public"."get_authorized_orgs"("role" "public"."role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_authorized_orgs"("role" "public"."role") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_automation_rollout_readiness"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_automation_rollout_readiness"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_automation_rollout_readiness"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_customer_booking"("p_booking_reference" "text", "p_manage_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_customer_booking"("p_booking_reference" "text", "p_manage_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_existing_booking_confirmation"("p_organization_id" "uuid", "p_appointment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_existing_booking_confirmation"("p_organization_id" "uuid", "p_appointment_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_multi_doctor_booking_acceptance"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_multi_doctor_booking_acceptance"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_multi_doctor_booking_acceptance"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_oem_tenant_health"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_oem_tenant_health"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_oem_tenant_health"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_patient_data_requests_from_portal"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_patient_data_requests_from_portal"("p_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_patient_portal"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_patient_portal"("p_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_public_booking_page"("p_slug" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_booking_page"("p_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_booking_page"("p_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_booking_page"("p_slug" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_public_booking_slots"("p_slug" "text", "p_service_id" "uuid", "p_location_id" "uuid", "p_resource_id" "uuid", "p_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_booking_slots"("p_slug" "text", "p_service_id" "uuid", "p_location_id" "uuid", "p_resource_id" "uuid", "p_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_booking_slots"("p_slug" "text", "p_service_id" "uuid", "p_location_id" "uuid", "p_resource_id" "uuid", "p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_booking_slots"("p_slug" "text", "p_service_id" "uuid", "p_location_id" "uuid", "p_resource_id" "uuid", "p_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_public_site_url"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_site_url"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_whatsapp_booking_acceptance"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_whatsapp_booking_acceptance"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_whatsapp_booking_acceptance"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_whatsapp_booking_handoff"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_whatsapp_booking_handoff"("p_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "postgres";
GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "anon";
GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "authenticated";
GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "service_role";



REVOKE ALL ON FUNCTION "public"."has_permission"("_user_id" "uuid", "_org_id" "uuid", "_permission" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_permission"("_user_id" "uuid", "_org_id" "uuid", "_permission" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "service_role";



REVOKE ALL ON FUNCTION "public"."import_doctor_roster"("p_organization_id" "uuid", "p_rows" "jsonb", "p_commit" boolean, "p_source_format" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."import_doctor_roster"("p_organization_id" "uuid", "p_rows" "jsonb", "p_commit" boolean, "p_source_format" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."import_doctor_roster"("p_organization_id" "uuid", "p_rows" "jsonb", "p_commit" boolean, "p_source_format" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."import_doctor_roster_v2"("p_organization_id" "uuid", "p_rows" "jsonb", "p_commit" boolean, "p_source_format" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."import_doctor_roster_v2"("p_organization_id" "uuid", "p_rows" "jsonb", "p_commit" boolean, "p_source_format" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."import_doctor_roster_v2"("p_organization_id" "uuid", "p_rows" "jsonb", "p_commit" boolean, "p_source_format" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."init_data"("p_organization_id" "uuid", "p_limit" integer, "p_per_conversation" integer, "p_since" timestamp with time zone, "p_until" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."init_data"("p_organization_id" "uuid", "p_limit" integer, "p_per_conversation" integer, "p_since" timestamp with time zone, "p_until" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."init_data"("p_organization_id" "uuid", "p_limit" integer, "p_per_conversation" integer, "p_since" timestamp with time zone, "p_until" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_oem_operator"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_oem_operator"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_oem_operator"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."issue_clinical_prescription"("p_organization_id" "uuid", "p_patient_id" "uuid", "p_encounter_id" "uuid", "p_appointment_id" "uuid", "p_diagnosis" "text", "p_advice" "text", "p_tests_requested" "text", "p_follow_up_at" timestamp with time zone, "p_medicines" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."issue_clinical_prescription"("p_organization_id" "uuid", "p_patient_id" "uuid", "p_encounter_id" "uuid", "p_appointment_id" "uuid", "p_diagnosis" "text", "p_advice" "text", "p_tests_requested" "text", "p_follow_up_at" timestamp with time zone, "p_medicines" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."issue_clinical_prescription"("p_organization_id" "uuid", "p_patient_id" "uuid", "p_encounter_id" "uuid", "p_appointment_id" "uuid", "p_diagnosis" "text", "p_advice" "text", "p_tests_requested" "text", "p_follow_up_at" timestamp with time zone, "p_medicines" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "postgres";
GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "anon";
GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "authenticated";
GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "service_role";



GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "service_role";



REVOKE ALL ON FUNCTION "public"."link_whatsapp_booking_consent"("p_consent_evidence_id" "uuid", "p_appointment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."link_whatsapp_booking_consent"("p_consent_evidence_id" "uuid", "p_appointment_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."lookup_agents_by_email_after_insert_on_auth_users"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."lookup_agents_by_email_after_insert_on_auth_users"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."lookup_user_id_by_email_before_insert_on_agents"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."lookup_user_id_by_email_before_insert_on_agents"() TO "service_role";



GRANT ALL ON FUNCTION "public"."manage_contact_on_address_sync"() TO "anon";
GRANT ALL ON FUNCTION "public"."manage_contact_on_address_sync"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."manage_contact_on_address_sync"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."manage_whatsapp_appointment"("p_organization_id" "uuid", "p_conversation_id" "uuid", "p_contact_address" "text", "p_appointment_id" "uuid", "p_action" "text", "p_starts_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."manage_whatsapp_appointment"("p_organization_id" "uuid", "p_conversation_id" "uuid", "p_contact_address" "text", "p_appointment_id" "uuid", "p_action" "text", "p_starts_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."match_knowledge_chunks"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer, "p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_knowledge_chunks"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer, "p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."match_rag_knowledge_chunks"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer, "p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_rag_knowledge_chunks"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer, "p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."materialize_due_doctor_queue_dispatches"("p_now" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."materialize_due_doctor_queue_dispatches"("p_now" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."member_self_update_rules"("p_id" "uuid", "p_user_id" "uuid", "p_organization_id" "uuid", "p_ai" boolean, "p_extra" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."member_self_update_rules"("p_id" "uuid", "p_user_id" "uuid", "p_organization_id" "uuid", "p_ai" boolean, "p_extra" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."member_self_update_rules"("p_id" "uuid", "p_user_id" "uuid", "p_organization_id" "uuid", "p_ai" boolean, "p_extra" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."merge_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."merge_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."merge_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."merge_update_jsonb"("target" "jsonb", "path" "text"[], "object" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."merge_update_jsonb"("target" "jsonb", "path" "text"[], "object" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."merge_update_jsonb"("target" "jsonb", "path" "text"[], "object" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."moddatetime"() TO "postgres";
GRANT ALL ON FUNCTION "public"."moddatetime"() TO "anon";
GRANT ALL ON FUNCTION "public"."moddatetime"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."moddatetime"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_webhook"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_webhook"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."org_update_by_admin_rules"("p_id" "uuid", "p_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."org_update_by_admin_rules"("p_id" "uuid", "p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."org_update_by_admin_rules"("p_id" "uuid", "p_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."patient_portal_cancel"("p_token" "text", "p_appointment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."patient_portal_cancel"("p_token" "text", "p_appointment_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."patient_portal_reschedule"("p_token" "text", "p_appointment_id" "uuid", "p_starts_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."patient_portal_reschedule"("p_token" "text", "p_appointment_id" "uuid", "p_starts_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."pause_conversation_on_human_message"() TO "anon";
GRANT ALL ON FUNCTION "public"."pause_conversation_on_human_message"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pause_conversation_on_human_message"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prepare_abandoned_recovery_acceptance"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prepare_abandoned_recovery_acceptance"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."prepare_deposit_acceptance_test"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prepare_deposit_acceptance_test"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."prepare_whatsapp_acceptance_scenario"("p_organization_id" "uuid", "p_scenario_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prepare_whatsapp_acceptance_scenario"("p_organization_id" "uuid", "p_scenario_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."preserve_message_direction"() TO "anon";
GRANT ALL ON FUNCTION "public"."preserve_message_direction"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."preserve_message_direction"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_last_owner_deletion"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_last_owner_deletion"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_last_owner_deletion"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."reassign_appointment_provider"("p_organization_id" "uuid", "p_appointment_id" "uuid", "p_resource_id" "uuid", "p_starts_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reassign_appointment_provider"("p_organization_id" "uuid", "p_appointment_id" "uuid", "p_resource_id" "uuid", "p_starts_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."reassign_appointment_provider"("p_organization_id" "uuid", "p_appointment_id" "uuid", "p_resource_id" "uuid", "p_starts_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_shadow_provider_result"("p_provider_config_key" "text", "p_retryable_failure" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_shadow_provider_result"("p_provider_config_key" "text", "p_retryable_failure" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_webhook_event"("p_event_id" "text", "p_provider" "text", "p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_webhook_event"("p_event_id" "text", "p_provider" "text", "p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_whatsapp_booking_consent"("p_organization_id" "uuid", "p_conversation_id" "uuid", "p_session_id" "uuid", "p_source_message_id" "uuid", "p_channel_identity" "text", "p_notice_version" "text", "p_notice_text" "text", "p_action" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_whatsapp_booking_consent"("p_organization_id" "uuid", "p_conversation_id" "uuid", "p_session_id" "uuid", "p_source_message_id" "uuid", "p_channel_identity" "text", "p_notice_version" "text", "p_notice_text" "text", "p_action" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_whatsapp_identity_verification"("p_organization_id" "uuid", "p_conversation_id" "uuid", "p_session_id" "uuid", "p_source_message_id" "uuid", "p_channel_identity" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_whatsapp_identity_verification"("p_organization_id" "uuid", "p_conversation_id" "uuid", "p_session_id" "uuid", "p_source_message_id" "uuid", "p_channel_identity" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."recover_stale_managed_automation_runs"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."recover_stale_managed_automation_runs"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."refresh_priority_action_alerts"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_priority_action_alerts"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_priority_action_alerts"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reschedule_appointment"("p_organization_id" "uuid", "p_appointment_id" "uuid", "p_starts_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reschedule_appointment"("p_organization_id" "uuid", "p_appointment_id" "uuid", "p_starts_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."reschedule_appointment"("p_organization_id" "uuid", "p_appointment_id" "uuid", "p_starts_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."reschedule_customer_booking"("p_booking_reference" "text", "p_manage_token" "text", "p_starts_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reschedule_customer_booking"("p_booking_reference" "text", "p_manage_token" "text", "p_starts_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."respond_waitlist_offer"("p_organization_id" "uuid", "p_patient_phone" "text", "p_action" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."respond_waitlist_offer"("p_organization_id" "uuid", "p_patient_phone" "text", "p_action" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."restore_whatsapp_care_consent"("p_organization_id" "uuid", "p_conversation_id" "uuid", "p_session_id" "uuid", "p_source_message_id" "uuid", "p_channel_identity" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."restore_whatsapp_care_consent"("p_organization_id" "uuid", "p_conversation_id" "uuid", "p_session_id" "uuid", "p_source_message_id" "uuid", "p_channel_identity" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."retry_failed_automation_job"("p_organization_id" "uuid", "p_job_kind" "text", "p_job_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."retry_failed_automation_job"("p_organization_id" "uuid", "p_job_kind" "text", "p_job_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."retry_failed_automation_job"("p_organization_id" "uuid", "p_job_kind" "text", "p_job_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."revoke_patient_portal_session"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."revoke_patient_portal_session"("p_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_provider_chamber_schedule"("p_organization_id" "uuid", "p_resource_id" "uuid", "p_location_id" "uuid", "p_active" boolean, "p_effective_from" "date", "p_effective_to" "date", "p_booking_window_days" integer, "p_services" "jsonb", "p_sessions" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_provider_chamber_schedule"("p_organization_id" "uuid", "p_resource_id" "uuid", "p_location_id" "uuid", "p_active" boolean, "p_effective_from" "date", "p_effective_to" "date", "p_booking_window_days" integer, "p_services" "jsonb", "p_sessions" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."save_provider_chamber_schedule"("p_organization_id" "uuid", "p_resource_id" "uuid", "p_location_id" "uuid", "p_active" boolean, "p_effective_from" "date", "p_effective_to" "date", "p_booking_window_days" integer, "p_services" "jsonb", "p_sessions" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_provider_chamber_schedule"("p_organization_id" "uuid", "p_resource_id" "uuid", "p_location_id" "uuid", "p_active" boolean, "p_effective_from" "date", "p_effective_to" "date", "p_booking_window_days" integer, "p_services" "jsonb", "p_sessions" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."schedule_doctor_queue_notification"("p_organization_id" "uuid", "p_availability_rule_id" "uuid", "p_shift_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."schedule_doctor_queue_notification"("p_organization_id" "uuid", "p_availability_rule_id" "uuid", "p_shift_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."schedule_doctor_queue_notification"("p_organization_id" "uuid", "p_availability_rule_id" "uuid", "p_shift_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."search_active_medicines"("p_query" "text", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."search_active_medicines"("p_query" "text", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_active_medicines"("p_query" "text", "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_appointment_follow_up"("p_organization_id" "uuid", "p_appointment_id" "uuid", "p_follow_up_at" timestamp with time zone, "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_appointment_follow_up"("p_organization_id" "uuid", "p_appointment_id" "uuid", "p_follow_up_at" timestamp with time zone, "p_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_appointment_follow_up"("p_organization_id" "uuid", "p_appointment_id" "uuid", "p_follow_up_at" timestamp with time zone, "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_appointment_follow_up"("p_organization_id" "uuid", "p_appointment_id" "uuid", "p_follow_up_at" timestamp with time zone, "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_doctor_queue_consent"("p_organization_id" "uuid", "p_resource_id" "uuid", "p_enabled" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_doctor_queue_consent"("p_organization_id" "uuid", "p_resource_id" "uuid", "p_enabled" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_doctor_queue_consent"("p_organization_id" "uuid", "p_resource_id" "uuid", "p_enabled" boolean) TO "service_role";



GRANT ALL ON TABLE "public"."patient_profiles" TO "anon";
GRANT ALL ON TABLE "public"."patient_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."patient_profiles" TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_patient_consents"("p_patient_id" "uuid", "p_care_communications" boolean, "p_marketing" boolean, "p_source" "text", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_patient_consents"("p_patient_id" "uuid", "p_care_communications" boolean, "p_marketing" boolean, "p_source" "text", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_patient_consents"("p_patient_id" "uuid", "p_care_communications" boolean, "p_marketing" boolean, "p_source" "text", "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_queue_now_serving"("p_organization_id" "uuid", "p_resource_id" "uuid", "p_location_id" "uuid", "p_queue_date" "date", "p_token_number" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_queue_now_serving"("p_organization_id" "uuid", "p_resource_id" "uuid", "p_location_id" "uuid", "p_queue_date" "date", "p_token_number" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_queue_now_serving"("p_organization_id" "uuid", "p_resource_id" "uuid", "p_location_id" "uuid", "p_queue_date" "date", "p_token_number" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."track_conversation_usage"("p_organization_id" "uuid", "p_contact_address" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."track_conversation_usage"("p_organization_id" "uuid", "p_contact_address" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_appointment_status"("p_organization_id" "uuid", "p_appointment_id" "uuid", "p_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_appointment_status"("p_organization_id" "uuid", "p_appointment_id" "uuid", "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_appointment_status"("p_organization_id" "uuid", "p_appointment_id" "uuid", "p_status" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "service_role";



REVOKE ALL ON FUNCTION "public"."verify_booking_phone_otp"("p_challenge_id" "uuid", "p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verify_booking_phone_otp"("p_challenge_id" "uuid", "p_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."write_shadow_audit_record"("p_record" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."write_shadow_audit_record"("p_record" "jsonb") TO "service_role";












GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "service_role";



GRANT SELECT ON TABLE "billing"."accounts" TO "anon";
GRANT SELECT ON TABLE "billing"."accounts" TO "authenticated";
GRANT SELECT,INSERT,UPDATE ON TABLE "billing"."accounts" TO "service_role";



GRANT SELECT ON TABLE "billing"."costs" TO "anon";
GRANT SELECT ON TABLE "billing"."costs" TO "authenticated";
GRANT SELECT,INSERT,UPDATE ON TABLE "billing"."costs" TO "service_role";



GRANT SELECT ON TABLE "billing"."invoices" TO "anon";
GRANT SELECT ON TABLE "billing"."invoices" TO "authenticated";
GRANT SELECT,INSERT,UPDATE ON TABLE "billing"."invoices" TO "service_role";



GRANT SELECT ON TABLE "billing"."invoices_items" TO "anon";
GRANT SELECT ON TABLE "billing"."invoices_items" TO "authenticated";
GRANT SELECT,INSERT,UPDATE ON TABLE "billing"."invoices_items" TO "service_role";



GRANT SELECT ON TABLE "billing"."ledger" TO "anon";
GRANT SELECT ON TABLE "billing"."ledger" TO "authenticated";
GRANT SELECT,INSERT,UPDATE ON TABLE "billing"."ledger" TO "service_role";



GRANT SELECT ON TABLE "billing"."payments" TO "anon";
GRANT SELECT ON TABLE "billing"."payments" TO "authenticated";
GRANT SELECT,INSERT,UPDATE ON TABLE "billing"."payments" TO "service_role";



GRANT SELECT ON TABLE "billing"."plans" TO "anon";
GRANT SELECT ON TABLE "billing"."plans" TO "authenticated";
GRANT SELECT,INSERT,UPDATE ON TABLE "billing"."plans" TO "service_role";



GRANT SELECT ON TABLE "billing"."plans_products" TO "anon";
GRANT SELECT ON TABLE "billing"."plans_products" TO "authenticated";
GRANT SELECT,INSERT,UPDATE ON TABLE "billing"."plans_products" TO "service_role";



GRANT SELECT ON TABLE "billing"."products" TO "anon";
GRANT SELECT ON TABLE "billing"."products" TO "authenticated";
GRANT SELECT,INSERT,UPDATE ON TABLE "billing"."products" TO "service_role";



GRANT SELECT ON TABLE "billing"."subscriptions" TO "anon";
GRANT SELECT ON TABLE "billing"."subscriptions" TO "authenticated";
GRANT SELECT,INSERT,UPDATE ON TABLE "billing"."subscriptions" TO "service_role";



GRANT SELECT ON TABLE "billing"."tiers" TO "anon";
GRANT SELECT ON TABLE "billing"."tiers" TO "authenticated";
GRANT SELECT,INSERT,UPDATE ON TABLE "billing"."tiers" TO "service_role";



GRANT SELECT ON TABLE "billing"."tiers_products" TO "anon";
GRANT SELECT ON TABLE "billing"."tiers_products" TO "authenticated";
GRANT SELECT,INSERT,UPDATE ON TABLE "billing"."tiers_products" TO "service_role";



GRANT SELECT ON TABLE "billing"."usage" TO "anon";
GRANT SELECT ON TABLE "billing"."usage" TO "authenticated";
GRANT SELECT,INSERT,UPDATE ON TABLE "billing"."usage" TO "service_role";















GRANT ALL ON TABLE "private"."ai_provider_state" TO "service_role";



GRANT ALL ON TABLE "private"."shadow_audit_records" TO "service_role";



GRANT ALL ON TABLE "private"."shadow_evaluation_runs" TO "service_role";



GRANT ALL ON TABLE "public"."action_centre_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."action_centre_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."action_centre_deployments" TO "anon";
GRANT ALL ON TABLE "public"."action_centre_deployments" TO "authenticated";
GRANT ALL ON TABLE "public"."action_centre_deployments" TO "service_role";



GRANT ALL ON TABLE "public"."agents" TO "anon";
GRANT ALL ON TABLE "public"."agents" TO "authenticated";
GRANT ALL ON TABLE "public"."agents" TO "service_role";



GRANT ALL ON TABLE "public"."ai_agent_channel_bindings" TO "anon";
GRANT ALL ON TABLE "public"."ai_agent_channel_bindings" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_agent_channel_bindings" TO "service_role";



GRANT ALL ON TABLE "public"."ai_agent_conversation_state" TO "anon";
GRANT ALL ON TABLE "public"."ai_agent_conversation_state" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_agent_conversation_state" TO "service_role";



GRANT ALL ON TABLE "public"."ai_agent_dispatches" TO "anon";
GRANT ALL ON TABLE "public"."ai_agent_dispatches" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_agent_dispatches" TO "service_role";



GRANT ALL ON TABLE "public"."ai_agent_profiles" TO "anon";
GRANT ALL ON TABLE "public"."ai_agent_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_agent_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."api_keys" TO "anon";
GRANT ALL ON TABLE "public"."api_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."api_keys" TO "service_role";



GRANT ALL ON TABLE "public"."app_notifications" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."app_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."app_notifications" TO "service_role";



GRANT UPDATE("read_at") ON TABLE "public"."app_notifications" TO "authenticated";



GRANT ALL ON TABLE "public"."appointment_events" TO "anon";
GRANT ALL ON TABLE "public"."appointment_events" TO "authenticated";
GRANT ALL ON TABLE "public"."appointment_events" TO "service_role";



GRANT ALL ON TABLE "public"."appointment_queue_entries" TO "anon";
GRANT ALL ON TABLE "public"."appointment_queue_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."appointment_queue_entries" TO "service_role";



GRANT ALL ON TABLE "public"."appointment_waitlist" TO "anon";
GRANT ALL ON TABLE "public"."appointment_waitlist" TO "authenticated";
GRANT ALL ON TABLE "public"."appointment_waitlist" TO "service_role";



GRANT ALL ON TABLE "public"."appointments" TO "anon";
GRANT ALL ON TABLE "public"."appointments" TO "authenticated";
GRANT ALL ON TABLE "public"."appointments" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."automation_recovery_events" TO "anon";
GRANT ALL ON TABLE "public"."automation_recovery_events" TO "authenticated";
GRANT ALL ON TABLE "public"."automation_recovery_events" TO "service_role";



GRANT ALL ON TABLE "public"."availability_rules" TO "anon";
GRANT ALL ON TABLE "public"."availability_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."availability_rules" TO "service_role";



GRANT ALL ON TABLE "public"."billing_notice_events" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_notice_events" TO "service_role";



GRANT ALL ON TABLE "public"."billing_webhook_events" TO "service_role";



GRANT ALL ON TABLE "public"."booking_pages" TO "anon";
GRANT ALL ON TABLE "public"."booking_pages" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_pages" TO "service_role";



GRANT ALL ON TABLE "public"."booking_payments" TO "anon";
GRANT ALL ON TABLE "public"."booking_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_payments" TO "service_role";



GRANT ALL ON TABLE "public"."booking_resources" TO "anon";
GRANT ALL ON TABLE "public"."booking_resources" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_resources" TO "service_role";



GRANT ALL ON TABLE "public"."business_locations" TO "anon";
GRANT ALL ON TABLE "public"."business_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."business_locations" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_events" TO "anon";
GRANT ALL ON TABLE "public"."campaign_events" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_events" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_recipients" TO "anon";
GRANT ALL ON TABLE "public"."campaign_recipients" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_recipients" TO "service_role";



GRANT ALL ON TABLE "public"."campaigns" TO "anon";
GRANT ALL ON TABLE "public"."campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."campaigns" TO "service_role";



GRANT ALL ON TABLE "public"."care_reminders" TO "anon";
GRANT ALL ON TABLE "public"."care_reminders" TO "authenticated";
GRANT ALL ON TABLE "public"."care_reminders" TO "service_role";



GRANT ALL ON TABLE "public"."channel_connections" TO "anon";
GRANT ALL ON TABLE "public"."channel_connections" TO "authenticated";
GRANT ALL ON TABLE "public"."channel_connections" TO "service_role";



GRANT ALL ON TABLE "public"."channel_message_templates" TO "anon";
GRANT ALL ON TABLE "public"."channel_message_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."channel_message_templates" TO "service_role";



GRANT ALL ON TABLE "public"."clinic_departments" TO "anon";
GRANT ALL ON TABLE "public"."clinic_departments" TO "authenticated";
GRANT ALL ON TABLE "public"."clinic_departments" TO "service_role";



GRANT ALL ON TABLE "public"."clinic_pilot_controls" TO "authenticated";
GRANT ALL ON TABLE "public"."clinic_pilot_controls" TO "service_role";



GRANT ALL ON TABLE "public"."communication_opt_outs" TO "anon";
GRANT ALL ON TABLE "public"."communication_opt_outs" TO "authenticated";
GRANT ALL ON TABLE "public"."communication_opt_outs" TO "service_role";



GRANT ALL ON TABLE "public"."contacts" TO "anon";
GRANT ALL ON TABLE "public"."contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."contacts" TO "service_role";



GRANT ALL ON TABLE "public"."contacts_addresses" TO "anon";
GRANT ALL ON TABLE "public"."contacts_addresses" TO "authenticated";
GRANT ALL ON TABLE "public"."contacts_addresses" TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON TABLE "public"."device_push_deliveries" TO "service_role";



GRANT ALL ON TABLE "public"."device_push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."device_push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."doctor_import_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."doctor_import_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."doctor_queue_consent_events" TO "service_role";
GRANT SELECT ON TABLE "public"."doctor_queue_consent_events" TO "authenticated";



GRANT ALL ON TABLE "public"."entitlements" TO "anon";
GRANT ALL ON TABLE "public"."entitlements" TO "authenticated";
GRANT ALL ON TABLE "public"."entitlements" TO "service_role";



GRANT ALL ON TABLE "public"."eval_runs" TO "anon";
GRANT ALL ON TABLE "public"."eval_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."eval_runs" TO "service_role";



GRANT ALL ON TABLE "public"."knowledge_bases" TO "anon";
GRANT ALL ON TABLE "public"."knowledge_bases" TO "authenticated";
GRANT ALL ON TABLE "public"."knowledge_bases" TO "service_role";



GRANT ALL ON TABLE "public"."knowledge_chunks" TO "service_role";



GRANT ALL ON TABLE "public"."knowledge_documents" TO "anon";
GRANT ALL ON TABLE "public"."knowledge_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."knowledge_documents" TO "service_role";



GRANT ALL ON TABLE "public"."logs" TO "anon";
GRANT ALL ON TABLE "public"."logs" TO "authenticated";
GRANT ALL ON TABLE "public"."logs" TO "service_role";



GRANT ALL ON TABLE "public"."medicine_catalog_entries" TO "service_role";
GRANT SELECT ON TABLE "public"."medicine_catalog_entries" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."medicine_catalog_entries_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."medicine_catalog_releases" TO "service_role";
GRANT SELECT ON TABLE "public"."medicine_catalog_releases" TO "authenticated";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."n8n_instances" TO "anon";
GRANT ALL ON TABLE "public"."n8n_instances" TO "authenticated";
GRANT ALL ON TABLE "public"."n8n_instances" TO "service_role";



GRANT ALL ON TABLE "public"."n8n_template_registry" TO "anon";
GRANT ALL ON TABLE "public"."n8n_template_registry" TO "authenticated";
GRANT ALL ON TABLE "public"."n8n_template_registry" TO "service_role";



GRANT ALL ON TABLE "public"."onboarding_profiles" TO "anon";
GRANT ALL ON TABLE "public"."onboarding_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."onboarding_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."onboarding_tokens" TO "anon";
GRANT ALL ON TABLE "public"."onboarding_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."onboarding_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."operational_billing_settings" TO "service_role";
GRANT SELECT ON TABLE "public"."operational_billing_settings" TO "authenticated";



GRANT ALL ON TABLE "public"."operational_creative_reservations" TO "service_role";
GRANT SELECT ON TABLE "public"."operational_creative_reservations" TO "authenticated";



GRANT ALL ON TABLE "public"."operational_events" TO "anon";
GRANT ALL ON TABLE "public"."operational_events" TO "authenticated";
GRANT ALL ON TABLE "public"."operational_events" TO "service_role";



GRANT ALL ON TABLE "public"."operational_rate_card_audit" TO "service_role";
GRANT SELECT ON TABLE "public"."operational_rate_card_audit" TO "authenticated";



GRANT ALL ON TABLE "public"."operational_reconciliation_runs" TO "service_role";
GRANT SELECT ON TABLE "public"."operational_reconciliation_runs" TO "authenticated";



GRANT ALL ON TABLE "public"."operational_statements" TO "service_role";
GRANT SELECT ON TABLE "public"."operational_statements" TO "authenticated";



GRANT ALL ON TABLE "public"."operational_topup_intents" TO "service_role";
GRANT SELECT ON TABLE "public"."operational_topup_intents" TO "authenticated";



GRANT ALL ON TABLE "public"."operational_usage_events" TO "service_role";
GRANT SELECT ON TABLE "public"."operational_usage_events" TO "authenticated";



GRANT ALL ON TABLE "public"."operational_wallet_ledger" TO "service_role";
GRANT SELECT ON TABLE "public"."operational_wallet_ledger" TO "authenticated";



GRANT ALL ON TABLE "public"."operational_wallets" TO "service_role";
GRANT SELECT ON TABLE "public"."operational_wallets" TO "authenticated";



GRANT ALL ON TABLE "public"."organization_communication_controls" TO "anon";
GRANT ALL ON TABLE "public"."organization_communication_controls" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_communication_controls" TO "service_role";



GRANT ALL ON TABLE "public"."organization_services" TO "anon";
GRANT ALL ON TABLE "public"."organization_services" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_services" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."organizations_addresses" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."organizations_addresses" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations_addresses" TO "service_role";



GRANT SELECT("organization_id") ON TABLE "public"."organizations_addresses" TO "authenticated";



GRANT SELECT("service") ON TABLE "public"."organizations_addresses" TO "authenticated";



GRANT SELECT("address") ON TABLE "public"."organizations_addresses" TO "authenticated";



GRANT SELECT("status") ON TABLE "public"."organizations_addresses" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "public"."organizations_addresses" TO "authenticated";



GRANT SELECT("updated_at") ON TABLE "public"."organizations_addresses" TO "authenticated";



GRANT ALL ON TABLE "public"."patient_care_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."patient_care_plans" TO "service_role";



GRANT ALL ON TABLE "public"."patient_care_tasks" TO "anon";
GRANT ALL ON TABLE "public"."patient_care_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."patient_care_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."patient_consent_events" TO "anon";
GRANT ALL ON TABLE "public"."patient_consent_events" TO "authenticated";
GRANT ALL ON TABLE "public"."patient_consent_events" TO "service_role";



GRANT ALL ON TABLE "public"."patient_data_request_events" TO "service_role";
GRANT SELECT ON TABLE "public"."patient_data_request_events" TO "authenticated";



GRANT ALL ON TABLE "public"."patient_data_requests" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."patient_data_requests" TO "authenticated";



GRANT ALL ON TABLE "public"."patient_documents" TO "anon";
GRANT ALL ON TABLE "public"."patient_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."patient_documents" TO "service_role";



GRANT ALL ON TABLE "public"."patient_encounters" TO "anon";
GRANT ALL ON TABLE "public"."patient_encounters" TO "authenticated";
GRANT ALL ON TABLE "public"."patient_encounters" TO "service_role";



GRANT ALL ON TABLE "public"."patient_guardian_links" TO "anon";
GRANT ALL ON TABLE "public"."patient_guardian_links" TO "authenticated";
GRANT ALL ON TABLE "public"."patient_guardian_links" TO "service_role";



GRANT ALL ON TABLE "public"."patient_identity_verification_events" TO "anon";
GRANT ALL ON TABLE "public"."patient_identity_verification_events" TO "authenticated";
GRANT ALL ON TABLE "public"."patient_identity_verification_events" TO "service_role";



GRANT ALL ON TABLE "public"."patient_medication_adherence" TO "authenticated";
GRANT ALL ON TABLE "public"."patient_medication_adherence" TO "service_role";



GRANT ALL ON TABLE "public"."payment_gateway_connections" TO "anon";
GRANT ALL ON TABLE "public"."payment_gateway_connections" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_gateway_connections" TO "service_role";



GRANT ALL ON TABLE "public"."prescription_items" TO "anon";
GRANT ALL ON TABLE "public"."prescription_items" TO "authenticated";
GRANT ALL ON TABLE "public"."prescription_items" TO "service_role";



GRANT ALL ON TABLE "public"."prescriptions" TO "anon";
GRANT ALL ON TABLE "public"."prescriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."prescriptions" TO "service_role";



GRANT ALL ON TABLE "public"."production_readiness_checks" TO "authenticated";
GRANT ALL ON TABLE "public"."production_readiness_checks" TO "service_role";



GRANT ALL ON TABLE "public"."provider_departments" TO "anon";
GRANT ALL ON TABLE "public"."provider_departments" TO "authenticated";
GRANT ALL ON TABLE "public"."provider_departments" TO "service_role";



GRANT ALL ON TABLE "public"."provider_location_assignments" TO "anon";
GRANT ALL ON TABLE "public"."provider_location_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."provider_location_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."provider_location_services" TO "anon";
GRANT ALL ON TABLE "public"."provider_location_services" TO "authenticated";
GRANT ALL ON TABLE "public"."provider_location_services" TO "service_role";



GRANT ALL ON TABLE "public"."provider_profiles" TO "anon";
GRANT ALL ON TABLE "public"."provider_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."provider_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."quick_replies" TO "anon";
GRANT ALL ON TABLE "public"."quick_replies" TO "authenticated";
GRANT ALL ON TABLE "public"."quick_replies" TO "service_role";



GRANT ALL ON TABLE "public"."rag_knowledge_items" TO "anon";
GRANT ALL ON TABLE "public"."rag_knowledge_items" TO "authenticated";
GRANT ALL ON TABLE "public"."rag_knowledge_items" TO "service_role";



GRANT ALL ON TABLE "public"."roles" TO "anon";
GRANT ALL ON TABLE "public"."roles" TO "authenticated";
GRANT ALL ON TABLE "public"."roles" TO "service_role";



GRANT ALL ON TABLE "public"."saas_billing_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."saas_billing_orders" TO "service_role";



GRANT ALL ON TABLE "public"."saas_invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."saas_invoices" TO "service_role";



GRANT ALL ON TABLE "public"."saas_plans" TO "anon";
GRANT ALL ON TABLE "public"."saas_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."saas_plans" TO "service_role";



GRANT ALL ON TABLE "public"."schedule_exceptions" TO "anon";
GRANT ALL ON TABLE "public"."schedule_exceptions" TO "authenticated";
GRANT ALL ON TABLE "public"."schedule_exceptions" TO "service_role";



GRANT ALL ON TABLE "public"."security_incident_events" TO "service_role";
GRANT SELECT ON TABLE "public"."security_incident_events" TO "authenticated";



GRANT ALL ON TABLE "public"."security_incidents" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."security_incidents" TO "authenticated";



GRANT ALL ON TABLE "public"."service_requests" TO "anon";
GRANT ALL ON TABLE "public"."service_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."service_requests" TO "service_role";



GRANT ALL ON TABLE "public"."team_audit_events" TO "anon";
GRANT ALL ON TABLE "public"."team_audit_events" TO "authenticated";
GRANT ALL ON TABLE "public"."team_audit_events" TO "service_role";



GRANT ALL ON TABLE "public"."usage_metering" TO "anon";
GRANT ALL ON TABLE "public"."usage_metering" TO "authenticated";
GRANT ALL ON TABLE "public"."usage_metering" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



GRANT ALL ON TABLE "public"."waitlist_offers" TO "anon";
GRANT ALL ON TABLE "public"."waitlist_offers" TO "authenticated";
GRANT ALL ON TABLE "public"."waitlist_offers" TO "service_role";



GRANT ALL ON TABLE "public"."webhook_events" TO "anon";
GRANT ALL ON TABLE "public"."webhook_events" TO "authenticated";
GRANT ALL ON TABLE "public"."webhook_events" TO "service_role";



GRANT ALL ON TABLE "public"."webhooks" TO "anon";
GRANT ALL ON TABLE "public"."webhooks" TO "authenticated";
GRANT ALL ON TABLE "public"."webhooks" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_acceptance_observations" TO "service_role";
GRANT SELECT ON TABLE "public"."whatsapp_acceptance_observations" TO "authenticated";



GRANT ALL ON TABLE "public"."whatsapp_acceptance_payments" TO "service_role";
GRANT SELECT ON TABLE "public"."whatsapp_acceptance_payments" TO "authenticated";



GRANT ALL ON TABLE "public"."whatsapp_acceptance_test_events" TO "service_role";
GRANT SELECT ON TABLE "public"."whatsapp_acceptance_test_events" TO "authenticated";



GRANT ALL ON TABLE "public"."whatsapp_booking_consent_evidence" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_booking_consent_evidence" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_booking_consent_evidence" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_booking_requests" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_booking_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_booking_requests" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_booking_sessions" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_booking_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_booking_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_booking_settings" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_booking_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_booking_settings" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_concierge_dispatches" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_concierge_dispatches" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_concierge_dispatches" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_preference_events" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_preference_events" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_preference_events" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_rate_cards" TO "service_role";
GRANT SELECT ON TABLE "public"."whatsapp_rate_cards" TO "authenticated";



GRANT ALL ON TABLE "public"."whatsapp_recovery_acceptance_fixtures" TO "service_role";
GRANT SELECT ON TABLE "public"."whatsapp_recovery_acceptance_fixtures" TO "authenticated";



GRANT ALL ON TABLE "public"."whatsapp_sales_rag_dispatches" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_sales_rag_dispatches" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_sales_rag_dispatches" TO "service_role";






SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "billing" GRANT SELECT ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "billing" GRANT SELECT ON TABLES TO "authenticated";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































