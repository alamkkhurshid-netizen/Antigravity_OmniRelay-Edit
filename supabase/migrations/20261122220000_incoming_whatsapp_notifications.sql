-- Migration: In-app notifications and badges for incoming patient WhatsApp messages
-- Alerts clinic staff instantly when a patient sends a WhatsApp message.

CREATE OR REPLACE FUNCTION private.notify_incoming_whatsapp_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sender_name text;
  v_phone text;
  v_text text;
  v_title text;
  v_body text;
  v_href text;
BEGIN
  IF NEW.direction <> 'incoming' OR NEW.service <> 'whatsapp' THEN
    RETURN NEW;
  END IF;

  v_phone := coalesce(nullif(trim(NEW.contact_address), ''), 'Patient');

  -- Attempt to resolve sender name from contacts
  SELECT name INTO v_sender_name
  FROM public.contacts
  WHERE organization_id = NEW.organization_id
    AND (extra->>'phone' = v_phone OR extra->>'address' = v_phone)
  LIMIT 1;

  IF v_sender_name IS NULL THEN
    SELECT name INTO v_sender_name
    FROM public.conversations
    WHERE id = NEW.conversation_id
    LIMIT 1;
  END IF;

  v_sender_name := coalesce(v_sender_name, v_phone);

  v_text := coalesce(NEW.content->>'text', NEW.content#>>'{text,body}', '');
  IF length(v_text) = 0 AND (NEW.content->>'type' = 'file' OR NEW.content->>'kind' IN ('image', 'document')) THEN
    v_text := 'Sent a media attachment.';
  END IF;

  v_title := substring('WhatsApp from ' || v_sender_name FROM 1 FOR 150);
  v_body := substring(CASE WHEN length(v_text) > 0 THEN '"' || v_text || '"' ELSE 'New patient message received.' END || ' Tap to reply.' FROM 1 FOR 250);
  v_href := '/app/conversations?phone=' || v_phone;

  INSERT INTO public.app_notifications (
    organization_id,
    recipient_user_id,
    notification_type,
    title,
    body,
    href,
    entity_type,
    entity_id,
    priority,
    escalation_level
  )
  SELECT
    NEW.organization_id,
    a.user_id,
    'system',
    v_title,
    v_body,
    v_href,
    'incoming_whatsapp_message',
    NEW.id,
    'normal',
    0
  FROM public.agents a
  WHERE a.organization_id = NEW.organization_id
    AND a.ai = false
    AND a.user_id IS NOT NULL
    AND coalesce((a.extra->>'status')::text, 'active') <> 'inactive';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_incoming_whatsapp_message ON public.messages;
CREATE TRIGGER trg_notify_incoming_whatsapp_message
AFTER INSERT ON public.messages
FOR EACH ROW
WHEN (NEW.direction = 'incoming' AND NEW.service = 'whatsapp')
EXECUTE FUNCTION private.notify_incoming_whatsapp_message();
