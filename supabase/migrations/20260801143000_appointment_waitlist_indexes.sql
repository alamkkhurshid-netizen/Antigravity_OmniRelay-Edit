create index appointment_waitlist_booking_request_idx on public.appointment_waitlist(booking_request_id) where booking_request_id is not null;
create index appointment_waitlist_patient_idx on public.appointment_waitlist(patient_id) where patient_id is not null;
create index appointment_waitlist_service_idx on public.appointment_waitlist(service_id);
create index appointment_waitlist_location_idx on public.appointment_waitlist(location_id) where location_id is not null;
create index appointment_waitlist_resource_idx on public.appointment_waitlist(resource_id) where resource_id is not null;
