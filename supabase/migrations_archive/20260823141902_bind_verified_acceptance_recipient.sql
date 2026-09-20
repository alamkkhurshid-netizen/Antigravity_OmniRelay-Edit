alter table public.whatsapp_acceptance_test_runs
  add column verified_message_id uuid references public.messages(id) on delete restrict;

create or replace function private.arm_whatsapp_acceptance_test_from_delivery(
  p_organization_id uuid,
  p_scenario_key text,
  p_verified_message_id uuid,
  p_max_messages integer default 1
)
returns public.whatsapp_acceptance_test_runs
language plpgsql
security definer
set search_path=''
as $$
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
$$;

revoke all on function private.arm_whatsapp_acceptance_test_from_delivery(uuid,text,uuid,integer) from public,anon,authenticated;
grant execute on function private.arm_whatsapp_acceptance_test_from_delivery(uuid,text,uuid,integer) to service_role;
