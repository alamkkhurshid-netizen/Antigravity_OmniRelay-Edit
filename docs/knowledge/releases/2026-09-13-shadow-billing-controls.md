# Shadow Billing Controls — 13 September 2026

## What changed

- The dashboard planning control is now named **WABA Calc**.
- Billing has a new evidence-only controls area with category and delivery-outcome summaries plus a CSV statement export.
- The database now records the foundations for disabled wallet top-up intents, monthly statements, owner-audited rate-card drafts, AI creative reserve/capture/release records, and monthly three-way reconciliation runs.

## Pilot boundary

All commercial actions remain locked in shadow mode. OmniRelay does not collect a wallet top-up, issue an operational invoice, activate a WhatsApp rate, block a message for balance, capture payment through Razorpay, or charge for AI creative work.

## Reconciliation rule

Before any future billing activation, the clinic's period must reconcile across:

1. Meta delivered-message bill,
2. Razorpay settlement record, and
3. OmniRelay usage ledger.

The owner-only rate-card stage records a source URL, source version, actor and audit event, but produces a draft rate card only.
