-- Published rate cards are globally readable to signed-in workspace members.
-- They contain no tenant data; writes remain server/operator only.
grant select on public.whatsapp_rate_cards to authenticated;
drop policy if exists "authenticated users read published whatsapp rate cards" on public.whatsapp_rate_cards;
create policy "authenticated users read published whatsapp rate cards"
  on public.whatsapp_rate_cards for select to authenticated using (active);
