-- Planning-only India rate card for the clinic-facing calculator.
-- It is deliberately inactive: no shadow valuation, wallet debit, or send decision uses it.

alter table public.whatsapp_rate_cards
  alter column base_rate_paise type numeric(16,4) using base_rate_paise::numeric,
  alter column platform_fee_paise type numeric(16,4) using platform_fee_paise::numeric;

alter table public.operational_usage_events
  alter column base_cost_paise type numeric(16,4) using base_cost_paise::numeric,
  alter column platform_fee_paise type numeric(16,4) using platform_fee_paise::numeric,
  alter column estimated_total_paise type numeric(16,4) using estimated_total_paise::numeric,
  alter column charged_total_paise type numeric(16,4) using charged_total_paise::numeric;

alter table public.whatsapp_rate_cards
  add column if not exists verification_status text not null default 'draft'
    check (verification_status in ('draft','verified','retired'));

alter table public.whatsapp_rate_cards
  drop constraint if exists whatsapp_rate_card_active_requires_verification;
alter table public.whatsapp_rate_cards
  add constraint whatsapp_rate_card_active_requires_verification
    check (not active or verification_status = 'verified');

drop policy if exists "authenticated users read published whatsapp rate cards" on public.whatsapp_rate_cards;
create policy "authenticated users read planning whatsapp rate cards"
  on public.whatsapp_rate_cards for select to authenticated
  using (verification_status in ('draft','verified'));

insert into public.whatsapp_rate_cards(
  channel,country_code,message_category,base_rate_paise,platform_fee_paise,currency,
  source_url,source_version,effective_at,active,verification_status
)
select v.channel,v.country_code,v.message_category,v.base_rate_paise,v.platform_fee_paise,v.currency,
  v.source_url,v.source_version,v.effective_at,v.active,v.verification_status
from (values
  ('whatsapp'::text,'IN'::text,'marketing'::text,86.3100::numeric,0::numeric,'INR'::text,'https://whatsappbusiness.com/products/platform-pricing/'::text,'India planning rate supplied 2026-09-12; reconciliation pending'::text,'2026-09-12T00:00:00Z'::timestamptz,false,'draft'::text),
  ('whatsapp'::text,'IN'::text,'utility'::text,11.5000::numeric,0::numeric,'INR'::text,'https://whatsappbusiness.com/products/platform-pricing/'::text,'India planning rate supplied 2026-09-12; reconciliation pending'::text,'2026-09-12T00:00:00Z'::timestamptz,false,'draft'::text),
  ('whatsapp'::text,'IN'::text,'authentication'::text,11.5000::numeric,0::numeric,'INR'::text,'https://whatsappbusiness.com/products/platform-pricing/'::text,'India planning rate supplied 2026-09-12; reconciliation pending'::text,'2026-09-12T00:00:00Z'::timestamptz,false,'draft'::text)
) as v(channel,country_code,message_category,base_rate_paise,platform_fee_paise,currency,source_url,source_version,effective_at,active,verification_status)
where not exists (
  select 1 from public.whatsapp_rate_cards existing
  where existing.channel=v.channel and existing.country_code=v.country_code
    and existing.message_category=v.message_category and existing.verification_status='draft'
);
