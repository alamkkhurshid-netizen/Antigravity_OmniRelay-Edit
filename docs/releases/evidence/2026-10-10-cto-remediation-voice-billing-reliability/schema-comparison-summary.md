# Schema Parity & Comparison Summary

**Release Identifier:** `2026-10-10-cto-remediation-voice-billing-reliability`  
**Execution Date:** 2026-10-17  
**Comparison Tool:** `scripts/verification/compare-schemas.mjs`  
**Target Environments:**
- Fresh Installation: Disposable PostgreSQL Container (Port 54323)
- Upgraded Staging: Existing Populated Database with Forward Migration (Port 54324)

---

## 1. Deep Parity Comparison Matrix

Every database object across schemas `public`, `billing`, `private`, and `supabase_migrations` was extracted and normalized.

| Database Object Category | Fresh Database Count | Upgraded Database Count | Differences Detected | Parity Status |
|---|---|---|---|---|
| **Columns** | 1,867 | 1,867 | 0 | **100% PARITY (MATCH)** |
| **Constraints** | 937 | 937 | 0 | **100% PARITY (MATCH)** |
| **Indexes** | 446 | 446 | 0 | **100% PARITY (MATCH)** |
| **Functions & Signatures** | 355 | 355 | 0 | **100% PARITY (MATCH)** |
| **Triggers** | 155 | 155 | 0 | **100% PARITY (MATCH)** |
| **RLS Policies** | 277 | 277 | 0 | **100% PARITY (MATCH)** |
| **Extensions** | 11 | 11 | 0 | **100% PARITY (MATCH)** |
| **Grants & Privileges** | 3,649 | 3,649 | 0 | **100% PARITY (MATCH)** |

---

## 2. Normalization & Methodology

1. **Constraints Normalization:**
   - Constraints are indexed by schema, table, constraint type, and normalized SQL definition via `pg_get_constraintdef(c.oid)`.
   - Avoids ephemeral PostgreSQL OID naming differences for system not-null constraints.

2. **Trigger Manipulation Normalization:**
   - Multi-event triggers (e.g. `BEFORE INSERT OR UPDATE`) produce multiple rows in `information_schema.triggers`.
   - Normalized keys bind `trigger_schema`, `event_object_table`, `trigger_name`, `action_timing`, and `event_manipulation`.
   - Guarantees 100% deterministic matching independent of query result set ordering.

3. **RLS Policy Re-binding:**
   - Re-binding via `20261010000007_reconcile_post_baseline_bindings.sql` verified that both fresh installation and forward upgrade produce identical `USING` and `WITH CHECK` expressions bound to `public.agents`.

---

## 3. Tool Verification Output

```text
[Schema Dump] Dumping metadata for FRESH (disposable 54323)...
[Schema Dump] Dumping metadata for UPGRADED (staging 54324)...

================ SCHEMA COMPARISON SUMMARY ================
- Columns       : MATCH (100% PARITY) [Fresh: 1867, Upgraded: 1867]
- Constraints   : MATCH (100% PARITY) [Fresh: 937, Upgraded: 937]
- Indexes       : MATCH (100% PARITY) [Fresh: 446, Upgraded: 446]
- Functions     : MATCH (100% PARITY) [Fresh: 355, Upgraded: 355]
- Triggers      : MATCH (100% PARITY) [Fresh: 155, Upgraded: 155]
- RLS Policies  : MATCH (100% PARITY) [Fresh: 277, Upgraded: 277]
- Extensions    : MATCH (100% PARITY) [Fresh: 11, Upgraded: 11]
- Grants        : MATCH (100% PARITY) [Fresh: 3649, Upgraded: 3649]
===========================================================
```

Fresh and upgraded database schemas have converged completely.
