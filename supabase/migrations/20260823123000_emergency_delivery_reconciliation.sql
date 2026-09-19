alter table public.automation_runs add column if not exists source_type text,add column if not exists source_id uuid,add column if not exists observed_message_id uuid references public.messages(id) on delete set null,add column if not exists delivery_status text check(delivery_status in ('observed','accepted','sent','delivered','read','failed'));
create index if not exists automation_runs_source_idx on public.automation_runs(organization_id,source_type,source_id);
create index if not exists automation_runs_message_idx on public.automation_runs(observed_message_id) where observed_message_id is not null;

create or replace function private.enqueue_automation_event(p_organization_id uuid,p_trigger_key text,p_event_key text,p_safe_context jsonb default '{}'::jsonb)
returns integer language plpgsql security definer set search_path='' as $$ declare inserted_count integer; begin
 insert into public.automation_runs(organization_id,workflow_id,trigger_key,idempotency_key,status,max_attempts,next_attempt_at,completed_at,safe_context,source_type,source_id,delivery_status)
 select w.organization_id,w.id,w.trigger_key,p_trigger_key||':'||p_event_key,case when w.configuration->>'execution_mode'='observe' then 'succeeded' else 'queued' end,w.max_attempts,case when w.configuration->>'execution_mode'='observe' then null else now() end,case when w.configuration->>'execution_mode'='observe' then now() else null end,coalesce(p_safe_context,'{}'::jsonb)||jsonb_build_object('execution_mode',coalesce(w.configuration->>'execution_mode','managed')),nullif(p_safe_context->>'source',''),case when coalesce(p_safe_context->>'source_id','')~*'^[0-9a-f-]{36}$' then (p_safe_context->>'source_id')::uuid else null end,case when w.configuration->>'execution_mode'='observe' then 'observed' else null end
 from public.automation_workflows w where w.organization_id=p_organization_id and w.trigger_key=p_trigger_key and w.status='active'
 on conflict(organization_id,idempotency_key) do nothing; get diagnostics inserted_count=row_count; return inserted_count; end $$;
revoke all on function private.enqueue_automation_event(uuid,text,text,jsonb) from public,anon,authenticated; grant execute on function private.enqueue_automation_event(uuid,text,text,jsonb) to service_role;

update public.automation_workflows w set status='active',configuration=w.configuration||jsonb_build_object('execution_mode','observe','rollout','pilot_3'),updated_at=now()
where w.trigger_key='emergency_notice' and exists(select 1 from public.organizations_addresses oa where oa.organization_id=w.organization_id and oa.service='whatsapp' and oa.status='connected');

create or replace function private.observe_emergency_recipient_automation() returns trigger language plpgsql security definer set search_path='' as $$ declare campaign_kind text; begin
 select campaign_type into campaign_kind from public.campaigns where id=new.campaign_id and organization_id=new.organization_id;
 if campaign_kind='emergency' then perform private.enqueue_automation_event(new.organization_id,'emergency_notice',new.id::text,jsonb_build_object('source','emergency_recipient','source_id',new.id,'scheduled_for',new.scheduled_for,'status',new.status)); end if; return new; end $$;
drop trigger if exists observe_emergency_recipient_automation on public.campaign_recipients; create trigger observe_emergency_recipient_automation after insert on public.campaign_recipients for each row execute function private.observe_emergency_recipient_automation();
revoke all on function private.observe_emergency_recipient_automation() from public,anon,authenticated;

create or replace function private.reconcile_automation_message_delivery() returns trigger language plpgsql security definer set search_path='' as $$ declare resolved_status text; begin
 if new.direction<>'outgoing' then return new; end if;
 resolved_status:=case when new.status?'failed' then 'failed' when new.status?'read' then 'read' when new.status?'delivered' then 'delivered' when new.status?'sent' then 'sent' when new.status?'accepted' then 'accepted' else null end;
 if resolved_status is null then return new; end if;
 update public.automation_runs r set observed_message_id=new.id,delivery_status=resolved_status,status=case when resolved_status='failed' then 'failed' else r.status end,failure_code=case when resolved_status='failed' then left(coalesce(new.status->'errors'->0->'error'->>'code','provider_error'),100) else null end,failure_summary=case when resolved_status='failed' then 'WhatsApp delivery failed. Review Operations health before retrying.' else null end,completed_at=coalesce(r.completed_at,now()),updated_at=now()
 where r.organization_id=new.organization_id and ((r.source_type='appointment_reminder' and exists(select 1 from public.reminder_events e where e.id=r.source_id and e.message_id=new.id)) or (r.source_type='doctor_queue' and exists(select 1 from public.doctor_queue_dispatches d where d.id=r.source_id and d.message_id=new.id)) or (r.source_type='emergency_recipient' and exists(select 1 from public.campaign_recipients c where c.id=r.source_id and c.message_id=new.id)));
 return new; end $$;
drop trigger if exists reconcile_automation_message_delivery on public.messages; create trigger reconcile_automation_message_delivery after insert or update of status on public.messages for each row execute function private.reconcile_automation_message_delivery();
revoke all on function private.reconcile_automation_message_delivery() from public,anon,authenticated;

create or replace function private.refresh_automation_workflow_health() returns trigger language plpgsql security definer set search_path='' as $$ begin
 update public.automation_workflows set last_run_at=coalesce(new.started_at,new.created_at),last_success_at=case when new.status='succeeded' then coalesce(new.completed_at,now()) else last_success_at end,last_failure_at=case when new.status='failed' then coalesce(new.completed_at,now()) else last_failure_at end,updated_at=now() where id=new.workflow_id and organization_id=new.organization_id; return new; end $$;
drop trigger if exists refresh_automation_workflow_health on public.automation_runs; create trigger refresh_automation_workflow_health after insert or update of status,delivery_status on public.automation_runs for each row execute function private.refresh_automation_workflow_health();
revoke all on function private.refresh_automation_workflow_health() from public,anon,authenticated;
