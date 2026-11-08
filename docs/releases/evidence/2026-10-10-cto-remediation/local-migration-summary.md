# Local Migration Summary & Synthetic Upgrade Simulation

**Release Identifier:** `2026-10-10-cto-remediation-voice-billing-reliability`  
**Execution Date:** 2026-10-17  
**Total Canonical Migrations:** 216 migrations (from `00000000000000` to `20261010000007`)  
**Scope:** Local Disposable PostgreSQL & Local Synthetic Upgrade Database (Not Hosted Supabase Staging)

---

## 1. Migration Architecture & Rationale

Historical migration files (`20261006000000`, `20261006100000`, `20261007000000`, `20261009000000`) were authored before modern membership binding standards were finalized. Previously deployed databases recorded these versions in `supabase_migrations.schema_migrations` and will not rerun already-recorded migration files.

To avoid relying on modified historical files and to guarantee clean forward-only evolution:
- **Migration `20261010000007_reconcile_post_baseline_bindings.sql`** was introduced.
- Safely replaces obsolete table references (`public.organization_members`, `user_organizations`) with canonical `public.agents`.
- Re-binds RLS policies on `tenant_documents`, `document_chunks`, `meta_capi_config`, `retail_products`, and `capi_event_logs`.
- Recreates `voice_org_config_readonly` view using safe JSONB extra attributes from `public.organizations`.
- Re-binds RLS policies on `voice_call_logs` and `voice_agent_configs`.
- Repairs function search paths (`SET search_path = public, extensions`) and grants on `match_documents`.
- Utilizes `IF EXISTS` / `IF NOT EXISTS` for complete idempotency.

---

## 2. Local Fresh Installation Verification

Executed against isolated local disposable PostgreSQL container (`127.0.0.1:54323`):
- **Environment:** `TARGET_ENV=disposable`
- **Command:** `npm run db:fresh`
- **Baseline Execution:** Applied `00000000000000_initial_schema.sql` (194 baseline migrations incorporated).
- **Post-Baseline Migrations:** Applied 22 post-baseline migrations sequentially up to `20261010000007_reconcile_post_baseline_bindings.sql`.
- **Result:** **216 migrations applied successfully with 0 errors.**
- **Ledger Count:** Exactly 216 rows recorded in `supabase_migrations.schema_migrations`.

---

## 3. Local Synthetic Upgrade Simulation

Executed against a locally running synthetic upgrade database (`127.0.0.1:54324`):

> [!NOTE]
> **Synthetic Upgrade Clarification:**
> The upgrade database used for this verification contained one synthetic clinic (`Apex Health Clinic Staging`), one synthetic appointment, and one synthetic wallet. While this proves schema convergence and non-destructive column/policy migrations, it was a **synthetic upgrade simulation** and not an exported clone or snapshot of the deployed production database. Real hosted staging execution remains pending owner provisioning.

- **Environment:** `TARGET_ENV=staging` (local simulation)
- **Initial Migration State:** 215 migrations previously recorded in `supabase_migrations.schema_migrations`.
- **Initial Data State:**
  - Organization: `Apex Health Clinic Staging` (ID: `11111111-1111-1111-1111-111111111111`)
  - Appointment: Active synthetic doctor appointment record
  - Wallet: Balance of `10,000 paise` (₹100.00)
- **First Upgrade Execution:**
  - Detected 1 pending migration: `20261010000007_reconcile_post_baseline_bindings.sql`.
  - Applied forward migration cleanly in a single transaction.
  - Final migration count: 216.
- **Second Upgrade Execution (Idempotency Check):**
  - Detected 0 pending migrations.
  - Exactly 0 migrations applied.
  - Zero schema or data modifications.

---

## 4. Synthetic Data Preservation Audit

| Table / Entity | Pre-Upgrade State | Post-Upgrade State | Data Loss / Drift |
|---|---|---|---|
| `public.organizations` | 1 record (`Apex Health Clinic Staging`) | 1 record (`Apex Health Clinic Staging`) | **0% (Preserved)** |
| `public.appointments` | Active test booking intact | Active test booking intact | **0% (Preserved)** |
| `billing.tenant_wallets` | Balance: `10,000 paise` | Balance: `10,000 paise` | **0% (Preserved)** |
| `supabase_migrations` | 215 records | 216 records | **Clean +1 Ledger Entry** |

Zero data rows were dropped or altered during the synthetic upgrade simulation.
