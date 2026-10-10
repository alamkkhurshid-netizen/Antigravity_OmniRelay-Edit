# OmniRelay Database Migration & Release Strategy

**Document Version:** 1.0.0  
**Date:** 10 October 2026  
**Audience:** Platform Engineering, CTO, Release Operators

---

## 1. Context: Canonical Database Schema vs. Migration Ledger

OmniRelay maintains two complementary database artifacts:

1. **The Consolidated Baseline (`00000000000000_initial_schema.sql`):**
   - Represents the frozen foundational snapshot of the database (auth, organizations, appointments, clinical records, action centre, operational events).
   - Used for rapid bootstrapping of disposable test fixtures, local development, and clean staging environments.

2. **The Incremental Migration Ledger (`20260808...` to `20261010...`):**
   - Contains the chronological evolution of specific features (telephony dual provisioning, voice metering, rate card versioning, WhatsApp recipient routing, and inbound message durability).
   - Each migration is idempotent (`IF NOT EXISTS`, conditional column additions, and explicit privilege revocations).

---

## 2. Deployment Paths

### Path A: Fresh Database Provisioning (Clean Staging / Local Docker)
To provision a brand-new staging or local PostgreSQL database from scratch:
```bash
# 1. Apply baseline initial schema
supabase db push --include-all
# OR via psql:
psql -d $DATABASE_URL -f supabase/migrations/00000000000000_initial_schema.sql

# 2. Apply active post-consolidation feature migrations
for file in supabase/migrations/202610*.sql; do
  psql -d $DATABASE_URL -f "$file"
done
```

### Path B: Production Upgrade Path
For upgrading existing production or staging databases:
```bash
# Apply only pending unapplied migrations
supabase db push
```

Key recent migrations:
- `20261010000003_multi_vertical_voice_and_rate_card.sql`: Rate card schema and ₹3.99/min voice pricing.
- `20261010000004_billing_security_and_rate_card_repair.sql`: `updated_at` column fix, dropped 5-arg overload, row locking, revoked `PUBLIC` execution from `billing.record_and_deduct`.
- `20261010000005_durable_whatsapp_inbound_lifecycle.sql`: `whatsapp_inbound_messages` table with unique constraint on `provider_message_id` and durable status lifecycle (`received` → `processing` → `completed` / `failed`).

---

## 3. RLS & Security Verification Checklist

Every migration must pass the following security checks:
1. **Row Level Security (RLS):**
   - Tables containing tenant data must have `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.
   - Tenant isolation policies must use `private.is_organization_member(organization_id, 'admin')` or equivalent.
2. **RPC Function Privileges:**
   - Any `SECURITY DEFINER` function must explicitly set `SET search_path = ''`.
   - Privileged billing functions (e.g. `billing.record_and_deduct`, `billing.credit_wallet`) must have execution revoked from `PUBLIC`, `anon`, and `authenticated`. Callable solely by `service_role`.
3. **Reproducibility Guarantee:**
   - All migrations referenced by automated tests in `tests/*.test.mjs` must be tracked in Git. No test may depend on untracked working tree artifacts.
