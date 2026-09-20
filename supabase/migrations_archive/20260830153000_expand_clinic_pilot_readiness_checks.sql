-- Keep the persisted production-readiness evidence contract aligned with the
-- clinic pilot workspace. This is additive: existing evidence remains valid.
alter table public.production_readiness_checks
  drop constraint if exists production_readiness_checks_check_key_check;

alter table public.production_readiness_checks
  add constraint production_readiness_checks_check_key_check
  check (check_key in (
    'backup_export',
    'restore_drill',
    'pilot_booking',
    'pilot_care_plan',
    'pilot_follow_up',
    'pilot_reminder',
    'pilot_signoff'
  ));

comment on table public.production_readiness_checks is
  'Tenant-scoped owner evidence for backup, restore-drill and controlled clinic-pilot lifecycle gates.';
