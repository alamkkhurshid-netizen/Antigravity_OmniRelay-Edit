-- Clinic team roles, invitations, task ownership and private in-app notifications.

create table public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null check (notification_type in ('task_assigned','task_updated','team_invitation','system')),
  title text not null check (char_length(trim(title)) between 2 and 160),
  body text,
  href text,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index app_notifications_recipient_unread_idx
  on public.app_notifications (recipient_user_id, created_at desc)
  where read_at is null;
create index app_notifications_org_time_idx
  on public.app_notifications (organization_id, created_at desc);

create unique index agents_pending_invitation_email_idx
  on public.agents (organization_id, lower(extra->'invitation'->>'email'))
  where ai = false and user_id is null and extra->'invitation'->>'status' = 'pending';

alter table public.app_notifications enable row level security;
grant select, update on public.app_notifications to authenticated;

create policy "members read own notifications"
on public.app_notifications for select to authenticated
using (
  recipient_user_id = (select auth.uid())
  and private.is_organization_member(organization_id, 'member')
);

create policy "members mark own notifications read"
on public.app_notifications for update to authenticated
using (
  recipient_user_id = (select auth.uid())
  and private.is_organization_member(organization_id, 'member')
)
with check (
  recipient_user_id = (select auth.uid())
  and private.is_organization_member(organization_id, 'member')
);

create or replace function public.accept_workspace_invitations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
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

revoke all on function public.accept_workspace_invitations() from public, anon;
grant execute on function public.accept_workspace_invitations() to authenticated;

create or replace function private.notify_patient_care_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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

revoke all on function private.notify_patient_care_task() from public, anon, authenticated;

create trigger notify_patient_care_task
after insert or update of assigned_to, status on public.patient_care_tasks
for each row execute function private.notify_patient_care_task();

-- Members may progress tasks assigned to themselves. Admin policies remain in place.
create policy "assignees update own patient care tasks"
on public.patient_care_tasks for update to authenticated
using (
  assigned_to = (select auth.uid())
  and private.is_organization_member(organization_id, 'member')
)
with check (
  assigned_to = (select auth.uid())
  and private.is_organization_member(organization_id, 'member')
);
