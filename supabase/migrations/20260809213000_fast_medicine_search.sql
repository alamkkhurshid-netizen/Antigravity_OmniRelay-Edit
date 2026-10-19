create index if not exists medicine_catalog_entries_display_prefix_idx
  on public.medicine_catalog_entries
  (lower(display_name) text_pattern_ops)
  where status = 'active';

create index if not exists medicine_catalog_entries_generic_prefix_idx
  on public.medicine_catalog_entries
  (lower(generic_name) text_pattern_ops)
  where status = 'active' and generic_name is not null;

create or replace function public.search_active_medicines(
  p_query text,
  p_limit integer default 12
)
returns table (
  id bigint,
  source_identifier text,
  entry_type text,
  display_name text,
  generic_name text,
  supplier_name text,
  dose_form_name text,
  route_names text[]
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_query text := lower(regexp_replace(trim(coalesce(p_query, '')), '\s+', ' ', 'g'));
  v_limit integer := least(greatest(coalesce(p_limit, 12), 1), 20);
  v_prefix_count integer := 0;
begin
  if char_length(v_query) < 2 then
    return;
  end if;

  return query
  select
    entry.id,
    entry.source_identifier,
    entry.entry_type,
    entry.display_name,
    entry.generic_name,
    entry.supplier_name,
    entry.dose_form_name,
    entry.route_names
  from public.medicine_catalog_entries entry
  join public.medicine_catalog_releases release on release.id = entry.release_id
  where entry.status = 'active'
    and release.status = 'active'
    and (
      lower(entry.display_name) like v_query || '%'
      or lower(entry.generic_name) like v_query || '%'
    )
  order by
    case
      when lower(entry.display_name) = v_query then 0
      when lower(entry.display_name) like v_query || '%' then 1
      else 2
    end,
    case when entry.entry_type = 'brand' then 0 else 1 end,
    length(entry.display_name),
    entry.display_name
  limit v_limit;

  get diagnostics v_prefix_count = row_count;

  if v_prefix_count < v_limit and char_length(v_query) >= 3 then
    return query
    select
      entry.id,
      entry.source_identifier,
      entry.entry_type,
      entry.display_name,
      entry.generic_name,
      entry.supplier_name,
      entry.dose_form_name,
      entry.route_names
    from public.medicine_catalog_entries entry
    join public.medicine_catalog_releases release on release.id = entry.release_id
    where entry.status = 'active'
      and release.status = 'active'
      and entry.search_text ilike '%' || replace(replace(v_query, '%', '\%'), '_', '\_') || '%' escape '\'
      and lower(entry.display_name) not like v_query || '%'
      and coalesce(lower(entry.generic_name), '') not like v_query || '%'
    order by similarity(entry.search_text, v_query) desc, entry.display_name
    limit (v_limit - v_prefix_count);
  end if;
end;
$$;

revoke all on function public.search_active_medicines(text, integer) from public, anon;
grant execute on function public.search_active_medicines(text, integer) to authenticated;
