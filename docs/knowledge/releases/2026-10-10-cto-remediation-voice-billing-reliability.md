# CTO Remediation: Security, Voice Metering, Tenant Routing & Runtime Reliability

**Date:** 10 October 2026  
**Status:** Remediated and verified against commit d1936c8 and production readiness criteria.

## Remediated P0/P1 Blockers

1. **Voice Metering Authentication & Integrity:**
   - HMAC-SHA256 signature and API credential authentication enforced on `POST /api/billing/voice-metering`.
   - Call parameters (organization, duration, status) are derived strictly from the trusted database record (`submittedId`), preventing caller tampering.
   - Deduction engine applies 60-second billing pulse with ₹3.99/min commercial pricing (0% markup on selling price).

2. **Strict WhatsApp Recipient Routing:**
   - Inbound webhook resolves tenant exclusively by recipient Meta `phone_number_id`.
   - Global contact-phone and first-connection fallbacks removed.
   - Unmapped or ambiguous numbers are quarantined to `operational_events` and fail closed.

3. **Database Migration & RPC Security:**
   - Repaired `billing.meta_rate_card` migration (`updated_at` column and partial index match).
   - Dropped insecure 5-argument `record_and_deduct` overload.
   - 6-argument `billing.record_and_deduct` is idempotent, returns original ledger charges on retries, and execution is revoked from `PUBLIC`, `anon`, and `authenticated`.

4. **Runtime Health & Verification:**
   - Separated `/api/voice/health` into liveness vs readiness probes.
   - Production environment requires configured engine URL.
   - Evidence-based dashboard status checks for DPDP disclosure and guardrails.
   - Strict CI pipeline with zero bypassed test suites.

5. **Google OAuth Database Nonce & Direct Admin Check:**
   - Persistent `oauth_nonces` table with expiration and single-use guarantee.
   - Atomic `consume_oauth_nonce` RPC with zero in-memory fallback.
   - Direct active admin/owner verification on `agents` table.

6. **Razorpay Financial Hardening:**
   - Top-up fails closed on ledger registration error.
   - Webhook enforces exact amount matching and INR currency validation.
   - Mock payments strictly restricted behind `ALLOW_MOCK_PAYMENTS`.

7. **PostgreSQL Concurrency Advisory Locking:**
   - `pg_advisory_xact_lock` on `billing.record_and_deduct` serializes concurrent transactions.

8. **WhatsApp Inbound Lifecycle & Atomic Retry Leasing:**
   - Missing Hermes runtime marked `failed` rather than completed.
   - Atomic conditional lease prevents worker collision.
