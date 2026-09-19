# Omnirelay — Master Build Blueprint
### CTO-level roadmap: MVP → Production-ready platform
*Last revised: incorporates repo-reuse plan, Razorpay correction, clinic workflow detail, and timeline realism check.*

**Principle governing every decision below:** Build only what current revenue/traction justifies. Never build Stage N+1 infrastructure before Stage N has paying clients funding it. This is what keeps a near-zero budget from killing the project.

---

## 1. Final Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js (App Router) | Free tier hosting (Vercel), fast iteration with Claude Code |
| Backend/DB | Supabase (Postgres + RLS) | Free tier covers MVP; multi-tenant isolation via Row Level Security |
| Cache/Queue | Upstash Redis (free tier → paid at scale) | Session state, rate limiting, later queueing |
| Messaging | Meta WhatsApp Cloud API (your verified BSP, Embedded Signup) | Zero-touch client onboarding — your key advantage over non-BSP competitors |
| Automation bridge | n8n (self-hosted, Oracle Cloud free tier) — **Stage 3 only, not MVP.** Right tool for client-facing custom automation (push booking data to a client's own Sheet/CRM), wrong tool for the core conversational flow engine (stateful, multi-turn) | Custom workflow logic for clients who ask for it, once they ask |
| **Billing** | **Razorpay** (not Stripe) — Stripe's India general availability is currently invite-only and cannot collect via UPI/NetBanking/wallets, which are how your actual clients pay. Razorpay is UPI-native, 0% MDR under ₹2,000, full Subscriptions API | Subscriptions, usage metering, India-native payment methods |
| **Billing/payment UI** | `razorpay/blade` (MIT, cross-platform, white-label support) for checkout/wallet/billing-history screens specifically; `shadcn/ui` everywhere else — don't run both broadly, keep the split narrow | Native-feeling Razorpay integration UI without abandoning the main design system |
| AI/LLM | Groq free tier → paid API as volume grows | Flow logic, later RAG. **Explicit decision: NOT Meta Business Agent** ($2/M tokens from Aug 1, 2026) — routing your AI logic through Meta's built-in agent outsources your core product value to a commodity layer anyone could enable. Meta APIs stay pure message-delivery; your own AI stays the brain |
| Build tool | Claude Code, Claude Pro | Full project scaffolding, Supabase MCP integration. **Real recurring cost: ₹2,000-2,500/mo** (not ₹1,700 — India charges 18% GST on foreign digital subscriptions, plus card forex markup) |

---

## 2. Repo Reuse Plan — what to fork/adopt vs. build from scratch

| Category | Repo | Role | License/Maturity |
|---|---|---|---|
| Multi-tenant core | `vercel/platforms` | Subdomain-per-tenant scaffold reference | Official Vercel, high confidence |
| Billing scaffold | `vercel/nextjs-subscription-payments` | **Reference only, not a direct fork** — it's Stripe-specific; Razorpay Subscriptions API integration must be built separately. Only the subscription *data model* pattern is reusable | Official Vercel |
| UI system | `shadcn-ui/ui` | Core component library, all screens except billing-specific ones | High confidence, industry standard |
| **Flow engine, Inbox, base CRM** | `zernio-dev/zernflow` (**forked**) | Node types (Trigger, Send Message, AI Response, Condition, Delay, Tag, HTTP Request, Human Takeover, A/B Split, etc.), webhook receiver, live inbox, contacts/tags, broadcast, sequences — **strip its Zernio channel dependency, replace with direct Meta Cloud API adapters** | MIT, Next.js+Supabase — exact stack match. 66 stars, real but small — expect some debugging overhead |
| Flow canvas library | `xyflow/react-flow` | Underlying node-based UI library (zernflow itself is built on this) | Mature, proven (used by Stripe, Typeform) |
| WhatsApp+Instagram connection | `matiasbattocchia/open-bsp-api` | Official Meta Cloud API pattern, Supabase-native, WhatsApp+Instagram | Verify maintenance activity before full reliance |
| WhatsApp API reference | `fbsamples/whatsapp-api-examples` | Official Meta sample code for webhook/message patterns | Official, high confidence |
| Dev workflow | `nakulben/whatsapp-mcp` | MCP server — manage templates/send messages from Claude Code during dev/testing | Real, functional |
| Dev workflow | `razorpay/blade-mcp` | MCP server for AI-assisted Blade component usage — connect in Claude Code during P8 | Official Razorpay, actively maintained |
| Retail catalog | **Meta Catalog API** (native Meta feature, not a repo) | In-chat product browsing on WhatsApp + Instagram Shopping — the actual mechanism for clothing/apparel catalog sales, not something to build custom UI for | Native, authoritative |
| Retail catalog reference | `openshiporg/openfront` | Next.js+Keystone commerce data model reference | Real, moderate maturity |
| Restaurant reference | `roshanx0/restaurant-ordering-saas` | React+TS+Supabase QR ordering schema reference | Real, confirmed |
| RAG (Stage 1) | `infiniflow/ragflow` | Knowledge base retrieval engine | Mature, widely used |
| RCS (Stage 4) | Route Mobile (Jio RCS aggregator) | India RCS integration | Commercial partner, not a repo |
| Advanced CRM reference | `twentyhq/twenty` | Pipeline/custom-object schema inspiration for Pro-tier CRM | Reference only, different product shape |

**Rejected after evaluation:** `bagisto/bagisto` (Laravel/PHP, stack mismatch) · `medusajs/medusa` (too heavy for Retail's actual needs) · `jorgerosal/kapeOS` (2 commits, 0 stars — scaffolding only) · `QaziAbsaar/restaurant-whatsapp-bot` (reads WhatsApp Desktop's local DB — unofficial, non-compliant) · `bagisto` and Stripe starter itself once Razorpay was confirmed as the correct payment rail.

### Time saved vs. from-scratch — honest range

| Repo | Time saved | Confidence |
|---|---|---|
| `vercel/platforms` | 2-3 days | High |
| `nextjs-subscription-payments` (data model only, Razorpay correction applied) | **1-2 days** (was 4-6 days before the Stripe→Razorpay correction) | Medium |
| `shadcn/ui` | 3-5 days cumulative | High |
| `zernflow` fork | 7-10 days gross, **net ~1.5-2 weeks after Zernio-dependency rework** | Medium |
| `open-bsp-api` | 3-4 days | Medium — verify maintenance first |
| `fbsamples/whatsapp-api-examples` | 2-3 days | High |
| `roshanx0/restaurant-ordering-saas` | 1-2 days | Medium |

**Best case: ~4.5 weeks saved. Realistic case: ~3 weeks saved**, after accounting for ~15-20% integration/debugging friction on the smaller, less-proven repos (zernflow, open-bsp-api). Official repos (Vercel, Meta) carry near-zero risk; treat those savings as solid, treat zernflow's saving as real but partially offset by rework.

---

## 3. PHASE 0 — MVP Build

**Realistic timeline: ~10.5-11 weeks full-time, or ~5.5-7.5 months part-time.**

"Full-time" = **~6 focused hours/day, 5-6 days/week** — not 8-10 hours of continuous typing. The bottleneck is the review/test loop (verifying against real WhatsApp messages), not raw coding speed, so more hours/day doesn't compress this linearly. Given your actual situation (full-time at Dräger), plan around the part-time range unless you carve out genuinely dedicated blocks.

**Goal:** First paying client, Restaurant vertical live by week 7-8.

| Sub-phase | Deliverable | Weeks | Exit criteria |
|---|---|---|---|
| P0 | Project scaffold (`vercel/platforms` reference), multi-tenant DB schema, RLS policies. **Schema channel-agnostic from day one** (`channel` field — WhatsApp now, Instagram/RCS later, no migration needed) | 1 | Tenant A cannot query Tenant B's data — verified by test |
| P1 | Auth, tenant onboarding wizard, role-based access | 1 | New signup → workspace created → owner logged in |
| P2 | Flow engine (**zernflow fork**, Zernio dependency replaced with direct Meta adapters) | 1 | A flow survives a client going silent mid-conversation and resuming later |
| P3 | WhatsApp Embedded Signup + webhook + Subscribed Apps API (`open-bsp-api` + `fbsamples` reference) | 1 | Client connects their number in <5 min, zero manual steps from you |
| P4 | Restaurant vertical (booking, deposit, owner-approval, table-ready alerts) | 1 | End-to-end test: real customer books via WhatsApp, owner approves |
| **→ SOFT LAUNCH RESTAURANT HERE — get first 5-10 paying clients before continuing** |
| P5 | **Clinic vertical** — booking, **multi-doctor selection** (doctor list → date/time → confirm), automated patient confirmation + reminder, **doctor-facing reminder** (based on doctor's visiting schedule), follow-up reminder sequence | 1.5 | Patient books via QR→WhatsApp scan end-to-end; doctor receives own schedule reminder correctly |
| P6 | Retail vertical — WhatsApp + Instagram catalog selling (Meta Catalog API), order/shipping updates | 1 | Same test pattern as P4/P5 |
| P7 | Unified inbox + dashboard/analytics + Setup Assistant (guided onboarding) + WhatsApp Broadcast Composer (audience segment, schedule, send, delivery tracking) | 1.5 | Owner can self-onboard without a support call; can segment customers (e.g. "visited 10+ days ago") and send a campaign end-to-end |
| P8 | Billing — **Razorpay** subscriptions + WhatsApp message wallet (per-message pass-through, see §6b) | 1.5-2 | Free→paid upgrade flow works via UPI/cards; message wallet debits correctly per category |
| P9 | Security hardening, load test, bug bash | 1.5 | No open RLS gaps, rate limiting active, error logging live |

**Legal/landing pages** (parallel, 1-2 weeks alongside P4-P9): vertical landing pages (`/restaurant`, `/clinic`, `/retail`), Privacy Policy, Terms, Refund Policy, Trademark, GDPR, DPA, Cookies.

**Template Library** (built alongside P4-P6): 10 pre-validated WhatsApp templates per vertical, auto-submitted to each new client's WABA at onboarding via Meta's Template Management API.

- **Clinic (10):** booking confirmation, 24h reminder, reschedule confirmation, cancellation confirmation, doctor-running-late alert, post-visit follow-up, report/prescription ready, review request, missed-appointment nudge, welcome message
- **Restaurant (10):** booking confirmation, deposit request, owner-approval alert, table-ready alert, order confirmation, delivery status, feedback request, missed-reservation nudge, promo (marketing-category), welcome message
- **Retail (10):** order confirmation, payment confirmation, shipping update, delivery confirmation, restock alert, abandoned-cart nudge, review request, loyalty/offer (marketing-category), return/refund status, welcome message
- **Custom:** escape hatch for anything outside the standard 10 — not the default path
- **Category discipline:** classify each as Utility/Marketing/Authentication correctly at build time — misclassifying a reminder as Marketing is a common costly mistake (6-13x rate difference)

**MVP infra cost:** ~₹100/month (domain only — everything else on free tiers).

**500-client ceiling check:** the architecture has no hard client-count limit, but **free-tier infra breaks before 500 clients** — Supabase Realtime (~200 concurrent connection cap), Redis command limits, and DB size all get tight well before that point. Upgrading to paid tiers (~₹4,500-5,700/mo — Supabase Pro, Redis paid, Vercel Pro) is the correct fix, gated behind reaching that scale, not something the MVP setup needs to absorb upfront.

---

## 4. GROWTH STAGES — build only when triggered by real traction

| Stage | Adds | Trigger | Weeks | Added infra cost |
|---|---|---|---|---|
| 1. Retention layer | RAG knowledge base (`ragflow`) | 30-50 paying clients | 3-4 | +₹1,500-2,500/mo |
| 2. Multi-channel | Instagram DM, unified inbox expansion | 100+ clients | 3-4 | +₹1,000-2,000/mo |
| 3. Automation depth | n8n Bridge exposed to clients for custom workflows | First enterprise client requests custom logic | 2-3 | +₹1,500/mo (dedicated VPS) |
| 4. RCS + AI templates | RCS via Route Mobile (Jio RCS), AI campaign generator | Pro-tier demand justifies it | 3-4 | +₹2,000-4,000/mo |
| 5. Control Centre | Super-admin panel — tenant mgmt, support, global templates | ~150+ tenants, manual mgmt breaks down | 2-3 | included in compute |
| 6. Partner Control Centre | Affiliate/referral tracking, tiered commissions, payouts | Want partner-driven growth | 2-3 | + payment gateway connect fees |
| 7. OEM Dashboard | White-label/reseller layer, tenant-of-tenant isolation | An agency actually asks to resell | 3-4 | scales with resold tenants |
| 8. User Panel | End-customer portal (patient/diner/shopper login) | Verticals need self-serve history | 2-3 | included |
| 9. Scale hardening | Read replicas, Redis cluster, async queue workers, autoscaling | Approaching 1,000+ active clients | 2-3 | ₹15-30K/mo |
| 10. Unified Broadcast & Campaign Manager | One-click multi-channel broadcast: WhatsApp, Email, SMS (India DLT-compliant) — shared audience list, AI-drafted content, one send fans out to all selected channels. **Instagram excluded** (Meta API only allows reply-window messaging — no cold-send capability) | Clients ask for cross-channel campaigns | 3-4 | +₹2,000-3,000/mo |
| 11. Instagram/Meta Ads Add-on | Paid sponsored messages for cold Instagram/Facebook reach — genuinely separate from organic broadcast | A client specifically wants paid Instagram reach | 2 | ad spend pass-through |
| 12. Regional Expansion (Nepal, Bangladesh) | Local SMS/DLT compliance research, RCS carrier coverage check (Route Mobile's Jio deal is India-only) | Real demand, not speculative | 1-2 research + build | varies |
| 13. **Advanced CRM (Pro-tier upsell)** | Vertical-specific pipeline fields on top of the base CRM (contacts/tags/segments already in the zernflow fork) — **Clinic:** visit history, referral source, recall/follow-up pipeline · **Restaurant:** spend history, visit frequency, VIP/loyalty tagging · **Retail:** purchase history segmentation, repeat-buyer flagging, cart-abandon tracking | Pro-tier clients requesting deeper customer insight | 1.5-2 | included in compute — schema extension, not new infra |

**Cumulative timeline:** MVP live ~11 wks → retention+multichannel ~23 wks → full platform ~40 wks → scaled to 1K+ clients ~48 wks.

---

## 5. Competitive Positioning

Horizontal WhatsApp API platforms (Zaptick, Wati, AiSensy, Gupshup) already dominate the generic space — official BSPs, RCS partnerships, established customer bases. **Do not compete there.**

**Your wedge:** vertical-specific, pre-built flow logic (clinic multi-doctor OPD booking, restaurant deposit/booking rules) that a generic flow builder doesn't ship with. Market as "AI receptionist for [vertical]," never as "another WhatsApp API platform."

**Honest moat assessment:** this is a real but shallow moat — any funded competitor could replicate template sets in weeks. Durability comes from execution speed and accumulated per-vertical refinement, not from technical difficulty to copy.

---

## 6. Unit Economics

| Metric | Value |
|---|---|
| Infra cost/client (excl. WhatsApp) | ~₹20-40/mo at 1K-client scale |
| WhatsApp cost/client — utility-heavy vertical (clinic reminders) | Lowest — best margin |
| WhatsApp cost/client — marketing-heavy vertical (restaurant promos) | Highest — thinnest margin |
| Suggested pricing | Growth ₹2,400/mo · Pro ₹6,500/mo — sits upper-middle of the ₹999-3,000+ Indian BSP range; justify the gap with vertical value, not price alone |
| Gross margin | 85-95% per paying client |
| Breakeven at MVP infra floor | ~11-15 Growth-tier clients |
| Current Meta India per-message rates | ₹0.92 marketing · ₹0.14 utility · ₹0.08 service/authentication |

---

## 6b. WhatsApp Message Billing Architecture

**Do not architect around Meta's free tier — it's shrinking.** Meta moved to per-message billing (July 2025) and from **Oct 1, 2026, will begin charging for service replies and utility messages inside the 24-hour window too** — currently free today.

**Structure:**
1. **Platform subscription (flat, Razorpay)** — infra, dashboard, flow engine access
2. **Message wallet** — prepaid/postpaid credits, debited at Meta's rate + 10-20% margin
3. **Free monthly allowance** — small bundled quota (200-500 utility messages) as acquisition hook, explicitly capped
4. **Category-aware pricing display** — Marketing/Utility/Authentication/Service rates differ 6-13x

### Unified Message Ledger (WhatsApp + Instagram + RCS in one system)

```
message_ledger
├── tenant_id, channel, category, country, template_id
├── meta_cost (actual cost from Meta/Route Mobile)
├── billed_cost (meta_cost + margin)
└── status, timestamp
```

One client-facing wallet balance (INR) across all channels; dashboard shows per-channel breakdown. **Monthly reconciliation job** pulls actual Meta/Route Mobile invoices, true-ups against ledger estimates.

**Action item:** verify current free-tier terms and Oct 2026 change directly on Meta's official docs before finalizing wallet math.

---

## 7. Risk Register

- **WABA messaging tier limits** — new numbers start low, scale with quality rating; don't onboard 50 clients in one day
- **Meta template approval** — hours, not instant; build submission status into dashboard early
- **RLS correctness** — highest-severity bug class (tenant data leakage); test at P0, re-test after every schema change
- **Flow engine state bugs** — conversation state loss on client silence/restart; test this path specifically
- **Oct 1, 2026 Meta billing change** — re-run unit economics once official rates confirmed, before locking pricing
- **zernflow fork rework risk** — stripping the Zernio dependency is real engineering work, not free; budget the net time (not gross) saved
- **open-bsp-api maintenance status** — unverified activity level; check before full reliance in P3

---

## 8. Tooling Plan

- **Build tool:** Claude Code, Claude Pro (~₹2,000-2,500/mo real cost incl. GST + forex) — sufficient at your pace; Max only if session limits genuinely block daily work
- **MCP integrations to connect:** `nakulben/whatsapp-mcp` (template/message testing from Claude Code), `razorpay/blade-mcp` (during P8 billing UI work), Supabase MCP (schema/migrations)
- **Current parallel track:** keep existing ChatGPT Sites workflow running if it's already working — don't abandon a working path for a comparison-driven switch
- **Meta Business Manager isolation:** separate Meta App (new App ID) for Omnirelay's build — never edit the existing App/webhook that ChatGPT Sites uses

---

## 9. Design Principles — UI/Brand direction

**Target feel:** high-value, upmarket, elegant — not a generic bootstrap SaaS template.

- Clean typography, generous whitespace, restrained/muted premium color palette
- Reference points: Linear, Stripe Dashboard, Vercel — minimal, confident, uncluttered
- `shadcn/ui` for the core app; `razorpay/blade` narrowly for billing/checkout/wallet screens only — don't mix broadly
- No stock icon-soup or generic gradient-hero landing pages
- Applies to: client dashboard, vertical landing pages, onboarding wizard, Setup Assistant chat UI

---

*This is a living document — revisit stage triggers as real usage data comes in. Sequence is revenue-gated, not calendar-gated.*
