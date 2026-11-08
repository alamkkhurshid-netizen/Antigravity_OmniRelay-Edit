-- Close demonstrably unnecessary RPC execution paths without breaking the
-- token-protected public booking and patient self-service APIs.

-- PostgreSQL grants EXECUTE to PUBLIC for newly created functions unless it is
-- revoked. Remove that inherited grant from every privileged RPC reviewed in
-- this checkpoint; explicit role grants below remain the source of truth.
revoke execute on function public.agent_update_by_owner_rules(uuid,uuid,uuid,boolean,jsonb) from public, anon;
revoke execute on function public.member_self_update_rules(uuid,uuid,uuid,boolean,jsonb) from public, anon;
revoke execute on function public.org_update_by_admin_rules(uuid,text) from public, anon;
grant execute on function public.agent_update_by_owner_rules(uuid,uuid,uuid,boolean,jsonb) to authenticated, service_role;
grant execute on function public.member_self_update_rules(uuid,uuid,uuid,boolean,jsonb) to authenticated, service_role;
grant execute on function public.org_update_by_admin_rules(uuid,text) to authenticated, service_role;

revoke execute on function public.accept_workspace_invitations() from public, anon;
revoke execute on function public.consume_api_rate_limit(text,integer,integer) from public, anon;
revoke execute on function public.decide_whatsapp_booking_request(uuid,uuid,text,text) from public, anon;
revoke execute on function public.get_oem_tenant_health() from public, anon;
revoke execute on function public.retry_failed_automation_job(uuid,text,uuid,text) from public, anon;
grant execute on function public.accept_workspace_invitations() to authenticated, service_role;
grant execute on function public.consume_api_rate_limit(text,integer,integer) to authenticated, service_role;
grant execute on function public.decide_whatsapp_booking_request(uuid,uuid,text,text) to authenticated, service_role;
grant execute on function public.get_oem_tenant_health() to authenticated, service_role;
grant execute on function public.retry_failed_automation_job(uuid,text,uuid,text) to authenticated, service_role;

-- Legacy creation functions are implementation details of the current v2/v3
-- entrypoints. Payment mutations are server-routed and must never be callable
-- directly with the public browser role.
revoke execute on function public.create_public_appointment(text,uuid,uuid,uuid,text,text,text,timestamptz,text) from public, anon, authenticated;
revoke execute on function public.create_public_payment_intent(text,uuid,uuid,uuid,text,text,text,timestamptz,text) from public, anon, authenticated;
revoke execute on function public.create_public_payment_intent_v2(text,uuid,uuid,uuid,text,text,text,timestamptz,text,jsonb) from public, anon, authenticated;
revoke execute on function public.create_public_payment_intent_v3(text,uuid,uuid,uuid,text,text,text,timestamptz,text,text,jsonb) from public, anon, authenticated;
revoke execute on function public.attach_public_payment_order(text,text,text) from public, anon, authenticated;
revoke execute on function public.confirm_public_payment(text,text,text,text) from public, anon, authenticated;
grant execute on function public.create_public_appointment(text,uuid,uuid,uuid,text,text,text,timestamptz,text) to service_role;
grant execute on function public.create_public_payment_intent(text,uuid,uuid,uuid,text,text,text,timestamptz,text) to service_role;
grant execute on function public.create_public_payment_intent_v2(text,uuid,uuid,uuid,text,text,text,timestamptz,text,jsonb) to service_role;
grant execute on function public.create_public_payment_intent_v3(text,uuid,uuid,uuid,text,text,text,timestamptz,text,text,jsonb) to service_role;
grant execute on function public.attach_public_payment_order(text,text,text) to service_role;
grant execute on function public.confirm_public_payment(text,text,text,text) to service_role;

-- These are intentional patient-facing capabilities. They disclose or mutate
-- data only after slug validation or a high-entropy manage-token check.
revoke execute on function public.create_public_appointment_v2(text,uuid,uuid,uuid,text,text,text,timestamptz,text,jsonb) from public;
revoke execute on function public.attach_public_booking_identity(text,text,text,text,text,date) from public;
revoke execute on function public.get_public_booking_page(text) from public;
revoke execute on function public.get_public_booking_slots(text,uuid,uuid,uuid,date) from public;
revoke execute on function public.get_customer_booking(text,text) from public;
revoke execute on function public.cancel_customer_booking(text,text) from public;
revoke execute on function public.reschedule_customer_booking(text,text,timestamptz) from public;
grant execute on function public.create_public_appointment_v2(text,uuid,uuid,uuid,text,text,text,timestamptz,text,jsonb) to anon, authenticated, service_role;
grant execute on function public.attach_public_booking_identity(text,text,text,text,text,date) to anon, authenticated, service_role;
grant execute on function public.get_public_booking_page(text) to anon, authenticated, service_role;
grant execute on function public.get_public_booking_slots(text,uuid,uuid,uuid,date) to anon, authenticated, service_role;
grant execute on function public.get_customer_booking(text,text) to anon, authenticated, service_role;
grant execute on function public.cancel_customer_booking(text,text) to anon, authenticated, service_role;
grant execute on function public.reschedule_customer_booking(text,text,timestamptz) to anon, authenticated, service_role;

-- get_authorized_orgs intentionally supports JWT users and signed API-key
-- callers routed through the anon database role; it raises without either.
revoke execute on function public.get_authorized_orgs(public.role) from public;
grant execute on function public.get_authorized_orgs(public.role) to anon, authenticated, service_role;

-- Bind permission checks to the authenticated caller. A browser user may not
-- submit another user's UUID to obtain that user's permissions.
create or replace function public.has_permission(
  _user_id uuid,
  _org_id uuid,
  _permission text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
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
revoke execute on function public.has_permission(uuid,uuid,text) from public, anon;
grant execute on function public.has_permission(uuid,uuid,text) to authenticated, service_role;

-- Tenant-bind knowledge retrieval. Service workers can retrieve for a tenant;
-- authenticated callers can retrieve only for their own active organization.
create or replace function public.match_knowledge_chunks(
  query_embedding public.vector,
  match_threshold double precision,
  match_count integer,
  p_organization_id uuid
) returns table(id uuid, content text, similarity double precision)
language plpgsql
security definer
set search_path = ''
as $$
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
revoke execute on function public.match_knowledge_chunks(public.vector,double precision,integer,uuid) from public, anon;
grant execute on function public.match_knowledge_chunks(public.vector,double precision,integer,uuid) to authenticated, service_role;

comment on function public.create_public_appointment_v2(text,uuid,uuid,uuid,text,text,text,timestamptz,text,jsonb)
  is 'Intentional public booking RPC; validates active clinic configuration, consent, availability and overlap.';
comment on function public.get_customer_booking(text,text)
  is 'Intentional patient self-service RPC protected by booking reference plus hashed high-entropy manage token.';
comment on function public.get_authorized_orgs(public.role)
  is 'Intentional JWT/API-key authorization helper; raises when neither authenticated identity nor API key is present.';
