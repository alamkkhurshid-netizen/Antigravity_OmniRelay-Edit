alter table public.channel_message_templates drop constraint channel_message_templates_event_type_check;
alter table public.channel_message_templates add constraint channel_message_templates_event_type_check
check(event_type in ('confirmation','reminder_24h','reminder_2h','follow_up','cancellation','reschedule','care_campaign','marketing_campaign','emergency_notice','booking_otp','doctor_queue','care_reminder','payment_action','payment_confirmation'));

alter table public.whatsapp_acceptance_test_runs
  add column checkout_url text,
  add column dispatch_message_id uuid references public.messages(id) on delete restrict;

create or replace function public.claim_deposit_acceptance_dispatch(p_organization_id uuid)
returns public.whatsapp_acceptance_test_runs
language plpgsql security invoker set search_path=''
as $$
declare result public.whatsapp_acceptance_test_runs;
begin
  update public.whatsapp_acceptance_test_runs
  set status='running',message_count=message_count+1,started_at=now(),lease_token=gen_random_uuid(),updated_at=now()
  where organization_id=p_organization_id and scenario_key='deposit_payment'
    and status='armed' and expires_at>now() and message_count<max_messages
    and verified_message_id is not null and subject_payment_id is not null
    and checkout_url ~ '^https://omnirelay-light\.alam-kkhurshid\.chatgpt\.site/'
  returning * into result;
  if result.id is not null then
    insert into public.whatsapp_acceptance_test_events(organization_id,run_id,scenario_key,event_type,safe_summary)
    values(result.organization_id,result.id,result.scenario_key,'claimed','Controlled deposit dispatcher claimed one verified message.');
  end if;
  return result;
end;
$$;

create or replace function public.complete_deposit_acceptance_dispatch(p_run_id uuid,p_lease_token uuid,p_passed boolean,p_evidence_reference text,p_failure_summary text default null)
returns public.whatsapp_acceptance_test_runs language sql security invoker set search_path=''
as $$ select private.complete_whatsapp_acceptance_test(p_run_id,p_lease_token,p_passed,p_evidence_reference,p_failure_summary) $$;

revoke all on function public.claim_deposit_acceptance_dispatch(uuid) from public,anon,authenticated;
revoke all on function public.complete_deposit_acceptance_dispatch(uuid,uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.claim_deposit_acceptance_dispatch(uuid) to service_role;
grant execute on function public.complete_deposit_acceptance_dispatch(uuid,uuid,boolean,text,text) to service_role;
