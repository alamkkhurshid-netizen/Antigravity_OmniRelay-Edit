-- Enable the pg_net extension if it is not already enabled
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create the HTTP request function for the webhook
CREATE OR REPLACE FUNCTION trigger_super_cto_webhook()
RETURNS TRIGGER AS $$
DECLARE
  payload JSONB;
BEGIN
  -- Construct the payload
  payload := jsonb_build_object(
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA,
    'record', row_to_json(NEW)
  );

  -- We use pg_net extension to make an async HTTP POST request
  -- The url must point to the production Vercel project or a proxy
  PERFORM net.http_post(
    url := 'https://omnirelay-main.vercel.app/api/ai/notify',
    body := payload,
    headers := '{"Content-Type": "application/json", "x-webhook-secret": "123456"}'::jsonb
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger on the ai_governance_queue table
DROP TRIGGER IF EXISTS on_governance_queue_insert ON ai_governance_queue;
CREATE TRIGGER on_governance_queue_insert
  AFTER INSERT ON ai_governance_queue
  FOR EACH ROW
  EXECUTE FUNCTION trigger_super_cto_webhook();
