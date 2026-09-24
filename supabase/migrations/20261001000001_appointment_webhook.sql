-- Enable the pg_net extension
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create the webhook function
CREATE OR REPLACE FUNCTION public.calendar_sync_webhook()
RETURNS trigger AS $$
BEGIN
  PERFORM net.http_post(
      url:='https://omnirelay-main.vercel.app/api/webhooks/appointments/calendar-sync',
      body:=jsonb_build_object('type', TG_OP, 'record', row_to_json(NEW))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Set up the webhook trigger for calendar sync
DROP TRIGGER IF EXISTS "appointments_calendar_sync" ON "public"."appointments";
CREATE TRIGGER "appointments_calendar_sync"
AFTER INSERT OR UPDATE ON "public"."appointments"
FOR EACH ROW
EXECUTE FUNCTION public.calendar_sync_webhook();
