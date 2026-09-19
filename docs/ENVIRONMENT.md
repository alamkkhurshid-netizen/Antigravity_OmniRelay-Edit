# Environment variables

Store values only in the deployment platform or Supabase secret store. Never commit them.

## Browser-safe

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `PUBLIC_SITE_URL`

## Server-only

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (legacy compatibility only; prefer the scoped secret key where supported)
- `META_APP_ID`
- `META_EMBEDDED_SIGNUP_CONFIG_ID`
- `META_GRAPH_API_VERSION`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_VERIFY_TOKEN`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `MEDICINE_IMPORT_SECRET`
- `WEB_PUSH_VAPID_SUBJECT` (for example, `mailto:operations@example.com`)
- `WEB_PUSH_VAPID_PUBLIC_KEY` (returned only to authenticated OmniRelay staff through `device-push-config`)
- `WEB_PUSH_VAPID_PRIVATE_KEY`

Use separate values for local, preview and production. Rotate any value exposed in chat, logs or screenshots. A new engineer or AI model receives access through the provider's role system, never by copying secrets into a prompt.
