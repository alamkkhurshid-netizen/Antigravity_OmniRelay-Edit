-- RLS policies call this helper while evaluating authenticated tenant access.
-- The helper itself still requires auth.uid(), an active membership, and the
-- minimum role, so granting EXECUTE does not bypass tenant isolation.
revoke all on function private.is_organization_member(uuid, text) from public, anon;
grant execute on function private.is_organization_member(uuid, text) to authenticated;
