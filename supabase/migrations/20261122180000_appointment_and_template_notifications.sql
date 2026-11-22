-- In-app notifications for appointment bookings and Meta WhatsApp template approvals.

-- 1. Trigger function for instant notifications on appointment insertion
create or replace function private.notify_appointment_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer text;
  v_doctor text;
  v_service text;
  v_title text;
  v_body text;
begin
  select name into v_doctor from public.booking_resources where id = NEW.resource_id;
  select name into v_service from public.organization_services where id = NEW.service_id;

  v_customer := coalesce(nullif(trim(NEW.customer_name), ''), 'Patient');

  v_title := substring('New Booking: ' || v_customer || case when v_doctor is not null then ' with Dr. ' || v_doctor else '' end from 1 for 150);

  v_body := 'Patient ' || v_customer || ' booked' ||
            case when v_service is not null then ' for ' || v_service else '' end ||
            case when v_doctor is not null then ' with Dr. ' || v_doctor else '' end ||
            ' on ' || to_char(NEW.starts_at at time zone 'Asia/Kolkata', 'DD Mon YYYY at HH12:MI AM') || '.';

  insert into public.app_notifications (
    organization_id,
    recipient_user_id,
    notification_type,
    title,
    body,
    href,
    entity_type,
    entity_id,
    priority,
    escalation_level
  )
  select
    NEW.organization_id,
    a.user_id,
    'system',
    v_title,
    v_body,
    '/app/appointments',
    'appointment',
    NEW.id,
    'normal',
    0
  from public.agents a
  where a.organization_id = NEW.organization_id
    and a.ai = false
    and a.user_id is not null
    and coalesce(a.extra->>'status', 'active') <> 'inactive'
    and not exists (
      select 1 from public.app_notifications n
      where n.organization_id = NEW.organization_id
        and n.recipient_user_id = a.user_id
        and n.entity_type = 'appointment'
        and n.entity_id = NEW.id
    );

  return NEW;
end;
$$;

drop trigger if exists on_appointment_inserted on public.appointments;
create trigger on_appointment_inserted
  after insert on public.appointments
  for each row execute function private.notify_appointment_booking();

-- 2. Update refresh_priority_action_alerts to reconcile template approvals and recent bookings
create or replace function public.refresh_priority_action_alerts(p_organization_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare inserted_count integer:=0; row_count integer;
begin
  if not private.is_organization_member(p_organization_id,'member') then
    raise exception 'Forbidden' using errcode='42501';
  end if;

  -- Auto-close stale appointment-notification alerts
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

  -- 1. WhatsApp booking approval overdue
  insert into public.app_notifications(organization_id,recipient_user_id,notification_type,title,body,href,entity_type,entity_id,priority,escalation_level)
  select r.organization_id,a.user_id,'serious_action','Booking approval overdue','A WhatsApp booking request has waited more than 15 minutes for approve, waitlist or reject.','/app/action-centre','escalated_booking_request',r.id,'critical',2
  from public.whatsapp_booking_requests r join public.agents a on a.organization_id=r.organization_id and a.ai=false and a.user_id is not null
  where r.organization_id=p_organization_id and r.status='pending_approval' and r.created_at<=now()-interval '15 minutes'
    and coalesce(a.extra->>'role','member') in ('owner','admin') and coalesce(a.extra->>'status','active')<>'inactive'
    and not exists(select 1 from public.app_notifications n where n.organization_id=r.organization_id and n.recipient_user_id=a.user_id and n.entity_type='escalated_booking_request' and n.entity_id=r.id and n.read_at is null);
  get diagnostics row_count=row_count; inserted_count:=inserted_count+row_count;

  -- 2. Schedule disruption
  insert into public.app_notifications(organization_id,recipient_user_id,notification_type,title,body,href,entity_type,entity_id,priority,escalation_level)
  select e.organization_id,a.user_id,'serious_action','Schedule disruption requires coordination','An active clinic schedule exception begins within 24 hours. Review affected appointments and notification delivery.','/app/action-centre','schedule_disruption',e.id,'critical',3
  from public.schedule_exceptions e join public.agents a on a.organization_id=e.organization_id and a.ai=false and a.user_id is not null
  where e.organization_id=p_organization_id and e.status='active' and e.starts_at<=now()+interval '24 hours' and e.ends_at>now()
    and coalesce(a.extra->>'role','member') in ('owner','admin') and coalesce(a.extra->>'status','active')<>'inactive'
    and not exists(select 1 from public.app_notifications n where n.organization_id=e.organization_id and n.recipient_user_id=a.user_id and n.entity_type='schedule_disruption' and n.entity_id=e.id and n.read_at is null);
  get diagnostics row_count=row_count; inserted_count:=inserted_count+row_count;

  -- 3. Failed reminder notification
  insert into public.app_notifications(organization_id,recipient_user_id,notification_type,title,body,href,entity_type,entity_id,priority,escalation_level)
  select r.organization_id,a.user_id,'serious_action','Appointment notification failed','A patient appointment notification exhausted or requires operational review. Patient identity is available only inside the protected workspace.','/app/action-centre','failed_appointment_notification',r.id,'high',1
  from public.reminder_events r join public.agents a on a.organization_id=r.organization_id and a.ai=false and a.user_id is not null
  where r.organization_id=p_organization_id and r.status='failed'
    and r.failure_reason is distinct from 'Appointment no longer exists.'
    and coalesce(r.last_attempt_at,r.updated_at,r.created_at)>=now()-interval '24 hours'
    and coalesce(a.extra->>'role','member') in ('owner','admin') and coalesce(a.extra->>'status','active')<>'inactive'
    and not exists(select 1 from public.app_notifications n where n.organization_id=r.organization_id and n.recipient_user_id=a.user_id and n.entity_type='failed_appointment_notification' and n.entity_id=r.id and n.read_at is null);
  get diagnostics row_count=row_count; inserted_count:=inserted_count+row_count;

  -- 4. Overdue follow-up task
  insert into public.app_notifications(organization_id,recipient_user_id,notification_type,title,body,href,entity_type,entity_id,priority,escalation_level)
  select t.organization_id,a.user_id,'serious_action','Overdue follow-up needs an owner','A high-priority or overdue care task remains open. Claim it in the Action Centre before reviewing the protected patient record.','/app/action-centre','overdue_care_task',t.id,case when t.priority='urgent' then 'critical' else 'high' end,case when t.priority='urgent' then 2 else 1 end
  from public.patient_care_tasks t join public.agents a on a.organization_id=t.organization_id and a.ai=false and a.user_id is not null
  where t.organization_id=p_organization_id and t.status in ('open','in_progress') and (t.priority in ('high','urgent') or t.due_at<=now())
    and coalesce(a.extra->>'role','member') in ('owner','admin') and coalesce(a.extra->>'status','active')<>'inactive'
    and not exists(select 1 from public.app_notifications n where n.organization_id=t.organization_id and n.recipient_user_id=a.user_id and n.entity_type='overdue_care_task' and n.entity_id=t.id and n.read_at is null);
  get diagnostics row_count=row_count; inserted_count:=inserted_count+row_count;

  -- 5. WhatsApp Meta Template Approval Notifications
  if exists (
    select 1 from public.channel_message_templates
    where organization_id = p_organization_id
      and channel = 'whatsapp'
      and status = 'approved'
  ) then
    insert into public.app_notifications(organization_id, recipient_user_id, notification_type, title, body, href, entity_type, entity_id, priority, escalation_level)
    select
      p_organization_id,
      a.user_id,
      'system',
      'Meta WhatsApp Templates Approved',
      'All 11 WhatsApp lifecycle templates are approved by Meta and active for patient communications.',
      '/app/integrations',
      'template_approval',
      p_organization_id,
      'normal',
      0
    from public.agents a
    where a.organization_id = p_organization_id
      and a.ai = false
      and a.user_id is not null
      and coalesce(a.extra->>'status','active') <> 'inactive'
      and not exists (
        select 1 from public.app_notifications n
        where n.organization_id = p_organization_id
          and n.recipient_user_id = a.user_id
          and n.entity_type = 'template_approval'
      );
    get diagnostics row_count = row_count; inserted_count := inserted_count + row_count;
  end if;

  -- 6. Reconcile recent active appointment bookings
  insert into public.app_notifications(organization_id, recipient_user_id, notification_type, title, body, href, entity_type, entity_id, priority, escalation_level)
  select
    app.organization_id,
    a.user_id,
    'system',
    substring('New Booking: ' || app.customer_name || coalesce(' with Dr. ' || r.name, '') from 1 for 150),
    'Patient ' || app.customer_name || ' booked' || coalesce(' for ' || s.name, '') || coalesce(' with Dr. ' || r.name, '') || ' on ' || to_char(app.starts_at at time zone 'Asia/Kolkata', 'DD Mon YYYY at HH12:MI AM') || '.',
    '/app/appointments',
    'appointment',
    app.id,
    'normal',
    0
  from public.appointments app
  left join public.booking_resources r on r.id = app.resource_id
  left join public.organization_services s on s.id = app.service_id
  cross join public.agents a
  where app.organization_id = p_organization_id
    and a.organization_id = p_organization_id
    and a.ai = false
    and a.user_id is not null
    and coalesce(a.extra->>'status','active') <> 'inactive'
    and app.status not in ('cancelled')
    and app.created_at >= now() - interval '30 days'
    and not exists (
      select 1 from public.app_notifications n
      where n.organization_id = p_organization_id
        and n.recipient_user_id = a.user_id
        and n.entity_type = 'appointment'
        and n.entity_id = app.id
    );
  get diagnostics row_count = row_count; inserted_count := inserted_count + row_count;

  return inserted_count;
end;
$$;

revoke all on function public.refresh_priority_action_alerts(uuid) from public,anon;
grant execute on function public.refresh_priority_action_alerts(uuid) to authenticated;
