-- These functions are internal authorization, knowledge, webhook and metering
-- helpers. None is an intentionally anonymous API. Keep only the minimum
-- caller roles and pin the search path for privileged backend helpers.

revoke execute on function public.has_permission(uuid, uuid, text)
  from public, anon;

revoke execute on function public.match_knowledge_chunks(vector, double precision, integer, uuid)
  from public, anon;

revoke execute on function public.record_webhook_event(text, text, uuid)
  from public, anon, authenticated;

revoke execute on function public.track_conversation_usage(uuid, text)
  from public, anon, authenticated;

alter function public.record_webhook_event(text, text, uuid)
  set search_path = '';

alter function public.track_conversation_usage(uuid, text)
  set search_path = '';

grant execute on function public.has_permission(uuid, uuid, text)
  to authenticated, service_role;

grant execute on function public.match_knowledge_chunks(vector, double precision, integer, uuid)
  to authenticated, service_role;

grant execute on function public.record_webhook_event(text, text, uuid)
  to service_role;

grant execute on function public.track_conversation_usage(uuid, text)
  to service_role;
