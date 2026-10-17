-- Historical reminder failures remain in the audit ledger, but must not keep
-- the live serious-action queue red after their operational window has ended.
create or replace function public.refresh_priority_action_alerts(p_organization_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare inserted_count integer:=0; row_count integer;
begin
  if not private.is_organization_member(p_organization_id,'member') then
    raise exception 'Forbidden' using errcode='42501';
  end if;

  -- This is a notification-state reconciliation only: it never retries,
  -- reschedules, changes a reminder event, or sends a WhatsApp message.
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

revoke all on function public.refresh_priority_action_alerts(uuid) from public,anon;
grant execute on function public.refresh_priority_action_alerts(uuid) to authenticated;
comment on function public.refresh_priority_action_alerts(uuid) is 'Creates current privacy-safe administrator alerts and auto-closes stale appointment-notification alerts without retrying or sending messages.';
