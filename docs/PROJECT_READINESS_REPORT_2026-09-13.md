# OmniRelay Detailed Project Readiness Report

**Report date:** 13 September 2026  
**Status:** CTO planning baseline — controlled clinic pilot, not an unrestricted public-production claim  
**Product source baseline:** `8c0e8e0` — WhatsApp booking choice-flow release  
**Latest full automated verification:** 277 / 277 tests passed  

## 1. Executive position

OmniRelay has a strong clinic-product foundation and is ready to run a **controlled three-clinic pilot** once the communication evidence gate is complete. The product is not yet ready to claim unattended patient automation at scale, universal billing activation, tenant RAG assistants or full multi-vertical SaaS maturity.

### Readiness summary

| Readiness measure | Estimate | Meaning |
| --- | ---: | --- |
| Core clinic MVP build | **78%** | Core product exists; remaining work is mostly evidence, productisation and operations. |
| Controlled clinic-pilot readiness | **70%** | Safe to prepare for a limited, monitored pilot after final delivery checks. |
| Self-operating clinic SaaS v1 | **45%** | Configuration, analytics, admin and tenant RAG productisation are still required. |
| Long-term multi-vertical platform | **45%** | Architecture direction is set; several vertical/product packs are future scope. |

Percentages are delivery-readiness estimates, not test coverage or revenue forecasts.

## 2. Full scope, completion and dependencies

| Module | Done | Remaining | Dependency / reason |
| --- | ---: | --- | --- |
| Engineering foundation, security and recovery | 85% | CI/release reconciliation, observability depth, final advisor/security closure | Production telemetry and GitHub source reconciliation. |
| Clinic CRM, patients, consent and appointments | 90% | Pilot edge cases, reporting and operational evidence | Real clinic usage is required to close evidence gaps. |
| Payments and receipts | 75% | Production invoice/receipt completion and reconciled billing activation | Razorpay/Meta reconciliation and tax/legal review. |
| WhatsApp booking concierge and inbox | 82% | Delivery-verified lifecycle coverage and sales-RAG extension | Approved templates, consented test recipients and live observations. |
| Patient communication reliability | 78% | Confirmation, 24h/2h reminder, follow-up and cancellation evidence through the real channel | Must be verified before unattended use. |
| Multi-doctor OPD | 75% | Substitute-provider approval flow, patient token queue, role proof and 10–20-doctor operating test | Requires realistic OPD scenario testing. |
| Automation operations | 78% | Monitored unattended execution evidence and deeper alert/runbook closure | Pilot workload and delivery evidence. |
| UI/UX modernization | 82% | Business Setup redesign, cross-route consistency and remaining legacy-style cleanup | Must preserve existing workflow behaviour. |
| Mobile/PWA Foundation | 55% | Correct icons/Apple metadata, touch-system audit, mobile data cards and device acceptance | One focused PWA/mobile release. |
| Business onboarding factory | 40% | Guided setup, save/resume, activation checks and standard tenant configuration | Depends on polished Business Setup and configuration templates. |
| One-way Google Calendar | 0% | OAuth, secure token storage, event mapping, retries and tests | Locked direction: OmniRelay to Google only. |
| Billing, wallet and usage analytics | 45% | Top-up, ledger, statements, reconciliation and controlled activation | Remains shadow-mode until one full pilot-cycle reconciliation. |
| Clinic analytics / value dashboard | 20% | KPI event definitions, owner dashboard, drill-down, exports and monthly report | Requires trustworthy pilot data and metric definitions. |
| OmniRelay Admin / OEM panel | 35% | Tenant provisioning, rollout controls, support workflows, billing oversight and health analytics | Depends on aggregated event/usage data and privacy boundaries. |
| AI-powered Dashboard and OEM panel | 15% | Insight engine, recommendations, confidence/explanations, review controls and monthly narrative report | Must first have trusted, tenant-safe operational metrics; AI may recommend, not silently act. |
| OmniRelay Guide | 55% | Continued product-knowledge releases and richer documentation coverage | Requires every product release to update the knowledge record. |
| Tenant WhatsApp RAG assistants | 0% | Tenant knowledge ingestion, retrieval/citations, evaluation, safe handoff, metering and onboarding | Sales RAG is the first reusable foundation. |
| OmniRelay Sales RAG Concierge | 10% | Product knowledge pack, lead flow, WhatsApp RAG, handoff and controlled launch | Founder-approved commercial content and Meta marketing template. |
| Founding 100 partner network | 5% | Territory availability, assessment, scoring, dossier, interview and partner portal | Commercial/legal terms must be finalised. |
| Restaurants, retail and other vertical packs | 10% | Vertical workflows, catalogues, permissions and onboarding | Clinic pilot patterns must first be productised. |
| Native Android/iOS apps | 0% | React Native/Expo product, device features and store delivery | Web/PWA pilot validation first. |

## 3. What is already delivered

### Core clinic product

- Multi-tenant organisation model with role-aware access and Supabase Row Level Security.
- Clinic business profile, providers, chambers, services, recurring availability and appointment collision protection.
- Patient/contact records, consent history, guardian/household coordination, care tasks, care plans, prescriptions and documents.
- Public booking, branded booking QR, self-service booking actions, appointment approval, reschedule and cancellation.
- Pay-at-clinic and protected Razorpay payment routes.

### WhatsApp and automation

- Meta webhook ingestion, template dispatch, message status reconciliation, operational inbox and real-time refresh.
- Interactive WhatsApp booking: **Book appointment**, provider/chamber/slot selection, repeat booking, bookings lookup, human handoff and consent boundaries.
- Approved communication templates and Communication Controls for future eligible patient messages.
- Automation queue, idempotent runs, retries, dead-letter/recovery controls, worker health and Action Centre escalation.
- Emergency notices are doctor/chamber scoped; unrelated patients must not be included.

### Reliability, governance and operations

- Server-side privilege boundaries, rate limiting, audited/reversible staff deactivation and protected high-risk operations.
- Backup tool process: encrypted backup plus checksum verification.
- Pilot Readiness controls: named pilot/rollback ownership, GO/HOLD, controlled channel testing and closeout evidence.
- Current live source includes the latest WhatsApp booking-choice release; full test suite passed 277 / 277.

## 4. Timeline and delivery order

The dates below are targets. No target overrides consent, provider approval, pilot evidence or release gates.

| Workstream | Tentative effort | Target window | Activation condition |
| --- | ---: | --- | --- |
| Communication delivery evidence | 2–3 weeks | September–October 2026 | Each lifecycle message delivery-verified on a consented test path. |
| OmniRelay Sales RAG Concierge | 10 working days for controlled inbound launch | September 2026 | Approved product knowledge, safe handoff and internal conversation tests. |
| Three-clinic controlled pilot | 21–30 days | Late September–October 2026 | Daily GO/HOLD and privacy-safe evidence review. |
| PWA/mobile-first Foundation | 7–10 working days | October 2026 | Android/iOS installation, 320px and touch-target acceptance. |
| Business Setup/onboarding refinement | 1–2 weeks | October 2026 | Safe save/resume and booking-readiness checks. |
| One-way Google Calendar | 4–6 working days | October–November 2026 | Google OAuth/security, idempotent sync and failure-retry tests. |
| Pre-launch broadcast readiness | By 1 November 2026 | October 2026 | Approved Meta marketing template, opted-in contacts, opt-out and conversation testing. |
| Multi-doctor advanced operations | 3–4 weeks | November–December 2026 | Substitute/provider-token/role test scenarios close successfully. |
| Billing activation package | 4–6 weeks | After pilot cycle, November–December 2026 | Meta/Razorpay/ledger reconciliation; founder approval before charging. |
| Clinic analytics + AI owner insights v1 | 4–6 weeks | December 2026–January 2027 | Metric definitions, data-quality checks and human-review recommendations. |
| Admin/OEM + AI operations panel v1 | 6–8 weeks | January–February 2027 | Aggregated tenant health, safe support controls, rollout and audit guardrails. |
| Tenant RAG Starter Kit | 6–8 weeks | January–February 2027 | Tenant isolation, citations, evaluation, safe handoff and usage controls. |
| Founding 100 portal | 6–8 weeks | March–April 2027 | Final commercial/legal policy and territory/assessment requirements. |
| Restaurant/retail vertical packs | 8–12 weeks | March–June 2027 | Reusable configuration engine and validated clinic SaaS foundation. |
| Native Android/iOS MVP | 6–8 weeks | Mid-2027 | Web/PWA usage proves the required daily mobile workflows. |

## 5. Implementation framework

### Phase 1 — prove the clinic core

1. Freeze uncontrolled changes to patient messaging.
2. Complete delivery evidence for confirmation, 24h/2h reminders, reschedule, cancellation and follow-up.
3. Start the three-clinic pilot with daily GO/HOLD review.
4. Repair only evidence-backed issues; release through test, rollback and monitoring gates.

### Phase 2 — make the product usable everywhere

1. Deliver the PWA/mobile baseline without offline patient-data caching.
2. Redesign Business Setup as guided, saveable configuration rather than a technical form collection.
3. Implement one-way Google Calendar sync, retaining OmniRelay as the schedule authority.

### Phase 3 — make customer activation repeatable

1. Build reusable vertical/workflow templates and tenant configuration versions.
2. Create onboarding: connect channel, upload knowledge, choose blueprint, preview, bounded test and activate.
3. Expose exceptions—not raw engineering queues—to clinic staff.

### Phase 4 — build the commercial operating layer

1. Keep billing in shadow mode through a complete pilot cycle.
2. Activate wallet/ledger only after reconciliation and founder approval.
3. Build owner analytics, Admin/OEM health controls and AI-generated recommendations from verified aggregate metrics.
4. AI recommendations must explain their evidence and require a person to approve any action with external effect.

### Phase 5 — scale the platform

1. Productise tenant RAG: isolated source packs, citations, evaluation and human handoff.
2. Launch the Founding 100 workflow after commercial/legal finalisation.
3. Expand only proven workflow primitives into restaurants, retail and further verticals.
4. Build native mobile apps only after PWA evidence shows which workflows truly need native capability.

## 6. AI-powered dashboard and OEM panel requirements

The Dashboard and OEM panel will be AI-assisted, but never an unbounded autonomous operator.

### Clinic owner dashboard

- Detect booking drop-off, no-show risk, delivery failures, unused workflows, capacity imbalance and follow-up backlog.
- Recommend an action with the supporting metric and confidence: for example, “Dr A’s Wednesday slots have low confirmation rates; review 24-hour reminder delivery.”
- Generate a monthly owner report summarising verified service usage, value signals, exceptions and next actions.
- Keep patient identity and clinical details out of aggregate recommendations by default.

### OmniRelay Admin/OEM panel

- Detect tenant onboarding stalls, expired channel connections, template/delivery failures, unsafe configuration and billing-reconciliation exceptions.
- Prioritise support intervention by impact and confidence.
- Offer a recommended playbook; no AI action may activate a campaign, alter consent, modify billing or deploy code without authorised human approval.
- Retain inputs, recommendation, action owner and outcome for audit and improvement.

## 7. Standard GitHub and knowledge-update instruction

This section is mandatory operating procedure for every future OmniRelay session and release.

### At the start of a new chat/session

1. Open this report, the SaaS Scope Charter, current architecture notes and latest release record.
2. Verify the active local branch/commit, working-tree status and GitHub `main` commit.
3. State whether source is aligned. Do not claim GitHub is current unless commits are actually compared.
4. Preserve unrelated or user-owned working-tree files.

### For every completed product change

1. Update the relevant Guide/RAG knowledge article and release manifest when product behaviour changes.
2. Add or update automated tests; run the build and appropriate acceptance checks.
3. Commit source, tests and documentation together with a clear message.
4. Safely sync the verified commit to GitHub using a fast-forward/non-destructive path.
5. Deploy only after the required approval and record the deployed commit/version.
6. If GitHub history differs, stop and reconcile; never force-push or overwrite a branch to make status look current.

### For planning-only discussions

- Update this report or the SaaS Scope Charter only when the founder explicitly freezes/changes scope.
- Do not represent planning documents as implemented product capability.

## 8. GitHub status at report creation

- GitHub repository: `alamkkhurshid-netizen/Omnirelay`.
- GitHub access was verified with administrator permission on 13 September 2026.
- The frozen SaaS Scope Charter is present in GitHub.
- The live Sites source and GitHub repository have separate history/remote configuration at this checkpoint. A document update is **not** evidence that the entire live source mirror is aligned.
- Before the next implementation release, perform a one-time safe source reconciliation, then use the mandatory fast-forward sync procedure above.

## 9. Decision log

- Clinic-first delivery remains the priority.
- Google Calendar scope is one-way: OmniRelay to Google only.
- PWA precedes native mobile apps.
- Billing remains shadow-mode until a full reconciled pilot cycle.
- OmniRelay Sales RAG launches before the tenant RAG product.
- AI dashboards and OEM recommendations are human-approved, evidence-backed and tenant-safe.
- Founding 100 and additional verticals are future growth products, not pilot promises.

