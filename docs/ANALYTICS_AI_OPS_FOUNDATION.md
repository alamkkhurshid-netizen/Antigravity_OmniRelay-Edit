# OmniRelay Analytics & AI Operations Foundation

**Status:** Approved architecture charter — not yet enabled in production  
**Owner:** OmniRelay product and engineering  
**Scope:** A reusable, tenant-safe clinic/OPD analytics foundation that can later extend to hospitality, retail and other OmniRelay verticals.

## 1. Decision and product promise

OmniRelay will give a clinic owner or manager a concise answer to three operational questions:

1. **What happened?** Exact, current operational metrics such as booked, attended, cancelled, no-show, reminder delivered and follow-up planned.
2. **Why does it matter?** A plain-language explanation of the largest verified change or operational bottleneck.
3. **Whose action is needed?** A named operational role or accountable team, never a public patient list.

The feature is an operational-assistance layer, not a medical decision system. It must not diagnose patients, recommend treatment, score clinical outcomes, or expose protected health information in AI prompts or owner reports.

## 2. Product stages and cost gates

| Stage | Capability | Enablement gate |
| --- | --- | --- |
| 14A — Metrics contract | Versioned metric definitions and aggregate rollups | Can begin as documentation and source mapping only |
| 14B — Owner dashboard | Exact operational metrics and drill-downs protected by RLS | Stable clinic-pilot event data and metric reconciliation |
| 14C — Efficiency signals | Rule-based, real-time recommendations from aggregate facts | At least 30 days of reliable event data |
| 14D — Monthly owner report | Scheduled report with verified metrics and actions | Owner contact/consent, report review and delivery test |
| 14E — AI narration | Short explanation of already-calculated facts | Cost budget, prompt privacy review and human escalation path |
| 14F — Forecasting / Ask Your Data | Forecasts and approved natural-language questions | 8–12 weeks of representative tenant data and evaluation evidence |

No LLM, paid BI product, external data warehouse or third-party analytics repository is required for stages 14A–14D. OmniRelay should first use its existing Supabase/PostgreSQL data, RLS model and scheduled worker.

## 3. Data minimisation and tenant boundary

Analytics is derived from existing OmniRelay operational events. The analytical layer must only store the minimum needed to calculate a metric.

### Permitted dimensions

- `workspace_id` / clinic tenant
- date and reporting period
- location/chamber ID
- provider ID
- service ID
- appointment source and operational status
- message template/type and delivery status
- campaign type and aggregate result
- payment status and aggregate amount, where billing is enabled

### Prohibited in AI prompts, monthly reports and aggregate insights

- patient name, phone, address, date of birth, appointment notes or diagnosis
- prescriptions, reports, images, medical registration documents or free-text clinical notes
- message body content
- raw conversation transcripts
- cross-clinic comparisons that identify another tenant

Every query and report must be scoped to one workspace through existing RLS. Provider-level views must also respect the eventual provider role model.

## 4. Canonical metric definitions

All displayed numbers must come from a versioned definition. The calculation runs in SQL or application code; an LLM may only explain the resulting aggregate facts.

| Metric | Definition | Primary operational action | Guardrail |
| --- | --- | --- | --- |
| Appointment completion rate | `completed visits / booked appointments` for the selected period | Improve arrival, queue and schedule operations | Show denominator and exclude cancelled appointments |
| No-show rate | `no-shows / confirmed appointments due` | Verify reminder and confirmation workflow | Do not count future appointments |
| Cancellation rate | `cancelled appointments / booked appointments` | Review lead time, availability and reschedule path | Separate clinic cancellations from patient cancellations |
| Reschedule recovery rate | `rescheduled appointments that complete / rescheduled appointments` | Offer approved alternative slot/provider | Never imply clinical substitution without staff approval |
| Reminder delivery rate | `delivered reminders / eligible consented reminders` | Repair template, consent or delivery failures | Do not call a message "delivered" from queue creation alone |
| Follow-up planning coverage | `completed/arrived visits with a planned follow-up or deliberate no-follow-up choice / eligible visits` | Use Follow-up Desk after session | Do not auto-assume care need |
| Follow-up completion rate | `planned follow-ups completed by due date / planned follow-ups due` | Find continuity and capacity gaps | Attribute to original provider first, approved alternatives second |
| Queue delay | `actual service start - scheduled slot start`, aggregated | Adjust token flow, session capacity or staffing | Show data-quality warning where start events are missing |
| Capacity utilisation | `booked slots / published available slots` | Tune schedules and slots | Separate doctor, chamber and location scopes |
| Communication reliability | `successful delivery events / eligible communication events` | Investigate automation/template/provider failures | Exclude opted-out/non-consented recipients from denominator |

There are no fixed performance targets yet because a new pilot lacks a reliable baseline. Targets must be proposed only after enough tenant-specific historical data exists, and must be labelled as provisional.

## 5. Real-time efficiency recommendation engine

The first recommendation engine is deterministic, low cost and explainable. It evaluates aggregate facts on event arrival and at a limited periodic cadence. It does not call an LLM per event.

Example rules:

| Verified condition | Recommendation | Recipient |
| --- | --- | --- |
| A provider has a sustained queue delay with arrivals waiting | Review token flow and next available slots for that provider/chamber | Reception lead / clinic manager |
| Reminder delivery rate drops below a defined reliability threshold | Inspect consent, approved template and WhatsApp delivery status before sending more | Workspace admin |
| High no-show rate compared with the clinic's own baseline | Confirm that 24-hour and 2-hour reminders are scheduled and delivery-verified | Clinic manager |
| Visits completed but follow-up planning remains incomplete | Use Follow-up Desk for the session; show count only | Reception / provider |
| A provider is unavailable with affected bookings | Use the approved substitute/reschedule workflow, not a bulk message to unrelated patients | Authorised clinic staff |

An insight record must contain: the metric version, observation period, aggregate values, rule identifier, created time, expiry time, recipient role and resolution status. It must not contain patient-level details.

AI narration, when later enabled, receives only this insight record and returns a constrained explanation: summary, impact, suggested next step and uncertainty. It cannot execute actions, change schedules, send messages or access arbitrary data.

## 6. Monthly owner report

On the first business day of each month, OmniRelay may generate one report per opted-in clinic owner for the prior calendar month.

The report contains:

- operational scorecard using the metric definitions above
- period-over-period trend only when a comparable prior period exists
- the top three evidence-backed improvements
- a short list of unresolved reliability or workflow exceptions
- data-quality and coverage notes
- a secure in-app link; email/PDF is an optional delivery channel after owner verification

The report must never include patient lists, clinical notes or an unsupported causal claim. Delivery must be logged with recipient, report period, metric-definition version, status and secure artifact reference.

## 7. Reusable multi-vertical model

The analytical pattern is reused, while the facts and labels change by vertical:

| Layer | Clinic/OPD | Restaurant | Retail |
| --- | --- | --- | --- |
| Tenant | clinic workspace | venue/group | store/group |
| Operational unit | location, chamber, provider | location, shift, table | store, department, SKU/category |
| Core flow | booking → arrival → consultation → follow-up | reservation → seating → order → payment | lead/cart → order → payment → loyalty |
| Outcome | attendance, continuity, communications reliability | covers, wait time, table turn | conversion, repeat purchase, recovery |

The common abstraction is **tenant → location → operational unit → event → aggregate metric → recommendation**. No cross-tenant raw data is used to generate a customer insight.

## 8. Technical implementation boundaries

When development is authorised, use the existing platform rather than introduce a second analytics system:

1. Create a versioned `analytics_metric_definitions` registry.
2. Build tenant-scoped daily and near-real-time aggregate views/tables from existing appointment, communications, campaign, payment and follow-up events.
3. Create RLS-protected `analytics_insights` and `monthly_report_runs` records.
4. Extend the existing scheduled worker to refresh aggregates and generate due reports; make each job idempotent.
5. Add dashboard API endpoints that use approved metric queries only.
6. Add AI narration only behind a feature flag, strict JSON schema, budget cap, audit record and no-PHI payload contract.
7. Add forecast/"Ask Your Data" only through a whitelist of parameterised metric queries—never arbitrary LLM-generated SQL.

Do not copy or self-host Metabase, Superset, Lightdash, Evidence or Vanna in the MVP without a separate licensing, hosting, security and cost decision. They are useful references, not dependencies for OmniRelay's foundation.

## 9. Validation and release gates

Before each stage is enabled:

- Reconcile dashboard values against source events for a bounded test period.
- Verify RLS isolation using at least two test workspaces.
- Verify no prohibited fields appear in insight payloads, logs, email or PDF output.
- Verify every scheduled job is idempotent and has success/failure evidence.
- Test a report delivery to a verified non-patient owner address.
- Confirm that an insight links to its exact metric definition and time window.
- For AI stages, test refusal/evaluation cases for unsupported questions, ambiguous data and requests for patient information.

## 10. Deferred decisions

- Owner-report branding, PDF template and delivery channel.
- Clinic-owner opt-in and recipient verification UX.
- Premium-tier packaging, model provider, usage quotas and overage policy.
- Provider-level role access controls and audit requirements.
- Forecast method and minimum-data threshold per metric.
- Whether to use a managed BI product after the pilot demonstrates a real need.

## 11. Success criteria

The foundation is successful when a clinic owner can see one trustworthy operational picture, receive only relevant actions, and trace every number to a defined calculation—without OmniRelay creating new privacy risk, uncontrolled AI spend or another operational tool to maintain.
