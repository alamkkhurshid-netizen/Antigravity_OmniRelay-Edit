-- Remove inherited authenticated write privileges from operational billing tables.
revoke all on public.operational_billing_settings, public.operational_wallets, public.whatsapp_rate_cards, public.operational_usage_events, public.operational_wallet_ledger from public, anon, authenticated;
grant select on public.operational_billing_settings, public.operational_wallets, public.operational_usage_events, public.operational_wallet_ledger to authenticated;
