# Post-Meta-approval controlled launch checklist

## Purpose

This is the permanent handoff checklist for restarting OmniRelay's controlled clinic pilot after Meta App Review approval. It records only safe operational evidence: no patient names, mobile numbers, clinical notes, tokens or payment details belong in this file.

## Current checkpoint

- Product direction: clinic-first and WhatsApp-first.
- Live Site: `https://omnirelay-light.alam-kkhurshid.chatgpt.site`
- Current source checkpoint: `17343e5` — server-gated final clinic pilot sign-off.
- Meta App Review: **pending externally**.
- Deployment state: Site version 188 is live.
- Freeze while review is pending: do not change the Meta configuration ID, redirect domain, webhooks, approved templates, WhatsApp connection code, live support number, DNS, or onboard a live clinic.

## Gates to complete after approval

| Order | Gate | Status now | Completion evidence |
| --- | --- | --- | --- |
| 1 | Confirm the approved Meta permissions and record the reviewer outcome | Waiting for Meta | Approval result is recorded; no production token is stored in this file. |
| 2 | Connect one authorised pilot clinic through Embedded Signup or Coexistence | Waiting for Meta | Tenant-scoped connection shows live; owner has confirmed authority. |
| 3 | Validate the production number and approved lifecycle templates | Waiting for gate 2 | A controlled, consented test verifies template delivery and status handling. |
| 4 | Run the private `wa.me` QR booking pilot | Waiting for gate 3 | One controlled booking reaches confirmation without duplicate dispatch. |
| 5 | Prove the complete patient lifecycle | Waiting for gate 4 | Completed visit, care-plan/prescription handoff, named follow-up and one consented reminder outcome are visible as aggregate readiness evidence. |
| 6 | Record recovery evidence | Operational task pending | Encrypted off-site backup export plus a restore drill on a non-production copy, with RPO/RTO notes. |
| 7 | Verify privacy operations | Operational task pending | Tenant selection/membership checks plus export, retention and erasure process are reviewed with synthetic data. |
| 8 | Close all six manual readiness gates | Waiting for gates 3–7 | `backup_export`, `restore_drill`, `pilot_booking`, `pilot_care_plan`, `pilot_follow_up`, and `pilot_reminder` are marked ready with safe owner evidence. |
| 9 | Record final clinic pilot sign-off | Server-gated | The final sign-off is accepted only after the six prior manual gates are ready. |

## Controlled launch rules

1. Start with one invite-only clinic and named staff. Do not expand to additional clinics based on a single test.
2. Use an explicit pilot allow-list and synthetic data wherever a real patient is not essential.
3. Stop and investigate any duplicate message, consent issue, booking conflict, delivery failure, access-control concern or patient-data exposure.
4. No Restaurant, Retail, broad marketing, RAG, n8n or new channel expansion until the pilot is remediated and signed off.
5. General commercial launch remains held until pilot remediation is complete. Expansion criteria remain: 10 paying clinics, 75% 90-day renewal, median activation within 7 days, at least 60% gross margin, and onboarding without manual database or token work.

## Update discipline

After every pilot test, deployment, migration, Meta/configuration change, major decision or incident, update this file with:

- gate status and safe evidence summary;
- source checkpoint and deployment version;
- any known issue and rollback position; and
- the exact next action and its owner.
