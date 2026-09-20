-- Trigger functions are invoked by PostgreSQL through their owning trigger.
-- They are not application RPCs and must not be directly executable through
-- the Data API by anonymous or authenticated callers.
--
-- Rollback, only if direct execution is intentionally required:
--   grant execute on function <qualified function>() to <required role>;

revoke execute on function private.invoke_whatsapp_booking_concierge() from public, anon, authenticated;
revoke execute on function private.offer_released_appointment_slot() from public, anon, authenticated;
revoke execute on function private.sync_care_reminder_run_from_message() from public, anon, authenticated;
revoke execute on function private.sync_reminder_event_from_message() from public, anon, authenticated;

revoke execute on function public.after_insert_on_organizations() from public, anon, authenticated;
revoke execute on function public.dispatcher_edge_function() from public, anon, authenticated;
revoke execute on function public.edge_function() from public, anon, authenticated;
revoke execute on function public.lookup_agents_by_email_after_insert_on_auth_users() from public, anon, authenticated;
revoke execute on function public.lookup_user_id_by_email_before_insert_on_agents() from public, anon, authenticated;
revoke execute on function public.notify_webhook() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- Preserve explicit operational access without reopening the public API.
grant execute on function private.invoke_whatsapp_booking_concierge() to service_role;
grant execute on function private.offer_released_appointment_slot() to service_role;
grant execute on function private.sync_care_reminder_run_from_message() to service_role;
grant execute on function private.sync_reminder_event_from_message() to service_role;
grant execute on function public.after_insert_on_organizations() to service_role;
grant execute on function public.dispatcher_edge_function() to service_role;
grant execute on function public.edge_function() to service_role;
grant execute on function public.lookup_agents_by_email_after_insert_on_auth_users() to service_role;
grant execute on function public.lookup_user_id_by_email_before_insert_on_agents() to service_role;
grant execute on function public.notify_webhook() to service_role;
grant execute on function public.rls_auto_enable() to service_role;
