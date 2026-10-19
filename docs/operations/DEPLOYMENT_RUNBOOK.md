# OmniRelay Production Deployment Runbook

**Document ID:** S9-11  
**Version:** 1.0.0  
**Target Environment:** Production (`app.omnirelay.in` / Vercel Edge + Supabase Pro + OCI Telephony)  
**Audience:** Site Reliability Engineers, Lead DevOps, CTO

---

## 1. Pre-Deployment Verification Checklist

Execute these checks locally or in CI before promoting any release to production:

```bash
# 1. Verify zero environment files or API credentials staged in git
npm run check:env

# 2. Run TypeScript compilation with max heap
npm run typecheck

# 3. Verify ESLint ratchet (must pass with 0 errors, <= 188 warnings)
npm run lint

# 4. Verify all database migrations are syntactically valid & non-destructive
npm run validate:migrations

# 5. Run full test suite (420+ automated unit & integration tests)
node --test tests/*.test.mjs

# 6. Verify production build bundle
npm run build
```

---

## 2. Production Deployment Sequence

### Step 1: Database Migration Execution
Apply verified schema migrations to the production Supabase database:
```bash
# Ensure SUPABASE_DB_URL is pointing to production instance
node scripts/db-migration-runner.mjs --mode=upgrade
```
*Verify:* Check Supabase Dashboard > Database > Migrations table to ensure all versions match.

### Step 2: Deploy Production Vercel Build
Promote the pre-validated artifact to the production Vercel domain:
```bash
npx vercel --prod --token $VERCEL_TOKEN
```
*Verify:* Inspect deployment logs on Vercel Dashboard for green completion status.

### Step 3: Telephony & Voice AI Worker Verification
If voice AI changes were made:
```bash
# Verify health of the Exotel telephony bridge
curl -f https://app.omnirelay.in/api/voice/health
```

---

## 3. Post-Deployment Smoke Verification

Perform these live smoke checks within 5 minutes of deployment:

| Subsystem | Verification Action | Expected Result |
|---|---|---|
| **Root Health** | `GET https://app.omnirelay.in/api/health` | HTTP 200 with `status: "healthy"` |
| **Authentication** | Navigate to `/login` | Login page loads without console errors |
| **Dashboard** | Log into `/app` | Appointments, KPI cards, and sidebar render |
| **WhatsApp Webhook** | Send test inbound WhatsApp message | Message queued in `whatsapp_inbound_queue` |
| **Storefront** | Open `/{workspace}/store` | Branded catalog and items load |
| **Voice Gateway** | `GET /api/voice/health` | Telephony bridge returns HTTP 200 |

---

## 4. Rollback & Emergency Procedures

If any critical failure occurs during deployment (HTTP 5xx spikes, database errors, webhook drop):

### 4.1 Instant Vercel Rollback (< 60 seconds)
```bash
# Revert to previous production deployment ID immediately
npx vercel rollback <previous-deployment-id> --token $VERCEL_TOKEN
```
Alternatively, in Vercel Dashboard: Project > Deployments > Select previous green deployment > Click "Promote to Production".

### 4.2 Emergency Kill Switches (Feature Flags)
If a specific new feature is causing issues without needing full codebase rollback:
- **Disable Voice Receptionist:** Set `voice_agent_enabled = false` in `/api/admin/feature-flags`
- **Disable WhatsApp Automation:** Set `automation_enabled = false` in runtime controls
- **Disable Public Storefront:** Set `whatsapp_catalog_enabled = false`

### 4.3 Database Emergency Rollback
If a schema change failed or locked tables:
1. In Supabase Dashboard > Database > Backups, select Point-In-Time-Recovery (PITR).
2. Restore to timestamp immediately prior to migration run.
3. Refer to [`docs/operations/BACKUP_RESTORE_RUNBOOK.md`](file:///c:/Users/khurs/OneDrive/Desktop/Antigravity_Omnirelay/Omnirelay-main/docs/operations/BACKUP_RESTORE_RUNBOOK.md) for full data restoration steps.

---

## 5. Escalation Contacts

- **CTO / Infrastructure Lead:** Escalation for database locks or Vercel downtime.
- **Telephony Provider (Exotel):** Support ticket for trunk line or SIP failures.
- **Meta Cloud API Support:** For webhook delivery suspension or template approval blocks.
