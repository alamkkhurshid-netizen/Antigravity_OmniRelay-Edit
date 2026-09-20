-- Supabase target default privileges may grant more than the explicit application surface.
revoke all on public.security_incidents from authenticated;
grant select, insert, update on public.security_incidents to authenticated;
revoke delete, truncate, references, trigger on public.security_incidents from authenticated;
