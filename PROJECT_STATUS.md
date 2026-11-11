# OmniRelay Project Status

**Updated:** 11 November 2026  
**Status:** CONDITIONAL HOLD — Pilot Gate Blocked Pending Verification Integrity  
**Audit Baseline:** Independent CTO Re-Audit (Commit `cd897ac` / `99a212f`)  
**Production URL:** `https://omnirelay-main.vercel.app`  
**Branch:** `main` (synchronized with `origin2/main`)  
**Detailed Features Specification:** [docs/PRODUCT_FEATURES.md](docs/PRODUCT_FEATURES.md)  

---

## 1. Security Incident & Remediation Ledger (11 Nov 2026)

Following an independent technical due-diligence review on 11 November 2026, the platform was placed on immediate **HOLD** to address three critical exposure paths. Emergency remediations were deployed and verified live in production (upgraded to **CONDITIONAL HOLD**):

| Vulnerability ID | Description | Severity | Remediated In | Live Production Verification |
|---|---|:---:|:---:|:---:|
| **CRITICAL-1** | Unauthenticated iCal feeds (`feed.ics`) serving patient names, phone numbers, and notes | Critical | `cd897ac` | Verified: `404 -> 401 Unauthorized`; RLS client enforced; PHI stripped; `private, no-store` headers |
| **CRITICAL-2** | Script injection / arbitrary code execution in `super-cto-deploy.yml` workflow | Critical | `cd897ac` | Verified: Workflow deleted entirely from repository |
| **H-4** | Unauthenticated `/api/ingestion/worker` route writing mock pricing table & consuming Gemini tokens | High | `cd897ac` | Verified: Endpoint decommissioned; returns `HTTP 410 Gone` |
| **H-7** | `/api/retail/capi` accepted untrusted `organization_id` in request body | High | `cd897ac` | Verified: Returns `401 Unauthorized`; tenancy strictly derived from authenticated session |
| **H-5** | `xlsx` package CVE-2023-30533 (prototype pollution) and CVE-2024-22363 (ReDoS) | High | `HEAD` | Verified: Upgraded to `xlsx@0.20.3` via SheetJS CDN tarball with 2MB upload limit |
| **NEW-12** | Missing `public.is_organization_member` wrapper causing `PGRST202` on 5 RPC call sites | High | `HEAD` | Verified: Added migration `20261111180000_expose_public_is_organization_member.sql`; error handling added |

---

## 2. Gate to Real-Patient Pilot (Remaining Action Items)

Under the CTO directive, **no live patient data will be onboarded** until the verification layer is rebuilt:

1. **Test Verification Integrity (CRITICAL-3):** Replace source-text grep assertions (`assert.match` on `readFileSync`) with true behavioural tests executed against a disposable PostgreSQL test database.
2. **Real Concurrency Testing:** Replace the JavaScript promise-mutex simulation in `scripts/run-load-tests.mjs` with real concurrent transaction testing against PostgreSQL.
3. **Transactional Migration Gate:** Upgrade `scripts/ci-validate-migrations.mjs` to execute migrations against a throwaway Postgres container before PR merges.
4. **Production Reconciliation:** Complete full inventory reconciliation between local repository migrations and live Supabase edge functions.

---

## 3. Core Platform Capabilities & Architecture

### 1.1 Core Platform & Operations
- **Design System & Components:** Unified shadcn-based design system, clean Tailwind CSS tokens, decomposed modular components.
- **Tenant Isolation & Security:** 100% PostgreSQL Row Level Security (RLS), deny-by-default on private tables, secure session tokens, zero credential leaks checked via `npm run check:env`.
- **Onboarding Wizard & Knowledge Base:** 5-step guided onboarding wizard, RAG vector embeddings, self-service knowledge base with retrieval citations.
- **OEM / Operator Panel:** Complete control plane for platform operators, multi-tenant workspace management, subscription oversight, and tenant analytics export.

### 1.2 Multi-Vertical Business Modules
- **Healthcare / Clinic CRM:** Patient timeline, appointments, token queue management, digital doctor prescriptions, 24h & 2h automated WhatsApp reminders, care plans, and adherence tracking.
- **Retail Vertical Module:** Full product catalog with variant matrices, automated inventory deduction, interactive WhatsApp storefront (`/{workspace}/store`), abandoned cart recovery engine, coupons, and tiered customer loyalty rewards.
- **Voice AI Telephony Receptionist:** Live on Exotel Virtual DID via OCI-hosted microservice, Deepgram STT, Groq LPU, and Cartesia Sonic TTS. Supports doctor availability lookups, real-time phone bookings with `source: "Voice"` tag, call logging, and human receptionist transfer escalation.

### 1.3 Billing & Revenue Infrastructure
- **Live Billing System:** Razorpay & Stripe integration, prepaid wallet ledger with automatic meter deductions for WhatsApp messages and Voice minutes.
- **SaaS Subscription Tiers:** Starter, Growth, and Enterprise subscription plans with automated dunning and usage tracking.

### 1.4 Analytics, DevOps & Automation
- **Executive Analytics Dashboard:** 6 core KPI cards (Doctor Utilisation, Booking Funnel, No-Show Rate, Average Wait Times, Staff Hours Saved, and Follow-Up Revenue).
- **WhatsApp Real-Time Telemetry:** Delivery and read receipts breakdown across Utility, Service, Marketing, and Authentication categories with Meta cost reporting.
- **Automated Monthly Executive Reports:** HTML/PDF printable reports and automated monthly email summaries.
- **AI Operations Advisor:** Deterministic anomaly detection, booking drop-off warnings, and chamber capacity recommendations with confidence scores.
- **DevOps & Quality CI:** Comprehensive GitHub Actions CI pipeline running TypeScript compilation (4GB heap), ESLint ratchet (0 errors, ≤ 188 warnings), database migration validation gate (210 SQL migrations verified), unit and load test suites.
- **Feature Flag Engine:** Type-safe feature flags with tenant-level overrides.
- **Uptime Monitoring & Health Endpoints:** Root `/api/health` providing real-time subsystem diagnostics for Vercel, Supabase, and Voice AI telephony.

---

## 4. Test & Quality Metrics

- **Unit & Integration Tests:** 517 passing (source assertions currently being migrated to behavioural DB tests).
- **TypeScript Type Safety:** 0 errors (`npm run typecheck`).
- **ESLint Baseline:** 0 errors, 188 warnings (strictly within ratchet ceiling).
- **Database Migrations:** 215 verified non-destructive SQL migrations.
- **Production URL:** `https://omnirelay-main.vercel.app`
- **Branch:** `main` (synchronized with `origin2/main`)
