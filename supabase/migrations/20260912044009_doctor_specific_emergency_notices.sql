-- A multi-doctor emergency must never be scoped only by shared chamber and date.
-- Existing emergency campaigns are absent in production; fail closed for future ones.
alter table public.campaigns
  add constraint campaigns_emergency_doctor_scope_check
  check (
    campaign_type <> 'emergency'
    or (
      audience_filter ? 'location_id'
      and audience_filter ? 'resource_id'
      and audience_filter ? 'appointment_date'
      and audience_filter ? 'action'
      and (audience_filter->>'action') in ('reschedule_required', 'notify_only')
    )
  );

create index if not exists appointments_emergency_doctor_scope_idx
  on public.appointments (organization_id, resource_id, starts_at)
  where status in ('pending', 'payment_pending', 'confirmed', 'arrived', 'rescheduling_required');
