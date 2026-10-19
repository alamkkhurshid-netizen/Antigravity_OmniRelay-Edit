# OmniRelay Inherited Schema & Migration Domain Map (S2-05)

**Audited:** 2026-10-18  
**Scope:** 209 Postgres SQL Migrations (`supabase/migrations/`)  
**Security Model:** Multi-Tenant Row Level Security (RLS) with Tenant Isolation (`organization_id`).

---

## 1. Domain Clusters & Table Ownership

### Cluster 1: Core Tenant & Identity Infrastructure
* **Migrations:** `00000000000000_initial_schema.sql`, `20260726162000_mvp_tenant_foundation.sql`, `20260726173000_workspace_foundation.sql`, `20260918214500_enforce_single_clinic_profile_lock.sql`
* **Tables Owned:**
  * `organisations` — Master tenant identity, subscription status, business category (`Healthcare`, `Retail`).
  * `agents` — Staff members and AI personas bound to a tenant.
  * `workspace_invitations` — Pending team invite tokens.
* **RLS Model:** Isolated by `organization_id = auth.uid()` or explicit agent membership lookup.

### Cluster 2: Medical Appointments & Clinical Care Engine
* **Migrations:** `20260726162756_appointment_engine.sql`, `20260726181500_doctor_chamber_scheduling.sql`, `20260729112000_clinic_crm_encounters.sql`, `20260729130000_clinical_documents_prescriptions.sql`, `20260808113000_patient_consent_ledger.sql`, `20260808133000_patient_care_tasks.sql`, `20260808223000_atomic_prescription_issuance.sql`, `20260808230000_structured_patient_care_plans.sql`
* **Tables Owned:**
  * `appointments` — OPD bookings, chambers, consultation slots, patient references.
  * `patients` — Patient CRM records, medical identifiers, consent timestamps.
  * `patient_guardians` — Guardian / dependent linkings for pediatric/elderly care.
  * `patient_encounters` — Clinical consultation logs and physical visit histories.
  * `prescriptions` — Rx records with atomic issuance security boundaries.
  * `patient_care_tasks` & `patient_care_plans` — Chronic care task lists, review schedules, and medication dose tracking.
  * `patient_consents` — Append-only immutable consent ledger for WhatsApp communications.
  * `medicine_catalog` — Fast search index of branded and generic drugs.
* **RLS Model:** Strict organization-scoped reads and mutations; patients access records exclusively through single-use HttpOnly portal tokens or verified WhatsApp OTP.

### Cluster 3: WhatsApp Concierge & Messaging Delivery
* **Migrations:** `20260728101500_whatsapp_delivery_foundation.sql`, `20260801103000_whatsapp_booking_concierge.sql`, `20260811131455_booking_whatsapp_otp_foundation.sql`, `20260815113000_whatsapp_concierge_dispatch_recovery.sql`, `20261010000005_durable_whatsapp_inbound_lifecycle.sql`
* **Tables Owned:**
  * `whatsapp_connections` — Business Account IDs, phone number IDs, credentials (sealed via Vault).
  * `whatsapp_inbound_queue` — Durable message intake with deduplication and state recovery.
  * `whatsapp_templates` — Synced Meta template registry and language parameters.
  * `conversations` & `messages` — Chat message history and interactive reply states.
* **RLS Model:** Service-role write access; tenant-scoped read access for operators and staff.

### Cluster 4: Care & Marketing Campaign Broadcast
* **Migrations:** `20260729184500_care_campaigns.sql`, `20260730003000_campaign_delivery_operations.sql`, `20260912044009_doctor_specific_emergency_notices.sql`
* **Tables Owned:**
  * `campaigns` — Care updates, festive broadcasts, and doctor-scoped emergency notices.
  * `campaign_audiences` & `campaign_dispatches` — Delivery logs, read rates, failures, exclusions.
  * `campaign_opt_outs` — Global and category-specific patient opt-out registry.
* **RLS Model:** Tenant-scoped management; emergency notices require strict single-doctor resource matching.

### Cluster 5: Billing, Wallets & Rate Cards
* **Migrations:** `20260801203000_saas_billing_conversion.sql`, `20260912230000_operational_wallet_shadow_foundation.sql`, `20260913010000_shadow_billing_controls_foundation.sql`, `20261008000000_billing_wallet_schema.sql`, `20261010000004_billing_security_and_rate_card_repair.sql`, `20261010000006_billing_concurrency_and_oauth_nonces.sql`
* **Tables Owned:**
  * `saas_plans` — Available subscription tiers (Free, Standard, Premium AI).
  * `billing_orders` — Razorpay payment orders and verification checksums.
  * `billing_wallets` & `wallet_ledger` — Prepaid operational wallet balances for messaging and telephony.
  * `whatsapp_rate_cards` — Base per-conversation Meta fees and platform markup.
* **RLS Model:** Mutation strictly locked to `service_role` and owner/admin callers; immutable ledger logs.

### Cluster 6: Retail Module (Multi-Tenant Scaffold)
* **Migrations:** `20260919000000_unlock_retail_category.sql` through `20260919040000_retail_parity_features.sql`, `20261006100000_retail_module_foundation.sql`
* **Tables Owned:**
  * `retail_products` — Product SKUs, variants, prices, inventory counters.
  * `retail_catalogs` — Meta Commerce Catalog synchronization endpoints.
  * `retail_orders` — Cart and order checkout tracking for retail tenants.

### Cluster 7: Voice AI & Telephony
* **Migrations:** `20261007000000_voice_ai_schema.sql`, `20261009000000_voice_agent_configs.sql`, `20261010000000_telephony_dual_provision.sql`, `20261010000001_voice_agents_eq_and_sales.sql`
* **Tables Owned:**
  * `voice_agents` — Voice prompt parameters, tone EQ styles, selected language personas.
  * `telephony_provisions` — DID phone numbers (Twilio / Exotel / Plivo carrier bindings).
  * `voice_call_logs` — Call duration, latency, audio transcripts, recording URLs.

### Cluster 8: Operations, Alerts & System Killswitches
* **Migrations:** `20260808190000_production_operations_hardening.sql`, `20260823220000_priority_alert_escalation.sql`, `20260824133836_device_push_subscriptions.sql`
* **Tables Owned:**
  * `app_system_switches` — Master and granular worker killswitches (`WORKER_ENABLED`, etc.).
  * `app_notifications` — Priority action alerts and escalation levels.
  * `app_audit_logs` — Security and privilege changes.
  * `device_push_subscriptions` — WebPush VAPID subscriptions for clinic staff devices.
