update public.channel_message_templates t
set status='approved',updated_at=now()
where t.channel='whatsapp'
  and t.event_type='doctor_queue'
  and t.provider_template_name='omnirelay_doctor_queue'
  and t.language_code='en'
  and exists (
    select 1 from public.organizations_addresses a
    where a.organization_id=t.organization_id
      and a.service='whatsapp'
      and a.status='connected'
  );
