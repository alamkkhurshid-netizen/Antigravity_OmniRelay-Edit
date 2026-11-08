# CTO Closure: Fail-Closed Nonces, Durable Rate Limiting, Async Feature Flags & Tenant Isolation

**Date:** 18 October 2026  
**Status:** Completed and verified against disposable PostgreSQL (17.6.1) and full test suite.

## Summary of Remediated Findings

1. **Fail-Closed Nonce Consumption:**
   - RPC `consume_voice_request_nonce` requires `data === true`.
   - `data === false` returns HTTP 409 Conflict (atomic replay detection).
   - Any database/RPC exception returns HTTP 503 Service Unavailable (fail-closed).
   - In-memory local fallback permitted ONLY under explicit `NODE_ENV === "test"` (prohibited in staging/production).

2. **Asynchronous PostgreSQL-Backed Feature Evaluation:**
   - Implemented `isFeatureEnabledAsync(flagKey, orgId)` querying `organizations.extra.feature_flags` authoritatively.
   - Wired to every voice route (`/api/voice/book`, `/api/voice/logs`) and retail route (`/api/retail/order-lookup`, `/api/retail/catalog`).

3. **Removed Hardcoded Retail Order-Token Secret:**
   - Production/staging fails immediately if `ORDER_LOOKUP_SECRET` or `INTERNAL_SERVICE_KEY` is absent.
   - Zero fallback secret permitted in production.

4. **PostgreSQL-Backed Durable Rate Limiter:**
   - Replaced process-local sliding window with atomic stored procedure `consume_durable_rate_limit(p_key, p_limit, p_window_seconds)`.
   - Durable across multiple serverless/container instances.

5. **Retention Purge Scheduler:**
   - Registered `/api/cron/voice-retention` on daily schedule in `vercel.json`.
   - Mandatory `CRON_SECRET` validation (rejects execution if missing or invalid).

6. **Tenant-Bound Voice Booking References:**
   - Doctor/resource, business location, service, and existing patient lookups strictly bounded by `.eq("organization_id", org_id)`.
   - Call log update bounded by `.eq("org_id", org_id)`.

7. **Append-Only Transcript Access Audit Ledger:**
   - `voice_transcript_access_audits` records immutable audit events (actor, IP, user-agent, timestamp) for every transcript read.

8. **Disposable PostgreSQL Verification:**
   - 20 duplicate nonce requests: exactly 1 TRUE, 19 FALSE.
   - 20 concurrent booking requests: exactly 1 committed, 19 code 23505 unique violations.
   - Database outage fail-closed test: verified 503 response.
   - Retention purge execution: verified deletion of expired nonces and scrubbing of expired call logs.
   - Cross-tenant rejection: verified 0 rows returned across tenant boundaries.
