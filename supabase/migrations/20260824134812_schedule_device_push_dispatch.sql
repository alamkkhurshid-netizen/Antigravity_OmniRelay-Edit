-- Run the service-role protected dispatcher every minute. The request credentials
-- are read at execution time from Supabase Vault; no secret is stored in cron SQL.
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'dispatch-device-push-alerts') then
    perform cron.schedule(
      'dispatch-device-push-alerts',
      '* * * * *',
      $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_url') || '/device-push-dispatch',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_token')
        ),
        body := jsonb_build_object('scheduled_at', now()),
        timeout_milliseconds := 10000
      );
      $job$
    );
  end if;
end
$$;
