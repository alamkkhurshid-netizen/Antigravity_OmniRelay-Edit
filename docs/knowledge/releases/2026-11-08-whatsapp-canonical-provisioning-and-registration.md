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

5. **Outbound WhatsApp Dispatch (`/api/conversations/reply` & `/api/conversations/start`):**
   - Transmits staff free-form replies and approved templates directly to Meta Cloud API via `POST https://graph.facebook.com/v24.0/{PHONE_ID}/messages`.
   - Access tokens retrieved securely via `get_whatsapp_access_token` from Vault with fallback to sealed credentials.
   - Atomically records Meta `external_id` (wamid) and updates delivery status to `accepted` and `sent`.
   - Automatically advances connection status to `live` on verified outbound dispatch acceptance.

6. **Conversations Workspace Density & Viewport Polish:**
   - Eliminated vertical window double-scrolling by binding inbox container to `calc(100vh - 9.5rem)`.
   - Compacted 3-column proportions (264px sidebars, streamlined message bubbles with 13px typography).
   - Removed repetitive bubble tags and scaled patient context card to crisp professional SaaS standards.

7. **Production Route Guard Hardening:**
   - Unified `isWhatsAppStagingAllowed` to validate dual-environment strict mapping (`staging` -> `sqcprlkhsnfbydgzpsml`, `production` -> `dwkwxrcuycsqiviozgtl`).
   - Dynamic `getWhatsAppWebhookCallbackUrl()` resolving to production Supabase webhook for live clinics.

8. **Action Centre High-Density Redesign:**
   - Unified single-bar Command Strip with real-time patient safety verification (`Consent verified · Rate limits checked`).
   - Eliminated redundant duplicate deploy sections.
   - High-density 3-tile routine metrics grid with 1px hairline border and crisp 12px microcopy.
   - Refactored Priority Review Queue into Linear-grade triage with filter tabs (`All`, `AI Drafts`, `Bookings & Waitlist`, `Care Tasks`, `Launch & Carrier`).
   - Standardized 8px radii, subtle semantic status pills, and surgical inline actions.

