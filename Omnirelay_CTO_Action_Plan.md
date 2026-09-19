# OmniRelay — Billing System: Detailed Implementation & Execution Plan
### Post-Meta-Approval Build Sequence

**Context:** Meta App Review is approved. Real client messages can now flow. This means real costs start accruing immediately — billing is no longer a "design it for later" item, it's now on the critical path. This plan sequences the build so nothing goes live uncosted, even for a day.

**One thing to confirm before Day 1, in parallel — not blocking:** who pays Meta directly (§0 of the Billing Implementation Plan). Most of this build is identical either way; only the reconciliation job's data source (§ Day 9-10) depends on the answer. Confirm this week, proceed now.

---

## Guiding Principle for This Build

**Money logic gets built and tested more carefully than feature logic.** Every step below that touches balance, deduction, or payment has an explicit test gate before moving to the next step. Do not let "it looks like it works" substitute for a real test with real numbers.

---

## Phase 1: Foundation (Days 1-3)

### Day 1 — Schema
1. Run the migration for `tenant_wallets`, `message_ledger`, `wallet_transactions`, `billing_reconciliation`, `tenant_pricing_tiers` exactly as specified in the Billing Implementation Plan (§6, §9).
2. Add RLS policies immediately in the same migration — not as a follow-up. Every table: tenant can only read/write their own rows; only service-role functions can write ledger entries (clients never write directly to their own ledger, or they could falsify balance).
3. **Test gate:** Attempt to query another tenant's wallet from a test user session. Must fail. Do this before writing any application code against these tables.

### Day 2 — Wallet Read/Write Functions
4. Build `getWalletBalance(tenantId)` — simple read.
5. Build `creditWallet(tenantId, amountInr, razorpayPaymentId)` — used after a successful top-up. Must be idempotent on `razorpayPaymentId` (if the same payment webhook fires twice, balance must not double-credit).
6. **Test gate:** Call `creditWallet` twice with the same payment ID. Balance must only increase once.

### Day 3 — Razorpay Top-Up Flow
7. Build the Razorpay order-creation endpoint (client requests a top-up amount → creates Razorpay order).
8. Build the Razorpay webhook handler (`payment.captured` event → calls `creditWallet`).
9. Build the GST invoice generator, triggered on successful credit.
10. **Test gate:** Complete one real top-up via Razorpay test mode, end to end — order created, payment captured, wallet credited, invoice generated. Verify the invoice has correct GSTIN if provided.

---

## Phase 2: The Deduction Engine (Days 4-7)

**This is the highest-risk part of the whole build — get it right before touching anything else.**

### Day 4 — Rate Lookup
11. Build a `getMessageRate(category, country)` function reading from a `meta_rate_card` config table (don't hardcode rates in application code — Meta's rates change, as we've already seen twice this year).
12. Populate this table with the **verified, official Oct 1, 2026 rates** — pull directly from Meta's published pricing page, not from any third-party estimate used in earlier planning.
13. Build `getMarkupRate(tenantId, category)` — reads the tenant's current-month tier from `tenant_pricing_tiers`, returns the correct markup % per §9's table.

### Day 5 — Block-Before-Send Check
14. Build `canSendMessage(tenantId, category)` — checks current wallet balance against the message's estimated cost (rate + markup) **before** the send is attempted.
15. Apply the policy explicitly decided in the Billing Implementation Plan §4:
    - Marketing: **block** outright if balance insufficient.
    - Utility/Authentication: **your decision needed here — pick one now, don't leave it ambiguous in code:**
      - Recommended: allow up to a small negative buffer (e.g., -₹50) so a booking confirmation never silently fails, then hard-block further sends until topped up. This protects customer trust without unlimited financial exposure.
16. Wire `canSendMessage` into the outbound dispatcher (the function built last session that actually calls Meta's Graph API) — call this check immediately before the Graph API POST, not after.
17. **Test gate:** Set a test tenant's wallet to ₹0. Attempt a Marketing send (must block) and a Utility send (must follow the policy from step 15). Confirm actual behavior matches the written policy exactly.

### Day 6 — Ledger Write + Atomic Deduction
18. Build `recordAndDeduct(tenantId, metaMessageId, category, channel)` — this is the function that runs on Meta's delivery webhook receipt:
    - Insert into `message_ledger` (idempotent via `meta_message_id UNIQUE` — if Meta retries the same webhook, this must not deduct twice).
    - Deduct from `tenant_wallets.balance_inr` using a **row-level lock** (`SELECT ... FOR UPDATE`) to prevent a race condition if many reminders fire simultaneously (e.g., a clinic's whole day of appointment reminders dispatching in the same minute).
19. **Test gate:** Fire 20 simulated concurrent webhook events for the same tenant. Final balance must reflect exactly 20 deductions, not more, not fewer — this is the classic race-condition bug and it must be tested under real concurrency, not assumed safe.

### Day 7 — Threshold Alerts
20. Build the low-balance check, triggered after every deduction: if balance crosses below `warning_threshold` or `critical_threshold`, fire the WhatsApp + email alert (reuse the existing template/dispatch pattern already in the codebase).
21. **Test gate:** Deduct a tenant's balance down through both thresholds in a test run, confirm both alerts fire exactly once each (not repeatedly on every subsequent message once already below threshold).

---

## Phase 3: Tiered Markup Automation (Days 8-9)

### Day 8 — Monthly Tier Calculation Job
22. Build the `pg_cron` scheduled job (same pattern as the existing `care-reminder-dispatch` functions) that runs on the 1st of each month:
    - For every tenant, sum the previous 30 days of `wallet_transactions` (or ledger spend — clarify which basis matches §9's intent: total spend, not just top-ups).
    - Write the resulting tier into `tenant_pricing_tiers` for the new month.
23. New tenants: insert a Starter-tier row automatically at signup, not left null.
24. **Test gate:** Manually trigger the job for a test tenant with known transaction history, confirm the correct tier is written.

### Day 9 — Dashboard Reflection
25. Build the "Volume Rewards" dashboard card (per the presentation rule in §9): current tier, current markup rate, and the forward-looking nudge ("Send ₹X more to unlock the next tier").
26. **Test gate:** Confirm this reflects the actual `tenant_pricing_tiers` row, not a hardcoded example.

---

## Phase 4: Reconciliation & Go-Live Safety (Days 10-12)

### Day 10 — Reconciliation Job
27. Build the monthly reconciliation job: pull Meta's actual invoice total for the period (via Meta's Billing API if available, or manual entry initially if not yet integrated) and compare against `message_ledger`'s summed `base_cost_inr` for the same period.
28. Write the variance into `billing_reconciliation`. Flag anything beyond a small tolerance (e.g., >2%) for manual review — don't auto-resolve discrepancies silently.

### Day 11 — Full End-to-End Test
29. With a **real test WhatsApp number** (now that Meta approval is live), run the complete loop: client sends a real message → real booking confirmation dispatches → real wallet deduction occurs → real ledger entry written → dashboard reflects the new balance correctly.
30. Repeat for a Marketing broadcast and confirm the higher rate + correct markup tier applies.

### Day 12 — Go-Live Checklist
31. Confirm payment method is verified on the relevant Meta Business account (the Sep 30 deadline item — should already be done, re-verify).
32. Confirm official Meta rates in `meta_rate_card` match Meta's published page exactly, re-checked on this specific day (rates can be updated).
33. Confirm block-before-send is active on production, not just in test.
34. Turn on billing for the first real soft-launch client. Watch their first full day of transactions manually before trusting it to run unattended.

---

## What NOT to Do During This Build

- **Don't skip the concurrency test (Day 6).** This is the one bug class that looks fine in every manual test and only breaks under real multi-message load — exactly what a busy clinic's reminder batch will create.
- **Don't hardcode Meta's rates directly in dispatch code.** Rates have already changed twice this year (Aug 1, Oct 1) — a config table means the next change is a data update, not a code deploy.
- **Don't let the Utility block-before-send policy stay ambiguous.** Pick the buffer amount explicitly (step 15) before Day 11's real test, or the test itself won't tell you anything meaningful.

---

## Summary Timeline

| Phase | Days | Outcome |
|---|---|---|
| 1. Foundation | 1-3 | Wallet exists, top-up works end-to-end |
| 2. Deduction Engine | 4-7 | Every message correctly costed, deducted, and safe under concurrency |
| 3. Tiered Markup | 8-9 | Volume Rewards live and automated |
| 4. Reconciliation & Go-Live | 10-12 | First real client billed correctly, safely |

**~12 working days, roughly 2.5 weeks at your established pace** — this is the direct continuation of "Week 3" from the CTO Action Plan, now made concrete enough to hand straight to Claude Code.
