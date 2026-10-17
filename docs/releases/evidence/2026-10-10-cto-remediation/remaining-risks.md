# Remaining Risks & Pilot Boundaries Register

**Release Identifier:** `2026-10-10-cto-remediation-voice-billing-reliability`  
**Evaluation Date:** 2026-10-17  
**Scope:** Hosted Staging & 100-Call Healthcare-Only Pilot  

---

## 1. Active Risk Register

| Risk ID | Category | Risk Description | Initial Severity | Controlled / Residual Severity | Mitigation & Kill Switches |
|---|---|---|---|---|---|
| **RSK-01** | Telephony Latency | Real PSTN/carrier turn latency exceeding synthetic testing under mobile network variance. | High | **Low** | Relaxed initial gate from 1.2s to **P95 $\le 2.5\text{s}$** pending real carrier baseline. Streaming audio buffers tuned with speculative cancellation on barge-in. |
| **RSK-02** | Telephony Carrier Failover | Upstream SIP trunk drop or carrier network degradation on primary voice trunk. | Medium | **Low** | Dual-provider carrier routing (Twilio primary, Exotel secondary) with automated failover and failed-transfer operator recovery. |
| **RSK-03** | Meta WABA Rate Limits | Meta Cloud API 24-hour customer service window expiry blocking free-form responses. | Medium | **Low** | Verified template action fallback: free-form input disabled outside window; clinic notification templates used for overdue follow-up. |
| **RSK-04** | Pilot Scope Creep | Accidental execution of non-healthcare scenarios (retail, restaurant, hospitality). | High | **Zero** | Hard pilot boundary: all non-healthcare scenarios removed. Pilot matrix strictly locked to healthcare clinic OPD bookings and clinical triage boundaries. |
| **RSK-05** | Financial Over-Billing | Uncapped provider spend or unexpected burst of concurrent voice calls. | High | **Zero** | Tenant wallet pre-funding enforced with transactional advisory locks (`pg_advisory_xact_lock`). Negative balances fail closed with auto-disconnect. Provider spend cap configured. |
| **RSK-06** | Clinical Boundary Violation | Patient attempting to seek direct emergency medical diagnosis over voice concierge. | Critical | **Zero** | Strict clinical boundary guardrails: AI agent explicitly identifies as automated concierge, refuses diagnosis, and executes immediate emergency protocol (redirection to nearest emergency room / hospital line). |
| **RSK-07** | Patient PII Exposure | Accidental logging of complete telephone numbers or clinical notes in logs or traces. | Critical | **Zero** | Masked identifiers policy: all public logs redact phone numbers (`+91 98450 XXXXX`), consent IDs used for test tracking, sanitized evidence format strictly enforced. |

---

## 2. Emergency Operational Kill Switches

1. **Voice Runtime Pilot Kill Switch:**
   - Environment variable `VOICE_PILOT_KILL_SWITCH=true` immediately redirects incoming voice calls to clinic reception desk without LLM processing.
2. **Worker Pause:**
   - Background lease workers (`whatsapp_inbound_messages`, reminder workers) can be paused instantly via `WORKER_ENABLED=false`.
3. **Provider Failover Switch:**
   - `VOICE_PROVIDER_FALLBACK=true` reroutes PSTN traffic between carriers without code redeployment.
4. **Tenant Service Disablement:**
   - Organization `is_active` flag in `public.organizations` allows instant single-tenant isolation during anomaly investigation.
