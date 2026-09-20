create or replace function private.sync_campaign_delivery_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  provider_status text;
begin
  provider_status := case
    when new.status ? 'read' then 'read'
    when new.status ? 'delivered' then 'delivered'
    when new.status ? 'sent' or new.status ? 'accepted' then 'sent'
    when new.status ? 'failed' then 'failed'
    else null
  end;
  if provider_status is null then return new; end if;

  update public.campaign_recipients
  set
    provider_message_id = coalesce(provider_message_id, new.external_id),
    status = provider_status,
    sent_at = case when provider_status in ('sent','delivered','read') then coalesce(sent_at, now()) else sent_at end,
    delivered_at = case when provider_status in ('delivered','read') then coalesce(delivered_at, now()) else delivered_at end,
    read_at = case when provider_status = 'read' then coalesce(read_at, now()) else read_at end,
    failure_reason = case when provider_status = 'failed' then coalesce(new.status#>>'{errors,0,error,message}', new.status#>>'{failed,error,message}', 'WhatsApp delivery failed') else null end,
    updated_at = now()
  where message_id = new.id
     or (new.external_id is not null and provider_message_id = new.external_id);
  return new;
end;
$$;

drop trigger if exists sync_campaign_delivery_after_message on public.messages;
create trigger sync_campaign_delivery_after_message
after insert or update of status, external_id on public.messages
for each row execute function private.sync_campaign_delivery_status();
revoke all on function private.sync_campaign_delivery_status() from public, anon, authenticated;

create or replace function private.capture_whatsapp_opt_out()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_text text;
  matched_patient uuid;
begin
  if new.direction <> 'incoming' or new.service <> 'whatsapp' then return new; end if;
  normalized_text := lower(trim(coalesce(new.content->>'text', '')));
  if normalized_text not in ('stop','unsubscribe','cancel subscription','opt out','opt-out') then return new; end if;

  select id into matched_patient
  from public.patient_profiles
  where organization_id = new.organization_id
    and regexp_replace(coalesce(phone,''), '\D', '', 'g') = regexp_replace(new.contact_address, '\D', '', 'g')
  order by updated_at desc limit 1;

  insert into public.communication_opt_outs(organization_id,patient_id,channel,address,scope,source,reason)
  values(new.organization_id,matched_patient,'whatsapp',regexp_replace(new.contact_address,'\D','','g'),'all','whatsapp_keyword','Customer sent ' || upper(normalized_text))
  on conflict(organization_id,channel,address,scope)
  do update set opted_out_at=now(),reason=excluded.reason,patient_id=coalesce(excluded.patient_id,public.communication_opt_outs.patient_id);

  if matched_patient is not null then
    update public.patient_profiles set care_communications_consent=false,marketing_consent=false,updated_at=now() where id=matched_patient;
  end if;

  update public.campaign_recipients
  set status='opted_out',failure_reason='Customer opted out on WhatsApp.',updated_at=now()
  where organization_id=new.organization_id
    and regexp_replace(recipient_address,'\D','','g')=regexp_replace(new.contact_address,'\D','','g')
    and status in ('pending','approved','queued');
  return new;
end;
$$;

drop trigger if exists capture_whatsapp_opt_out_after_message on public.messages;
create trigger capture_whatsapp_opt_out_after_message
after insert on public.messages for each row execute function private.capture_whatsapp_opt_out();
revoke all on function private.capture_whatsapp_opt_out() from public, anon, authenticated;

create or replace function private.refresh_campaign_counts()
returns trigger language plpgsql security definer set search_path='' as $$
declare target_id uuid:=coalesce(new.campaign_id,old.campaign_id);
begin
 update public.campaigns c set
  total_count=s.total_count,eligible_count=s.eligible_count,sent_count=s.sent_count,delivered_count=s.delivered_count,
  read_count=s.read_count,failed_count=s.failed_count,skipped_count=s.skipped_count,
  status=case when c.status not in ('cancelled','paused') and s.total_count>0 and s.open_count=0 then 'completed' else c.status end,
  updated_at=now()
 from (
  select count(*)::int total_count,count(*) filter(where status not in ('skipped','opted_out'))::int eligible_count,
   count(*) filter(where status in ('sent','delivered','read'))::int sent_count,
   count(*) filter(where status in ('delivered','read'))::int delivered_count,count(*) filter(where status='read')::int read_count,
   count(*) filter(where status='failed')::int failed_count,count(*) filter(where status in ('skipped','opted_out'))::int skipped_count,
   count(*) filter(where status in ('pending','approved','queued'))::int open_count
  from public.campaign_recipients where campaign_id=target_id
 ) s where c.id=target_id;
 return coalesce(new,old);
end $$;
revoke all on function private.refresh_campaign_counts() from public,anon,authenticated;

select cron.schedule(
  'omnirelay-campaign-dispatch',
  '* * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='edge_functions_url') || '/campaign-dispatch',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='edge_functions_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  $job$
);
