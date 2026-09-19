create index if not exists doctor_queue_dispatches_rule_idx
  on public.doctor_queue_dispatches (availability_rule_id);
create index if not exists doctor_queue_dispatches_resource_idx
  on public.doctor_queue_dispatches (resource_id);
create index if not exists doctor_queue_dispatches_message_idx
  on public.doctor_queue_dispatches (message_id)
  where message_id is not null;
