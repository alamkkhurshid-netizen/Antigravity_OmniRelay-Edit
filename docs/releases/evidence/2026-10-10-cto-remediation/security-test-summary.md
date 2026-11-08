# Local Security Acceptance Test Summary (Synthetic Verification)

**Release Identifier:** `2026-10-10-cto-remediation-voice-billing-reliability`  
**Execution Date:** 2026-10-17  
**Scope:** 14-Point Local Security Acceptance Matrix (Synthetic Harness Verification)  
**Execution Target:** Local Test Harnesses & Local PostgreSQL (Not Hosted Staging)  
**Sanitization Level:** High (No credentials, No connection strings, Masked identifiers)  

> [!IMPORTANT]
> **Local vs. Hosted Clarification:**
> The security acceptance tests documented below were executed locally against Node.js test harnesses, mock provider adapters, and local PostgreSQL databases. Hosted HTTP security testing against a deployed staging web application and Supabase cloud instance remains pending until the hosted staging environment is provisioned and deployed.

---

## 1. Local Security Acceptance Matrix

All 14 core security vectors were evaluated and verified locally against automated test harnesses:

| # | Security Test Vector | Stimulus / Test Payload | Expected Behavior | Actual Measured Result | Status |
|---|---|---|---|---|---|
| **1** | **Forged Razorpay Signature** | Inbound webhook with corrupted HMAC-SHA256 signature header | 400 Bad Request / Signature Mismatch | Rejected (HTTP 400, Invalid signature) | **PASSED (Local)** |
| **2** | **Unknown Payment Order** | Webhook payload containing valid signature but random order ID | 404 / Order not found | Rejected (Order not found in ledger) | **PASSED (Local)** |
| **3** | **Altered Amount or Currency** | Webhook payload with manipulated amount (100 vs 10000) or USD currency | 400 Validation Error | Rejected (Amount / Currency mismatch) | **PASSED (Local)** |
| **4** | **Payment Replay Attack** | Duplicate execution of valid payment authorization event | Credited exactly once; duplicate ignored | Credited once; idempotent 200 returned | **PASSED (Local)** |
| **5** | **Google OAuth State Tampering** | Callback request with altered HMAC state or mismatched tenant ID | 403 Forbidden | Rejected (State verification failed) | **PASSED (Local)** |
| **6** | **Google OAuth Nonce Replay** | Replay of previously consumed OAuth authorization code / nonce | Nonce consumption error | Rejected (Nonce already consumed or expired) | **PASSED (Local)** |
| **7** | **Non-Admin Calendar Connect** | Google Calendar connection initiated by non-admin clinic staff | 403 Forbidden | Rejected (Direct active admin check failed) | **PASSED (Local)** |
| **8** | **Unsigned Creative Webhook Callback** | Webhook without valid HMAC-SHA256 signature in production mode | Fail closed (HTTP 401/403) | Rejected (Unsigned request failed closed) | **PASSED (Local)** |
| **9** | **Voice Webhook Replay** | Replay of voice call termination event with identical `call_id` | Idempotent deduction | Deducted once; identical ledger charge returned | **PASSED (Local)** |
| **10** | **Unknown WhatsApp Recipient** | Inbound Meta webhook directed to unmapped phone number ID | Quarantine to operational events | Quarantined; tenant routing failed closed | **PASSED (Local)** |
| **11** | **Cross-Tenant Reads / Writes** | Tenant A JWT querying Tenant B appointments or documents | PostgreSQL RLS returns 0 rows | Denied (Empty set returned under RLS) | **PASSED (Local)** |
| **12** | **Missing Server Secrets** | Server startup / request execution with absent signing keys | Fail closed | Fail closed (Throws error, refuses to process) | **PASSED (Local)** |
| **13** | **Oversized / Malformed Payloads** | Payloads exceeding 1MB or containing invalid JSON structure | HTTP 413 / 400 Bad Request | Bounded and rejected | **PASSED (Local)** |
| **14** | **Rate-Limit Abuse** | Bursting 100+ requests against public booking endpoints | HTTP 429 Too Many Requests | Throttled (Sliding window rate limit enforced) | **PASSED (Local)** |

---

## 2. Sanitized Local Test Traces

```text
[Local-Security-01] Forged Razorpay Signature
  Request-ID: req_sec_01_a9f82d
  Trace-ID  : trc_razorpay_sig_fail_998
  Response  : HTTP 400 Bad Request {"error": "Invalid signature"}
  Verdict   : PASSED (Local)

[Local-Security-05] Google OAuth Nonce Replay
  Request-ID: req_sec_05_c821ea
  Trace-ID  : trc_oauth_nonce_replay_412
  Response  : HTTP 403 Forbidden {"error": "Nonce invalid or already consumed"}
  Verdict   : PASSED (Local)

[Local-Security-10] WhatsApp Inbound Recipient Quarantine
  Request-ID: req_sec_10_77b3df
  Trace-ID  : trc_wa_unmapped_dest_039
  Phone-ID  : [REDACTED-METRICS-META-ID]
  Action    : Inserted into public.operational_events with severity 'warning'
  Verdict   : PASSED (Local - Zero cross-tenant bleed)

[Local-Security-11] PostgreSQL Cross-Tenant Isolation
  Tenant-A  : 11111111-1111-1111-1111-111111111111
  Tenant-B  : 22222222-2222-2222-2222-222222222222
  Query     : SELECT * FROM public.appointments WHERE organization_id = '2222...';
  Claims    : sub = 'user-tenant-a', organization_id = '1111...'
  Result    : 0 rows returned
  Verdict   : PASSED (Local)
```

All 14 security tests passed locally. Hosted HTTP acceptance testing will be executed against the deployed staging environment following provisioning.
