create or replace function public.prepare_whatsapp_acceptance_scenario(
  p_organization_id uuid,
  p_scenario_key text
)
returns public.whatsapp_acceptance_test_runs
language plpgsql security definer set search_path=''
as $$
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

create or replace function public.prepare_abandoned_recovery_acceptance(p_organization_id uuid)
returns public.whatsapp_acceptance_test_runs
language plpgsql security definer set search_path=''
as $$
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

revoke all on function public.prepare_whatsapp_acceptance_scenario(uuid,text) from public,anon,authenticated;
grant execute on function public.prepare_whatsapp_acceptance_scenario(uuid,text) to service_role;
revoke all on function public.prepare_abandoned_recovery_acceptance(uuid) from public,anon,authenticated;
grant execute on function public.prepare_abandoned_recovery_acceptance(uuid) to service_role;
