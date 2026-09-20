create extension if not exists pg_trgm with schema extensions;

create table public.medicine_catalog_releases (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  edition text not null,
  release_date date not null,
  package_sha256 text not null unique,
  licence_name text not null,
  licence_url text not null,
  status text not null default 'staged'
    check (status in ('staged','active','superseded','rejected')),
  row_counts jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  activated_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.medicine_catalog_entries (
  id bigint generated always as identity primary key,
  release_id uuid not null references public.medicine_catalog_releases(id) on delete cascade,
  source_identifier text not null,
  entry_type text not null check (entry_type in ('brand','generic')),
  display_name text not null,
  generic_identifier text,
  generic_name text,
  product_identifier text,
  product_name text,
  supplier_identifier text,
  supplier_name text,
  dose_form_identifier text,
  dose_form_name text,
  route_identifiers text[] not null default '{}',
  route_names text[] not null default '{}',
  search_text text not null,
  status text not null default 'active' check (status in ('active','quarantined')),
  quality_flags text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (release_id, entry_type, source_identifier)
);

create index medicine_catalog_releases_status_date_idx
  on public.medicine_catalog_releases (status, release_date desc);
create index medicine_catalog_entries_release_status_idx
  on public.medicine_catalog_entries (release_id, status, entry_type);
create index medicine_catalog_entries_source_idx
  on public.medicine_catalog_entries (source_identifier);
create index medicine_catalog_entries_search_trgm_idx
  on public.medicine_catalog_entries
  using gin (search_text extensions.gin_trgm_ops);

alter table public.medicine_catalog_releases enable row level security;
alter table public.medicine_catalog_entries enable row level security;

revoke all on public.medicine_catalog_releases from public, anon, authenticated;
revoke all on public.medicine_catalog_entries from public, anon, authenticated;
revoke all on sequence public.medicine_catalog_entries_id_seq from public, anon, authenticated;

grant select on public.medicine_catalog_releases to authenticated;
grant select on public.medicine_catalog_entries to authenticated;

create policy "authenticated users read active medicine releases"
on public.medicine_catalog_releases for select to authenticated
using (status = 'active');

create policy "authenticated users read active medicine entries"
on public.medicine_catalog_entries for select to authenticated
using (
  status = 'active'
  and exists (
    select 1
    from public.medicine_catalog_releases release
    where release.id = medicine_catalog_entries.release_id
      and release.status = 'active'
  )
);

alter table public.prescription_items
  add column catalog_entry_id bigint references public.medicine_catalog_entries(id) on delete set null,
  add column medicine_identifier text,
  add column medicine_source text not null default 'manual'
    check (medicine_source in ('manual','cdci_flat')),
  add column catalogue_snapshot jsonb not null default '{}'::jsonb;

create index prescription_items_catalog_entry_idx
  on public.prescription_items (catalog_entry_id)
  where catalog_entry_id is not null;

create or replace function public.activate_medicine_catalog_release(p_release_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  active_count bigint;
begin
  select count(*)
  into active_count
  from public.medicine_catalog_entries
  where release_id = p_release_id
    and status = 'active';

  if active_count = 0 then
    raise exception 'A medicine release cannot be activated without active entries';
  end if;

  update public.medicine_catalog_releases
  set status = 'superseded'
  where status = 'active'
    and id <> p_release_id;

  update public.medicine_catalog_releases
  set status = 'active',
      activated_at = now()
  where id = p_release_id
    and status = 'staged';

  if not found then
    raise exception 'The staged medicine release was not found';
  end if;
end;
$$;

revoke all on function public.activate_medicine_catalog_release(uuid) from public, anon, authenticated;
grant execute on function public.activate_medicine_catalog_release(uuid) to service_role;

