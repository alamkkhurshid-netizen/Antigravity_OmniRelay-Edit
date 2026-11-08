# PostgreSQL Concurrency & Advisory Lock Verification

**Release Identifier:** `2026-10-10-cto-remediation-voice-billing-reliability`  
**Execution Date:** 2026-10-17  
**Test Harness:** `scripts/verification/verify-postgres-concurrency.mjs`  
**Target Database:** Disposable PostgreSQL (Isolated Container)  

---

## 1. Problem Statement

Financial ledger operations (`billing.record_and_deduct`) and WhatsApp webhook retries can arrive concurrently across multiple distributed Node.js/Edge worker instances. Without explicit row or transactional advisory locking at the database level:
- Parallel execution causes race conditions in balance deduction.
- Multiple duplicate ledger rows are inserted for the same `meta_message_id`.
- Tenant wallet balances are over-deducted.

---

## 2. Technical Remediation

1. **Transactional Advisory Lock:**
   - In migration `20261010000006_billing_concurrency_and_oauth_nonces.sql`, `billing.record_and_deduct` executes:
     ```sql
     PERFORM pg_advisory_xact_lock(hashtext('wallet_' || p_org_id::text));
     ```
   - Serializes all concurrent wallet operations for a given tenant at the PostgreSQL transaction level.
   - Automatically releases lock on transaction `COMMIT` or `ROLLBACK`.

2. **Idempotent Duplicate Resolution:**
   - On retry with identical `meta_message_id`, returns the original ledger transaction reference (`ledger_id`) and deduction amount.
   - Sets `already_deducted = true`, preventing secondary wallet debits.

3. **Strict Operational Environment Guards (`scripts/db-guard.mjs`):**
   - Concurrency tests require explicit:
     ```text
     TARGET_ENV=disposable
     ALLOW_DB_INTEGRATION_TESTS=true
     CONFIRM_CONCURRENCY_TEST=true
     ```
   - Mutation concurrency tests against staging or production environments are strictly and unconditionally blocked.

---

## 3. Live Concurrency Test Execution & Evidence

A test organization was seeded with an initial balance of ₹500.00 (`50,000 paise`). Twenty simultaneous asynchronous connections fired concurrent execution of `billing.record_and_deduct` for a 5-minute voice call (charge rate: ₹3.99/min = ₹19.95 / `1995 paise`).

### Measured Results

| Metric | Required / Expected | Actual Measured | Verdict |
|---|---|---|---|
| **Concurrent Transactions Fired** | 20 | 20 | **PASSED** |
| **Successful Database Responses** | 20 | 20 | **PASSED** |
| **Initial Deductions (`already_deducted: false`)** | Exactly 1 | 1 | **PASSED** |
| **Idempotent Duplicate Returns (`already_deducted: true`)** | Exactly 19 | 19 | **PASSED** |
| **Total Deducted Balance** | 1,995 paise (₹19.95) | 1,995 paise (₹19.95) | **PASSED** |
| **Final Tenant Wallet Balance** | 48,005 paise (₹480.05) | 48,005 paise (₹480.05) | **PASSED** |
| **Ledger Rows Created** | Exactly 1 | 1 | **PASSED** |
| **Ledger ID Consistency** | 100% Identical UUID | 100% Identical UUID | **PASSED** |
| **Database Cleanup in `finally` Block** | 100% Cleaned | Cleaned (0 records orphaned) | **PASSED** |

### Verification Proof

```text
[Postgres Concurrency Test] Target environment verified: disposable
[Postgres Concurrency Test] Initializing test org 8f1323f4-a4be-43ea-b7fa-3a5c67365756...
[Postgres Concurrency Test] Firing 20 simultaneous concurrent calls to billing.record_and_deduct...
[Postgres Concurrency Test] All 20 calls completed.
[Postgres Concurrency Test] PROVEN: Exactly 1 charge (₹19.95), exactly 1 ledger entry, 20 successful responses (19 marked already_deducted).
[Postgres Concurrency Test] Cleaned up test organization and ledger records.
```

Financial concurrency is proven against live PostgreSQL.
