-- Pin every remaining mutable function search path. The vector distance
-- operator lives in public because the vector extension is installed there,
-- so it is explicitly schema-qualified before the path is emptied.
--
-- Rollback (only if required):
--   alter function <signature> reset search_path;

alter function public.before_insert_on_messages()
  set search_path = '';

alter function public.merge_update()
  set search_path = '';

alter function public.pause_conversation_on_human_message()
  set search_path = '';

alter function public.preserve_message_direction()
  set search_path = '';

alter function public.has_permission(uuid, uuid, text)
  set search_path = '';

create or replace function public.match_knowledge_chunks(
  query_embedding public.vector,
  match_threshold double precision,
  match_count integer,
  p_organization_id uuid
)
returns table(id uuid, content text, similarity double precision)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  return query
  select
    kc.id,
    kc.content,
    1 - (kc.embedding operator(public.<=>) query_embedding) as similarity
  from public.knowledge_chunks kc
  where kc.organization_id = p_organization_id
    and 1 - (kc.embedding operator(public.<=>) query_embedding) > match_threshold
  order by kc.embedding operator(public.<=>) query_embedding
  limit match_count;
end;
$function$;
