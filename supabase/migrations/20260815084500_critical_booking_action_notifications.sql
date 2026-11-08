alter table public.app_notifications
  drop constraint if exists app_notifications_notification_type_check;

alter table public.app_notifications
  add constraint app_notifications_notification_type_check
  check (notification_type in (
    'task_assigned','task_updated','team_invitation','system','serious_action'
  ));

create unique index if not exists app_notifications_open_booking_action_idx
  on public.app_notifications (recipient_user_id, entity_type, entity_id)
  where read_at is null and entity_type = 'whatsapp_booking_request';

create or replace function private.notify_whatsapp_booking_action()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
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
$function$;

revoke all on function private.notify_whatsapp_booking_action()
  from public, anon, authenticated;

drop trigger if exists notify_whatsapp_booking_action
  on public.whatsapp_booking_requests;
create trigger notify_whatsapp_booking_action
after insert or update of status on public.whatsapp_booking_requests
for each row execute function private.notify_whatsapp_booking_action();

insert into public.app_notifications (
  organization_id, recipient_user_id, notification_type, title, body,
  href, entity_type, entity_id
)
select
  r.organization_id,
  a.user_id,
  'serious_action',
  'Booking approval required',
  coalesce(nullif(trim(r.patient_name),''),'A patient') ||
    ' is waiting for the clinic to approve, waitlist or reject the requested appointment.',
  '/app/booking-concierge#booking-requests',
  'whatsapp_booking_request',
  r.id
from public.whatsapp_booking_requests r
join public.agents a
  on a.organization_id = r.organization_id
 and a.ai = false
 and a.user_id is not null
 and coalesce(a.extra->>'role','member') in ('owner','admin')
 and coalesce(a.extra->>'status','active') <> 'inactive'
where r.status = 'pending_approval'
on conflict (recipient_user_id, entity_type, entity_id)
  where read_at is null and entity_type = 'whatsapp_booking_request'
  do nothing;
