revoke all on public.doctor_import_jobs from public, anon;
grant select, insert on public.doctor_import_jobs to authenticated;

revoke all on function public.import_doctor_roster(uuid,jsonb,boolean,text) from public, anon;
grant execute on function public.import_doctor_roster(uuid,jsonb,boolean,text) to authenticated;
