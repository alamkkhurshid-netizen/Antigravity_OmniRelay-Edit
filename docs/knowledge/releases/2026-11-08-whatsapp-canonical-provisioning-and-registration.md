# WhatsApp Canonical Provisioning, 6-Digit PIN Registration & Resilient Lifecycle

**Date:** 08 November 2026  
**Status:** Completed and verified against automated unit, lifecycle, and route guard test suites.

## Summary of Remediated Findings & Capabilities

1. **Two-Step Cloud API PIN Registration (`/api/whatsapp/register`):**
   - Implemented mandatory Step 2 Cloud API registration for newly onboarded phone numbers.
   - Enforces 6-digit numeric PIN format (`/^\d{6}$/`) with zero-storage in logs, database, or API responses.
   - 30-second rate-limiting cooldown per tenant with `Retry-After` HTTP header.
   - Sealed access tokens retrieved exclusively from Supabase Vault via `get_whatsapp_access_token` RPC.
   - Dispatches `POST https://graph.facebook.com/v24.0/{PHONE_NUMBER_ID}/register` with encrypted credentials.

2. **Resilient Status Resolution & Polling:**
   - Mitigated Meta's asynchronous certificate propagation race condition.
   - Polling loop checks status with backoff; resolves to `CONNECTED` when `status === "CONNECTED"` or `code_verification_status === "VERIFIED"`.
   - Prevents reverting successfully registered numbers to `pending_registration`.

3. **Canonical Two-Table Lifecycle Model:**
   - Canonical status check constraint on `channel_connections` and `whatsapp_onboarding_runs`:
     `initiated`, `authorized`, `assets_verified`, `webhook_subscribed`, `pending_registration`, `pending_verification`, `connected`, `acceptance_testing`, `live`, `failed_recoverable`, `disabled`.
   - Idempotent reset: `cloud_api_registered_at := null;` on fresh onboarding runs to eliminate stale timestamp reliance.
   - Rejection of cross-tenant phone assignments (HTTP 409).

4. **Guided Activation & Inbound Handshake UX:**
   - Explicit user messaging upon completing Embedded Signup guiding the owner to enter the 6-digit PIN.
   - Direct `wa.me/<number>?text=Hi` test trigger in `whatsapp-connect.tsx`.
   - Background polling listener automatically promotes status to `LIVE` upon webhook receipt of the verified inbound test message.
