# OmniRelay Staging Database & Supabase Branching Architecture

**Status:** Production Standard  
**Document ID:** S9-06  
**Scope:** Supabase branch database provisioning, migration synchronization, and test data seeding for non-production environments.

---

## 1. Architecture Overview

To ensure zero risk to production data and strict verification of database migrations, OmniRelay uses Supabase database branching for staging and preview deployments.

```
                    ┌────────────────────────────┐
                    │    Main Git Branch         │
                    │   (Production Database)    │
                    └──────────────┬─────────────┘
                                   │
              Branching / Migration Synchronization
                                   │
                    ┌──────────────▼─────────────┐
                    │   Staging Branch Database  │
                    │    (db.staging.supabase)   │
                    └──────────────┬─────────────┘
                                   │
                   ┌───────────────┴───────────────┐
                   ▼                               ▼
       ┌───────────────────────┐       ┌───────────────────────┐
       │   Vercel Preview PRs  │       │   Automated CI Tests  │
       └───────────────────────┘       └───────────────────────┘
```

---

## 2. Environment Variables

| Variable | Staging Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<staging-project-ref>.supabase.co` | Staging REST & Auth URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI...` | Public client key |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI...` | Backend service key |
| `SUPABASE_DB_URL` | `postgresql://postgres:<pass>@db.<staging-ref>.supabase.co:5432/postgres` | Direct connection for migrations |

---

## 3. Creating & Managing Staging Branches

### 3.1 Via Supabase CLI
```bash
# 1. Login to Supabase CLI
npx supabase login

# 2. Link repository to the parent project
npx supabase link --project-ref <prod-project-ref>

# 3. Create or switch to staging branch database
npx supabase branches create staging
```

### 3.2 Running Migrations Against Staging
```bash
# Run migration verification gate
npm run validate:migrations

# Apply migrations to staging branch
node scripts/db-migration-runner.mjs --mode=upgrade
```

---

## 4. Seeding Staging Test Fixtures

Run the automated staging setup script:
```bash
node scripts/setup-staging-db.mjs
```

This seeds:
1. **Test Organization:** "Apex Care Clinic (Staging)" (`org_staging_apex_01`)
2. **Doctor Resources:** Dr. Sarah Jenkins (Cardiology), Dr. Rahul Verma (General Medicine)
3. **Chambers / Slots:** Daytime 30-minute intervals
4. **Sample Retail Catalog:** 5 sample products with variant matrices
5. **Simulated Usage Events:** WhatsApp & Voice telemetry for testing dashboards
