-- Complete the authenticated SECURITY DEFINER review without disrupting the
-- functions used by booking, staff operations, or row-level security.

-- This legacy permission helper has no application or policy caller. Keep it
-- available to trusted backend maintenance only until it can be removed in a
-- later compatibility cleanup.
revoke execute on function public.has_permission(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.has_permission(uuid, uuid, text)
  to service_role;

-- Knowledge retrieval is currently a backend capability. Browser users must
-- not call the privileged vector search RPC directly; future Care Guide access
-- will be routed through a tenant-bound server endpoint.
revoke execute on function public.match_knowledge_chunks(
  public.vector, double precision, integer, uuid
) from public, anon, authenticated;
grant execute on function public.match_knowledge_chunks(
  public.vector, double precision, integer, uuid
) to service_role;

comment on function public.has_permission(uuid, uuid, text) is
  'Backend-only legacy permission helper; no direct browser execution.';
comment on function public.match_knowledge_chunks(public.vector, double precision, integer, uuid) is
  'Backend-only tenant-scoped knowledge retrieval; expose only through an authenticated server boundary.';
