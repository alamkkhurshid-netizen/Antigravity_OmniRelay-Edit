alter table public.clinic_pilot_controls
  add column if not exists planned_start_date date;
