create or replace function public.attach_public_payment_order(
  p_booking_reference text,p_manage_token text,p_provider_order_id text
) returns void language plpgsql security definer set search_path='' as $$
declare v_appointment_id uuid;
begin
  select c.appointment_id into v_appointment_id from private.customer_booking_access c
  where c.booking_reference=upper(trim(p_booking_reference))
    and c.token_hash=extensions.digest(convert_to(p_manage_token,'UTF8'),'sha256');
  if v_appointment_id is null or length(trim(p_provider_order_id))<5 then raise exception 'Payment hold not found'; end if;
  update public.booking_payments p set provider_order_id=trim(p_provider_order_id),updated_at=now()
  from public.appointments a
  where p.appointment_id=v_appointment_id and a.id=p.appointment_id and p.status='created'
    and a.status='payment_pending' and a.hold_expires_at>now();
  if not found then raise exception 'Payment hold has expired'; end if;
end;
$$;

create or replace function public.confirm_public_payment(
  p_booking_reference text,p_manage_token text,p_provider_order_id text,p_provider_payment_id text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_appointment_id uuid;org_id uuid;result jsonb;
begin
  select c.appointment_id into v_appointment_id from private.customer_booking_access c
  where c.booking_reference=upper(trim(p_booking_reference))
    and c.token_hash=extensions.digest(convert_to(p_manage_token,'UTF8'),'sha256');
  if v_appointment_id is null then raise exception 'Payment hold not found'; end if;
  update public.booking_payments p set status='paid',provider_payment_id=trim(p_provider_payment_id),paid_at=now(),updated_at=now()
  from public.appointments a
  where p.appointment_id=v_appointment_id and a.id=p.appointment_id and p.status='created'
    and p.provider_order_id=p_provider_order_id and a.status='payment_pending' and a.hold_expires_at>now()
  returning p.organization_id into org_id;
  if org_id is null then raise exception 'Payment hold has expired or was already processed'; end if;
  update public.appointments set status='confirmed',payment_status='paid',hold_expires_at=null,updated_at=now()
  where id=v_appointment_id;
  insert into public.appointment_events(organization_id,appointment_id,event_type,actor_type,details)
  values(org_id,v_appointment_id,'payment_confirmed','system',jsonb_build_object('provider','razorpay','provider_payment_id',p_provider_payment_id));
  perform private.queue_appointment_reminders(v_appointment_id);
  select jsonb_build_object(
    'appointment_id',a.id,'booking_reference',upper(trim(p_booking_reference)),
    'starts_at',a.starts_at,'ends_at',a.ends_at,'status',a.status,'payment_status',a.payment_status
  ) into result from public.appointments a where a.id=v_appointment_id;
  return result;
end;
$$;

revoke all on function public.attach_public_payment_order(text,text,text) from public;
revoke all on function public.confirm_public_payment(text,text,text,text) from public;
grant execute on function public.attach_public_payment_order(text,text,text) to anon;
grant execute on function public.confirm_public_payment(text,text,text,text) to anon;
