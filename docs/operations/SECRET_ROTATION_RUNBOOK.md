# OmniRelay Production Secret Rotation Runbook (S2-10)

**Classification:** High Security Operations  
**Scope:** Production & Staging Environments  
**Frequency:** Routine (every 90 days), On-Demand (upon employee offboarding), Emergency (within 1 hour of potential compromise).

---

## 1. Inventory of Production Secrets

| Secret Identifier | Target Service | Usage Boundary | Exposure Risk |
|---|---|---|---|
| `SUPABASE_SECRET_KEY` | Supabase Postgres & Auth | Edge Functions & Server Admin RPCs | **Critical** (Bypasses RLS) |
| `SUPABASE_DB_URL` | Postgres Pooler | Direct Migrations / CI runners | **Critical** (Full schema control) |
| `META_ACCESS_TOKEN` | Meta Graph API | WhatsApp Concierge & Notifications | High (Direct tenant messaging) |
| `META_APP_SECRET` | Meta App Dashboard | Inbound Webhook HMAC verification | High (Webhook spoofing) |
| `META_WEBHOOK_VERIFY_TOKEN` | Meta Webhook Config | Initial handshake verification | Medium |
| `RAZORPAY_KEY_ID` & `RAZORPAY_KEY_SECRET` | Razorpay API | Checkout order creation & capture | High (Financial transaction authority) |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay Webhooks | Inbound payment signature verification | High (Payment state forgery) |
| `MEDICINE_IMPORT_SECRET` | Internal API | Bulk medicine catalog upload endpoint | Medium (Catalog tampering) |

---

## 2. Step-by-Step Rotation Procedures

### A. Supabase Service Role Key (`SUPABASE_SECRET_KEY`)
> [!CAUTION]
> Regenerating the service role key immediately invalidates the old key. Follow the zero-downtime dual-deployment window.

1. **Pre-requisite Check:** Ensure no active long-running migration or campaign broadcast is currently dispatching (`claim_due_care_reminder_runs`).
2. **Access Dashboard:** Log into Supabase Console -> Project Settings -> API -> Project API Keys.
3. **Stage New Environment Variables:**
   - Update Vercel / hosting environment:
     ```bash
     vercel env add SUPABASE_SECRET_KEY production
     ```
   - Update Supabase Edge Function secrets via CLI:
     ```bash
     npx supabase secrets set SUPABASE_SECRET_KEY="<new_key>"
     ```
4. **Trigger Deployment:** Re-deploy the Next.js web application and Edge functions so they initialize with the new secret.
5. **Revoke Old Secret:** In the Supabase Console, revoke the previous service role key.
6. **Verify Operation:**
   - Test an authenticated admin operation:
     ```bash
     curl -i -H "Authorization: Bearer <NEW_KEY>" https://<project>.supabase.co/rest/v1/saas_plans?select=*
     ```

---

### B. Meta WhatsApp System User Access Token (`META_ACCESS_TOKEN`)

1. **Access Meta Business Suite:** Business Settings -> System Users -> OmniRelay Dispatcher.
2. **Generate Replacement Token:**
   - Click **Generate New Token**.
   - Select the required permissions: `whatsapp_business_messaging`, `whatsapp_business_management`.
   - Set expiry to **Permanent (System User)**.
3. **Deploy Secret:**
   - Push updated secret to Supabase Vault and Edge Function config:
     ```bash
     npx supabase secrets set META_ACCESS_TOKEN="<new_meta_token>"
     ```
4. **Validation Test:**
   - Trigger the automated healthcheck or send a test template ping to the designated test sandbox line.
   - Verify 200 OK from `https://graph.facebook.com/v20.0/<PHONE_NUMBER_ID>/messages`.
5. **Revoke Old Token:** Back in Meta Business Suite, delete the previous system user token.

---

### C. Razorpay API Keys & Webhook Secret

1. **Access Razorpay Dashboard:** Settings -> API Keys.
2. **Generate New Key:** Click **Regenerate Key**.
   - Razorpay provides a grace window where both the old and new keys remain valid for 24 hours.
3. **Update Hosting Environment:**
   ```bash
   vercel env add RAZORPAY_KEY_ID production
   vercel env add RAZORPAY_KEY_SECRET production
   ```
4. **Webhook Secret Rotation:**
   - Navigate to Settings -> Webhooks.
   - Edit the active webhook URL for OmniRelay (`https://.../api/billing/webhook`).
   - Regenerate the secret key.
   - Immediately update `RAZORPAY_WEBHOOK_SECRET` in environment variables.
5. **Verification Test:**
   - Run the synthetic ₹1 test transaction test suite:
     ```bash
     node --test tests/deposit-acceptance-synthetic-payment.test.mjs
     ```

---

### D. Internal Medicine Import Secret (`MEDICINE_IMPORT_SECRET`)

1. **Generate High-Entropy Secret:**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. **Update Environment:**
   Update `MEDICINE_IMPORT_SECRET` in both production server config and internal deployment runner.
3. **Verify Header Validation:**
   ```bash
   curl -X POST https://<domain>/api/internal/medicine-import \
     -H "x-import-secret: <NEW_SECRET>" \
     -H "Content-Type: application/json" \
     -d '{"medicines": []}'
   ```
   Confirm response is HTTP 200 / valid schema and not HTTP 401 Unauthorized.

---

## 3. Emergency Incident Response (Compromise Runbook)

If any secret is detected in logs, git history, or exposed externally:

1. **Freeze Execution:** Pause the worker dispatch loop using the master killswitch:
   ```sql
   UPDATE app_system_switches SET switch_value = 'disabled' WHERE switch_key = 'WORKER_ENABLED';
   ```
2. **Rotate Affected Secret Immediately:** Follow procedures in Section 2 with **Zero Grace Period**.
3. **Revoke Active Sessions:** For user credentials or Supabase Auth leakage, terminate sessions:
   ```sql
   SELECT auth.revoke_all_refresh_tokens();
   ```
4. **Audit Security Log:**
   Inspect `app_audit_logs` and Postgres access logs for unexpected external IP addresses or unusual volume:
   ```sql
   SELECT * FROM app_audit_logs 
   WHERE created_at >= NOW() - INTERVAL '24 hours' 
   ORDER BY created_at DESC LIMIT 100;
   ```
5. **Re-arm Killswitch:** After verifying clean logs and new credentials, re-enable `WORKER_ENABLED`.
