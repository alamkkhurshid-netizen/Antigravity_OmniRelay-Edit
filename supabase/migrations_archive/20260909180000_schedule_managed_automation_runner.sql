-- Starts the managed booking-evidence reconciler once per minute.
-- It is service-role protected and never dispatches a WhatsApp message itself.
-- Historical reminder queues are owned by their separate dispatchers and are
-- deliberately outside this job's scope.
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'run-managed-automation-worker') then
    perform cron.schedule(
      'run-managed-automation-worker',
      '* * * * *',
      $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_url') || '/automation-runner',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_token')
        ),
        body := jsonb_build_object('scheduled_at', now(), 'scope', 'managed_booking_evidence_only'),
        timeout_milliseconds := 10000
      );
      $job$
    );
  end if;
end
$$;
