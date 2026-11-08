-- Preserve which approved-document revision produced each chunk. This lets the
-- indexer reuse unchanged chunks without serving an old document revision.
alter table public.knowledge_chunks
  add column if not exists source_updated_at timestamptz;

create index if not exists knowledge_chunks_org_document_revision_idx
  on public.knowledge_chunks (organization_id, document_id, source_updated_at);

create or replace function public.match_rag_knowledge_chunks(
  query_embedding public.vector,
  match_threshold double precision,
  match_count integer,
  p_organization_id uuid
) returns table(
  id uuid,
  document_id uuid,
  title text,
  source_type text,
  content text,
  updated_at timestamptz,
  similarity double precision
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and not private.is_organization_member(p_organization_id, 'member') then
    raise exception 'Workspace access required' using errcode = '42501';
  end if;
  if (select auth.uid()) is null
     and (select auth.role()) is distinct from 'service_role' then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if match_count < 1 or match_count > 8
     or match_threshold < 0 or match_threshold > 1 then
    raise exception 'Invalid retrieval bounds';
  end if;

  return query
  select kc.id, kc.document_id, item.title, item.source_type, kc.content,
    item.updated_at,
    1 - (kc.embedding operator(public.<=>) query_embedding) as similarity
  from public.knowledge_chunks kc
  join public.rag_knowledge_items item on item.id = kc.document_id
  where kc.organization_id = p_organization_id
    and item.organization_id = p_organization_id
    and item.status = 'approved'
    and item.source_type in ('faq', 'policy', 'service', 'business_info')
    and kc.source_updated_at = item.updated_at
    and kc.embedding is not null
    and 1 - (kc.embedding operator(public.<=>) query_embedding) > match_threshold
  order by kc.embedding operator(public.<=>) query_embedding
  limit match_count;
end;
$$;

revoke execute on function public.match_rag_knowledge_chunks(public.vector, double precision, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.match_rag_knowledge_chunks(public.vector, double precision, integer, uuid)
  to service_role;
