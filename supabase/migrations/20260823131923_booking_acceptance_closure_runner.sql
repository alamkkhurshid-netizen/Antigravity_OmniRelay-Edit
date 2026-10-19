create or replace function private.run_whatsapp_booking_acceptance_closure(p_organization_id uuid)
returns table(check_key text,status text,evidence_summary text)
language plpgsql security definer set search_path = '' as $$
declare
  reschedules bigint;
  cancellations bigint;
  pay_at_clinic bigint;
  full_paid bigint;
  full_expired bigint;
  deposit_paid bigint;
  reminder_count bigint;
  command_count bigint;
  handoff_count bigint;
  abandoned_count bigint;
  recovered_count bigint;
  reschedule_ok boolean;
  payment_ok boolean;
  commands_ok boolean;
  recovery_ok boolean;
begin
  select count(*) filter(where event_type='rescheduled'),count(*) filter(where event_type='cancelled')
  into reschedules,cancellations from public.appointment_events
  where organization_id=p_organization_id and actor_type='customer' and details->>'source'='whatsapp';
  reschedule_ok:=reschedules>0 and cancellations>0;

  select count(*) into pay_at_clinic from public.appointments where organization_id=p_organization_id and source='whatsapp' and payment_status='not_required';
  select count(*) filter(where p.payment_mode='full_online' and p.status='paid'),count(*) filter(where p.payment_mode='full_online' and p.status='expired'),count(*) filter(where p.payment_mode='deposit_online' and p.status='paid')
  into full_paid,full_expired,deposit_paid from public.booking_payments p where p.organization_id=p_organization_id;
  payment_ok:=pay_at_clinic>0 and full_paid>0 and full_expired>0 and deposit_paid>0;

  select count(*) into reminder_count from public.reminder_events where organization_id=p_organization_id;
  select count(*) into command_count from public.whatsapp_preference_events where organization_id=p_organization_id;
  select count(*) into handoff_count from public.whatsapp_booking_sessions where organization_id=p_organization_id and coalesce((context->>'ai_paused')::boolean,false);
  commands_ok:=reminder_count>0 and command_count>0 and handoff_count>0;

  select count(*) into abandoned_count from private.whatsapp_booking_handoffs where organization_id=p_organization_id and consumed_at is null and expires_at<=now();
  select count(*) into recovered_count from private.whatsapp_booking_handoffs h where h.organization_id=p_organization_id and h.consumed_at is not null and h.appointment_id is not null;
  recovery_ok:=abandoned_count>0 and recovered_count>0;

  perform private.record_whatsapp_booking_acceptance(p_organization_id,'reschedule_cancel',case when reschedule_ok then 'passed' else 'pending' end,'production',case when reschedule_ok then reschedules||' WhatsApp reschedule and '||cancellations||' cancellation event(s) verified.' else 'Waiting for both a WhatsApp reschedule and cancellation event.' end,'closure-runner-v1');
  perform private.record_whatsapp_booking_acceptance(p_organization_id,'payments',case when payment_ok then 'passed' else 'pending' end,'production','Evidence: pay at clinic '||pay_at_clinic||', full paid '||full_paid||', full expired '||full_expired||', deposit paid '||deposit_paid||'.','closure-runner-v1');
  perform private.record_whatsapp_booking_acceptance(p_organization_id,'reminders_commands_handoff',case when commands_ok then 'passed' else 'pending' end,'controlled_channel','Evidence: reminders '||reminder_count||', command preference events '||command_count||', human handoffs '||handoff_count||'.','closure-runner-v1');
  perform private.record_whatsapp_booking_acceptance(p_organization_id,'abandoned_recovery',case when recovery_ok then 'passed' else 'pending' end,'controlled_channel','Evidence: expired unconsumed handoffs '||abandoned_count||', completed handoff recoveries '||recovered_count||'.','closure-runner-v1');

  return query select c.check_key,c.status,c.evidence_summary from public.whatsapp_booking_acceptance_checks c
  where c.organization_id=p_organization_id and c.check_key in ('reschedule_cancel','payments','reminders_commands_handoff','abandoned_recovery') order by c.check_key;
end; $$;

revoke all on function private.run_whatsapp_booking_acceptance_closure(uuid) from public,anon,authenticated;
grant execute on function private.run_whatsapp_booking_acceptance_closure(uuid) to service_role;
