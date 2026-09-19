drop policy "owners manage payment gateway status" on public.payment_gateway_connections;
create policy "owners create payment gateway status"
on public.payment_gateway_connections for insert to authenticated
with check (private.is_organization_member(organization_id,'owner'));
create policy "owners update payment gateway status"
on public.payment_gateway_connections for update to authenticated
using (private.is_organization_member(organization_id,'owner'))
with check (private.is_organization_member(organization_id,'owner'));
create policy "owners delete payment gateway status"
on public.payment_gateway_connections for delete to authenticated
using (private.is_organization_member(organization_id,'owner'));

drop policy "owners manage booking payments" on public.booking_payments;
create policy "owners create booking payments"
on public.booking_payments for insert to authenticated
with check (private.is_organization_member(organization_id,'owner'));
create policy "owners update booking payments"
on public.booking_payments for update to authenticated
using (private.is_organization_member(organization_id,'owner'))
with check (private.is_organization_member(organization_id,'owner'));
create policy "owners delete booking payments"
on public.booking_payments for delete to authenticated
using (private.is_organization_member(organization_id,'owner'));
