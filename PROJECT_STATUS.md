# OmniRelay project status

Updated: 1 September 2026

## Working product areas

- Public light-mode landing page, legal pages and Google/Supabase authentication
- Tenant-aware onboarding, business profiles, locations/chambers, services and availability
- Public booking, collision protection, appointment management and customer self-service
- Razorpay test checkout with server-side order creation and payment verification
- WhatsApp webhook ingestion, operational inbox, replies, templates and message status updates
- Patient/contact records, visit history, consent controls and profile photos
- Campaign audience safeguards, templates, scheduling and opt-out handling
- AI-agent FAQ library, deterministic safety tests and human handoff controls
- Booking concierge and appointment lifecycle foundations
- OEM/operator foundations and subscription/trial scaffolding
- Clinic team operations with secure staff invitations, dual access/clinical roles, assigned care tasks and private in-app notifications
- Production operations hardening with reversible staff deactivation, immediate access revocation, append-only team audits, safe operational events and server-enforced team-action rate limits
- Structured patient care plans with doctor-approved goals, start/target/review dates, clinic ownership and pause/resume/complete lifecycle controls
- Medication-reminder adherence capture for exact WhatsApp replies, with missed-dose/help escalation into the clinic task queue
- Durable automation recovery with exhausted-job visibility, administrator-only one-click release, per-user throttling and an immutable retry audit trail
- Provider-level WhatsApp observability with safe Meta error classification, actionable inbox guidance, administrator alerts for repeated failures and privacy-safe operational records

## Current milestone

Phase 1 clinic CRM is functionally complete for a controlled pilot. The current milestone is controlled clinic-pilot closure while Meta App Review is pending. Reliability now includes recoverable leases, dead-letter recovery, worker-health alerts, an Action Centre escalation for blocked launch gates, and server-enforced final pilot sign-off prerequisites.

The permanent post-approval gate tracker is [docs/POST_META_APPROVAL_LAUNCH_CHECKLIST.md](docs/POST_META_APPROVAL_LAUNCH_CHECKLIST.md). It must be updated after every pilot test, deployment, Meta change, or incident.

## Known gaps

- Production WhatsApp number onboarding and complete Embedded Signup lifecycle
- Production subscription billing, entitlement enforcement and dunning
- Durable job orchestration, retry/dead-letter operations and service observability
- End-to-end clinic pilot verification and care-plan reporting
- Arin RAG ingestion/evaluation and production model routing; RAGFlow is a Phase 5 evaluation candidate, not a current runtime dependency
- Instagram integration, n8n workflow deployment and non-clinic vertical packs
- OEM self-service administration, analytics, exports and support tooling
- Purpose-specific hardening for older private tables and remaining database advisor findings

## External launch blocker

- Meta App Review approval for `whatsapp_business_management` and `whatsapp_business_messaging` remains pending. Meta/WhatsApp connection code, configuration ID, redirect domain, webhooks, templates and the live support number stay frozen until this is resolved.

No claim in this file replaces an end-to-end production readiness review.
