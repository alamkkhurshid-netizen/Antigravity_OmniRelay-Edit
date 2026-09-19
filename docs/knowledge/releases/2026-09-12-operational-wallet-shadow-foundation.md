# Operational wallet shadow foundation — 12 September 2026

## Product outcome

OmniRelay Billing now separates fixed SaaS plan billing from operational-message usage. The operational wallet is in **shadow mode** for the clinic pilot: it observes eligible WhatsApp operations and presents an estimated usage view without taking money, deducting a balance, or stopping any communication.

## What clinic owners should know

- The Wallet & Transaction Ledger is not live for collection during the pilot.
- Confirmation, reminder, care and campaign events can appear as anonymised usage observations; patient names and message text are not shown in the billing view.
- The cost calculator becomes a monetary estimate only after an approved official Meta India rate card is recorded.
- SaaS subscription checkout remains separate from operational wallet usage.
- Live activation requires successful one-clinic monthly reconciliation, GST/invoicing confirmation and a separate owner approval.

## Safety boundaries

- Browser users can read only their organization’s settings, wallet, usage and ledger.
- Browser users cannot create, edit or delete operational-wallet records.
- Shadow mode is database-constrained: `charging_enabled` and `send_blocking_enabled` must remain false until a distinct active-mode activation.
- No rate is shipped as a hard-coded client price.

## RAG impact

`guide_only`: OmniRelay Guide has updated product help. No tenant document is indexed automatically and no customer-facing AI behaviour is activated by this release.
