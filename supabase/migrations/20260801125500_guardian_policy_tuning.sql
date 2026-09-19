drop policy if exists "admins manage guardian links" on public.patient_guardian_links;
create policy "admins insert guardian links" on public.patient_guardian_links for insert to authenticated
with check (private.is_organization_member(organization_id,'admin'));
create policy "admins update guardian links" on public.patient_guardian_links for update to authenticated
using (private.is_organization_member(organization_id,'admin')) with check (private.is_organization_member(organization_id,'admin'));
create policy "admins delete guardian links" on public.patient_guardian_links for delete to authenticated
using (private.is_organization_member(organization_id,'admin'));
