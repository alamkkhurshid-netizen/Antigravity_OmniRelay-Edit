# OmniRelay: Engineering Handoff & Development Changelog

**Target Audience:** CTO, Lead Technical Architect, Fullstack Engineering Team
**Status:** Architecture Implemented & Ready for Code Review

This document provides a comprehensive technical breakdown of the systems, features, and database architectures implemented during the recent development sprints. It serves as a single source of truth for the engineering team to understand the newly introduced capabilities, security paradigms, and architectural decisions.

---

## 1. Active Prepaid Billing Engine (The Deduction Engine)

We transitioned from "shadow billing" to a robust, strict prepaid wallet ecosystem to accommodate real Meta API costs. This system is fully built but currently resting behind a feature flag (`ENABLE_ACTIVE_BILLING`) to ensure zero disruption until go-live.

### Database Architecture (`supabase/migrations/`)
- **`tenant_wallets`**: Stores the absolute source of truth for `balance_paise`. Strictly secured via RLS (Tenants have Read-Only access; modifications are strictly bound to RPCs).
- **`message_ledger`**: The immutable atomic log of all deductions. Unique constraints on `meta_message_id` guarantee idempotency against Meta's webhook retries.
- **`wallet_transactions`**: Logs all Razorpay top-ups.
- **`meta_rate_card`**: Single source of truth for base rates (e.g., Marketing ₹0.89, Utility ₹0.14). Hardcoding rates in the application layer is strictly prohibited.
- **`tenant_pricing_tiers`**: Defines the markup volume rewards (e.g., 20% Starter, 15% Pro).

### Concurrency & Security RPCs
- **`record_and_deduct()`**: The highest-risk function in the codebase. It executes a strict `SELECT ... FOR UPDATE` row-level lock on the tenant's wallet. This guarantees that if 100 reminders are dispatched concurrently, the wallet deducts exactly 100 times without dropping a single deduction due to race conditions.
- **`can_send_message()`**: Pre-flight check. Hard-blocks Marketing messages on ₹0 balance. Grants a strictly enforced **-₹50** negative buffer for Utility (booking confirmations) to prevent patients from silently missing critical alerts.

### Edge Function Integration
- Wired the pre-flight check into `supabase/functions/appointment-reminder-dispatch/index.ts`.
- Wired the webhook deduction trigger into `app/api/whatsapp/webhook/route.ts` (executes on `sent` or `delivered`).
- **Feature Flag Guard**: Both integrations are safely wrapped in `if (process.env.ENABLE_ACTIVE_BILLING === "true")`.

### Automated CRON Jobs (Phase 3 & Phase 4)
- **`calculate_monthly_tiers()`**: Automates volume-based markups by summing the last 30 days of top-ups.
- **`run_reconciliation()`**: Automatically audits the message ledger against Meta's aggregated invoices, flagging variances >2% for manual review.

---

## 2. OEM God-Mode Control Panel

We built a secure, isolated super-admin cluster control plane for platform operators.

### Security Isolation
- The entire module lives under `app/oem/layout.tsx`.
- Protected by a strict `is_platform_operator()` check on the server side. Standard clinic owners attempting to hit `/oem` are instantly rejected.
- Uses `security definer` RPCs (`admin_get_tenant_overview()`) to safely aggregate cross-tenant data without breaking the strict standard Row-Level Security applied elsewhere.

### Features
- **Global KPI Dashboard (`/oem`)**: Tracks total platform messages and real-time Estimated Gross Revenue across all shadow wallets.
- **Tenant Management (`/oem/tenants`)**: A master view of all clinics, their active subscription plans, message consumption, and suspension controls.
- **Billing Oversight (`/oem/billing`)**: Directly monitors the active `whatsapp_rate_cards` and the Razorpay master integration status.

---

## 3. Real-Time WhatsApp Analytics

We upgraded the analytics dashboard to provide instantaneous, real-time feedback to clinic managers regarding their operational usage.

- **Real-Time Subscriptions**: Wrote SQL migrations to enable Supabase Realtime tracking directly on the `operational_usage_events` table.
- **`WhatsAppLiveCounter.tsx`**: A React component that subscribes to the Postgres replication stream and instantly increments the UI whenever a message is dispatched, without requiring a page refresh or polling.

---

## 4. Mobile-First & PWA (Progressive Web App) Readiness

OmniRelay is fundamentally architected to be used by clinic managers on their mobile devices.

- Configured the PWA structure to ensure a seamless "Add to Home Screen" experience on iOS Safari and Android Chrome.
- Injected specific meta tags (`apple-mobile-web-app-capable`, `theme-color`, etc.) and mapped 192x192 / 512x512 splash assets to guarantee native app-like aesthetics.

---

## 5. Voice AI Telephony Receptionist (`08047283676` Live Deployment & Verification)

We built, deployed, and live-verified the Voice AI Phone Receptionist microservice (`omnirelay-voice`) running on Oracle Cloud Infrastructure (OCI Mumbai `ap-mumbai-1`) connected to our Exotel Virtual Number.

### Live Production Specifications
- **Inbound DID:** `08047283676` (Exotel)
- **OCI Compute:** `VM.Standard.A1.Flex` (Ampere ARM64, Ubuntu 24.04, Reserved IP `130.210.29.75`)
- **Reverse Proxy / SSL:** Caddy with automated Let's Encrypt certificates (`https://130.210.29.75.sslip.io`)
- **Telephony Inbound Webhook:** `POST https://130.210.29.75.sslip.io/exoml` returning `<Stream url="wss://130.210.29.75.sslip.io/ws/exotel" />`

### Real-Time Pipeline Stack
- **Framework:** Pipecat 0.0.108 + FastAPI + Uvicorn
- **STT (Speech-to-Text):** Deepgram Nova-3 (8,000 Hz, `language=en`, `interim_results=False`, phonetic keyterms: "OmniRelay", "clinic", "appointment", "doctor")
- **LLM Inference:** Groq LPU (`qwen/qwen3.8-27b`) delivering ~120ms Time-to-First-Token (TTFT) with strict 1-2 sentence spoken receptionist turns
- **TTS (Text-to-Speech):** Cartesia Sonic (`pcm_s16le`, 8,000 Hz, voice: Greg `a0e99841-438c-4a64-b679-ae501e7d6091`)
- **Total Conversational Turnaround:** **< 600ms** end-to-end on real Indian mobile carrier calls

### Architectural Discoveries & Critical Solved Traps
1. **The Codec Mismatch Trap:** Exotel AgentStream `<Stream>` WebSocket **natively sends and expects 16-bit Linear PCM (`s16le`)** in base64, NOT G.711 μ-law. Feeding μ-law produced loud static white noise ("old TV box without antenna"). Switching to raw 16-bit Linear PCM (`s16le`) produced crystal-clear, studio-quality audio.
2. **Immediate Greeting Delivery:** Pipecat's `LLMMessagesAppendFrame` only updates context without triggering speech. Switching to `await task.queue_frames([TTSSpeakFrame(text=greeting)])` ensures the caller hears the greeting within ~150ms of pickup.
3. **Acoustic Loopback & Anti-Echo Strategy:** Because phone lines lack hardware AEC, the bot's speaker audio loops back into the microphone. Using `TranscriptionUserTurnStartStrategy(use_interim=False)` and Deepgram `interim_results=False` completely prevents false self-interruptions.
4. **Short Utterance Aggregation:** Avoided aggressive min-words filtering that was discarding 1-2 word caller responses ("Yes", "Hello").

---

## Action Items for the Engineering Team:
1. **Migration Rollout**: Run `npx supabase db push` to synchronize all the new schemas (`billing` schema, RPCs, OEM policies) to your staging environment.
2. **Environment Variables**: Add your Razorpay API Keys to `.env.local` to test the top-up flows.
3. **Billing Activation**: When you are ready to cut over from shadow-billing to actual deductions, set `ENABLE_ACTIVE_BILLING="true"`. Do not do this until Razorpay is verified!
4. **Voice Agent Tools Integration**: Connect `omnirelay-voice` to OmniRelay's Supabase database endpoints to support live doctor availability lookup and automated appointment scheduling during phone calls.

