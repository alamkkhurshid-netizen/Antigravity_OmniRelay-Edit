-- Keep the public booking origin in encrypted database configuration so Edge
-- Functions can fail closed without embedding a deployment-specific fallback.

do $$
begin
  if not exists (
    select 1 from vault.secrets where name = 'public_site_url'
  ) then
    perform vault.create_secret(
      'https://omnirelay-light.alam-kkhurshid.chatgpt.site',
      'public_site_url',
      'Canonical OmniRelay public origin used in patient-facing links.'
    );
  end if;
end;
$$;

create or replace function public.get_public_site_url()
returns text
language sql
security definer
stable
set search_path = ''
as $$
  select trim(trailing '/' from decrypted_secret)
  from vault.decrypted_secrets
  where name = 'public_site_url'
  limit 1;
$$;

revoke all on function public.get_public_site_url() from public, anon, authenticated;
grant execute on function public.get_public_site_url() to service_role;
