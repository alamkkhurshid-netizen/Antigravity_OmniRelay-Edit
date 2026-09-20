-- The manual doctor-queue scheduler is SECURITY INVOKER and already enforces
-- organization-admin access. It needs this immutable, data-free helper to
-- validate and canonicalize the consented provider number before insertion.
revoke all on function private.normalize_phone_identity(text)
  from public, anon;
grant execute on function private.normalize_phone_identity(text)
  to authenticated, service_role;

