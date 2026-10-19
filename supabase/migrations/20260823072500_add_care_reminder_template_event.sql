alter table public.channel_message_templates
  drop constraint channel_message_templates_event_type_check;

alter table public.channel_message_templates
  add constraint channel_message_templates_event_type_check
  check (event_type = any (array[
    'confirmation',
    'reminder_24h',
    'reminder_2h',
    'follow_up',
    'cancellation',
    'reschedule',
    'care_campaign',
    'marketing_campaign',
    'emergency_notice',
    'booking_otp',
    'doctor_queue',
    'care_reminder'
  ]::text[]));
