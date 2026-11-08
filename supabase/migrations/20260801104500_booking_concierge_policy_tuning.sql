drop policy if exists "admins manage booking bot settings" on public.whatsapp_booking_settings;
create policy "admins insert booking bot settings" on public.whatsapp_booking_settings for insert to authenticated with check (private.is_organization_member(organization_id,'admin'));
create policy "admins update booking bot settings" on public.whatsapp_booking_settings for update to authenticated using (private.is_organization_member(organization_id,'admin')) with check (private.is_organization_member(organization_id,'admin'));
create policy "owners delete booking bot settings" on public.whatsapp_booking_settings for delete to authenticated using (private.is_organization_member(organization_id,'owner'));
