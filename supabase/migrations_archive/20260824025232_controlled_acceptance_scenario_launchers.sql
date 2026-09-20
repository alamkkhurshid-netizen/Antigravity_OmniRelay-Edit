create or replace function public.prepare_whatsapp_acceptance_scenario(
  p_organization_id uuid,
  p_scenario_key text
)
returns public.whatsapp_acceptance_test_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  verified_message_id uuid;
  message_ceiling integer;
  result public.whatsapp_acceptance_test_runs;
begin
  if p_scenario_key not in ('commands_handoff', 'abandoned_recovery') then
    raise exception 'Unsupported controlled acceptance scenario' using errcode = '22023';
  end if;

  message_ceiling := case p_scenario_key
    when 'commands_handoff' then 3
    when 'abandoned_recovery' then 1
  end;

  select m.id
    into verified_message_id
  from public.messages m
  where m.organization_id = p_organization_id
    and m.direction = 'outgoing'
    and m.service = 'whatsapp'
    and m.status ? 'delivered'
    and m.timestamp >= now() - interval '30 days'
  order by m.timestamp desc
  limit 1;

  if verified_message_id is null then
    raise exception 'A recent delivered WhatsApp record is required' using errcode = '22023';
  end if;

  select * into result from private.arm_whatsapp_acceptance_test_from_delivery(
    p_organization_id,
    p_scenario_key,
    verified_message_id,
    message_ceiling
  );

  return result;
end;
$$;

revoke all on function public.prepare_whatsapp_acceptance_scenario(uuid, text)
  from public, anon, authenticated;
grant execute on function public.prepare_whatsapp_acceptance_scenario(uuid, text)
  to service_role;
