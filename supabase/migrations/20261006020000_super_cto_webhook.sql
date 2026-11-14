-- Enable the pg_net extension if it is not already enabled
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create the HTTP request function for the webhook
CREATE OR REPLACE FUNCTION trigger_super_cto_webhook()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  payload JSONB;
  webhook_secret TEXT;
BEGIN
  -- Retrieve secret securely from Supabase Vault (never commit plain credentials)
  BEGIN
    SELECT decrypted_secret INTO webhook_secret
    FROM vault.decrypted_secrets
    WHERE name = 'supabase_webhook_secret'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    webhook_secret := NULL;
  END;

  IF webhook_secret IS NULL OR webhook_secret = '123456' OR length(webhook_secret) < 16 THEN
    -- Suppress unauthenticated/insecure dispatch
    RETURN NEW;
  END IF;

  -- Construct the payload
  payload := jsonb_build_object(
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA,
    'record', row_to_json(NEW)
  );

  -- We use pg_net extension to make an async HTTP POST request
  PERFORM net.http_post(
    url := 'https://omnirelay-main.vercel.app/api/ai/notify',
    body := payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', webhook_secret
    )
  );
  
  RETURN NEW;
END;
$$;

-- Create the trigger on the ai_governance_queue table
DROP TRIGGER IF EXISTS on_governance_queue_insert ON ai_governance_queue;
CREATE TRIGGER on_governance_queue_insert
  AFTER INSERT ON ai_governance_queue
  FOR EACH ROW
  EXECUTE FUNCTION trigger_super_cto_webhook();
