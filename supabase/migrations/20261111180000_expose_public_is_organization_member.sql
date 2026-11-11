-- Migration: 20261111180000_expose_public_is_organization_member.sql
-- Description: Expose a thin, secure public wrapper for private.is_organization_member
-- to allow authenticated PostgREST RPC access from Next.js server actions / route handlers.

create or replace function public.is_organization_member(
  target_organization_id uuid,
  minimum_role text default 'member'
) returns boolean
language sql stable security definer set search_path to ''
as $$
  select coalesce(private.is_organization_member(target_organization_id, minimum_role), false);
$$;

revoke all on function public.is_organization_member(uuid, text) from public, anon;
grant execute on function public.is_organization_member(uuid, text) to authenticated;
