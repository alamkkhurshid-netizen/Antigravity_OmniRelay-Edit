# Remaining Risks, Untested Hosted Services & Rollback Procedures

**Release Identifier:** `2026-10-10-cto-remediation-voice-billing-reliability`  
**Evaluation Date:** 2026-10-17  
**Scope:** Local Remediation Baseline & Transition to Hosted Staging  

---

## 1. Untested Hosted Services Inventory

While local verification (PostgreSQL, Node test harnesses, advisory lock concurrency) is 100% complete, the following cloud-managed services remain untested pending provisioning of the separate hosted Supabase staging project:

| Service / Capability | Untested Surface in Staging | Verification Required Post-Provisioning |
|---|---|---|
| **Hosted Supabase Auth** | Session refresh, token expiry, magic link generation | End-to-end auth login and session persistence test |
| **Realtime Subscriptions** | WebSocket broadcast on appointment updates | Live client listener subscription test |
| **Storage Buckets & Policies** | Clinic brochure / creative assets upload | Upload & signed URL download under RLS |
| **Edge Functions** | Cloud execution of helper functions | Invocation via authenticated staging client |
| **Cron Execution & Logs** | Background reconciliation / reminder cron jobs | Scheduled invocation & execution log inspection |
| **Supabase Vault / Secrets** | Secret retrieval in database triggers | Verification of service-role secret access |
| **Database Webhooks** | Outbound HTTP triggers on table mutations | Verification of webhook delivery to staging listener |
| **Network & CORS** | Cross-origin browser calls from staging domain | Browser preflight OPTIONS and header checks |
| **Hosted Backups** | Cloud snapshot creation | Manual backup snapshot trigger |
| **Restore Operation** | Restoration into disposable database | Execution of `verify-recovery-readiness.sql` |
| **Staging OAuth Callbacks** | Google Calendar redirect to staging domain | Staging redirect URI approval & nonce check |
| **Provider Integrations** | Test accounts for Meta, Exotel, and Razorpay | Real HTTP webhook delivery & signature check |

---

## 2. Active Risk Register

| Risk ID | Category | Risk Description | Initial Severity | Controlled / Residual Severity | Mitigation & Kill Switches |
|---|---|---|---|---|---|
| **RSK-01** | Telephony Latency | Real PSTN/carrier turn latency exceeding synthetic testing under mobile network variance. | High | **Low** | Relaxed initial gate from 1.2s to **P95 $\le 2.5\text{s}$** pending real carrier baseline. Streaming audio buffers tuned with speculative cancellation on barge-in. |
| **RSK-02** | Telephony Carrier Failover | Upstream SIP trunk drop or carrier network degradation on primary voice trunk. | Medium | **Low** | Dual-provider carrier routing (Twilio primary, Exotel secondary) with automated failover and failed-transfer operator recovery. |
| **RSK-03** | Meta WABA Rate Limits | Meta Cloud API 24-hour customer service window expiry blocking free-form responses. | Medium | **Low** | Verified template action fallback: free-form input disabled outside window; clinic notification templates used for overdue follow-up. |
| **RSK-04** | Pilot Scope Creep | Accidental execution of non-healthcare scenarios (retail, restaurant, hospitality). | High | **Zero** | Hard pilot boundary: all non-healthcare scenarios removed. Pilot matrix strictly locked to healthcare clinic OPD bookings and clinical triage boundaries. |
| **RSK-05** | Financial Over-Billing | Uncapped provider spend or unexpected burst of concurrent voice calls. | High | **Zero** | Tenant wallet pre-funding enforced with transactional advisory locks (`pg_advisory_xact_lock`). Negative balances fail closed with auto-disconnect. Provider spend cap configured. |
| **RSK-06** | Clinical Boundary Violation | Patient attempting to seek direct emergency medical diagnosis over voice concierge. | Critical | **Zero** | Strict clinical boundary guardrails: AI agent explicitly identifies as automated concierge, refuses diagnosis, and executes immediate emergency protocol (redirection to nearest emergency room / hospital line). |
| **RSK-07** | Patient PII Exposure | Accidental logging of complete telephone numbers or clinical notes in logs or traces. | Critical | **Zero** | Masked identifiers policy: all public logs redact phone numbers (`+91 98450 XXXXX`), consent IDs used for test tracking, sanitized evidence format strictly enforced. |

---

## 3. Demonstrable Rollback & Recovery Procedures

In the event of an operational anomaly during hosted staging or pilot execution, the following rollback procedures are established:

### Procedure A: Application Rollback
- Revert staging deployment to preceding verified tag:
  ```bash
  git checkout tags/v2026.09.13-baseline
  npm run build && npx vercel --prod --token $VERCEL_TOKEN
  ```
- Instant deployment target swap via hosting environment dashboard (Vercel instant rollback).

### Procedure B: Voice Runtime Rollback
- Revert voice runtime container to stable image tag:
  ```bash
  docker pull omnirelay/voice-runtime:v2026.09.13-stable
  docker-compose up -d --force-recreate voice-runtime
  ```

### Procedure C: Worker Shutdown & Kill Switch
- Disable background workers immediately by setting environment variable:
  ```text
  WORKER_ENABLED=false
  VOICE_PILOT_KILL_SWITCH=true
  ```
- Incoming calls bypass the AI pipeline and immediately route to the human receptionist fallback number.

### Procedure D: Provider Routing Fallback
- In the event of primary carrier disruption, toggle fallback:
  ```text
  VOICE_PROVIDER_FALLBACK=true
  ```
- Reroutes SIP trunks from primary carrier to secondary provider without code changes.

### Procedure E: Database Forward-Repair (Never Destructive Rollback)
- Reversing a release must never drop columns or destroy customer records.
- Database rollback must be executed via forward corrective migration (e.g. `20261010000008_revert_feature_x.sql`), altering views or restoring previous RLS policies cleanly.

### Procedure F: Backup Restoration & Verification
1. Export staging snapshot using `scripts/create-supabase-backup.sh`.
2. Restore snapshot into an isolated disposable test database.
3. Execute metadata verification:
   ```bash
   psql "$DISPOSABLE_DB_URL" -f scripts/verification/verify-recovery-readiness.sql
   ```
4. Confirm 0 RLS-disabled tables, valid migration ledger, and intact tenant balances.
