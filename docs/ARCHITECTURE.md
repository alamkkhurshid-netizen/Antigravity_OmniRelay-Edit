# Architecture

## Boundaries

1. Browser UI uses only the Supabase publishable key.
2. Authenticated data access is scoped by Supabase JWT claims and Row Level Security.
3. Privileged operations run in server routes or Supabase Edge Functions.
4. Provider credentials and service-role credentials remain server-side.
5. Provider webhooks are verified before state changes are accepted.

## Main flows

- **Identity:** Supabase Auth → user membership → organisation/workspace.
- **Booking:** public availability lookup → temporary booking/payment intent → verified payment or pay-at-clinic confirmation → appointment lifecycle.
- **Messaging:** Meta webhook → signature verification → contact/conversation/message persistence → Realtime inbox. Outbound messages are created server-side and reconciled from Meta status webhooks.
- **Automation:** domain events become queued work; delivery must be idempotent, retriable and auditable.
- **AI:** Arin is OmniRelay's customer-facing AI agent and VP Marketing persona. Approved knowledge and deterministic policy gates precede model generation; clinical requests and urgent language trigger human/urgent handoff. Retrieval is accessed through an OmniRelay-owned interface so Supabase pgvector or a separately hosted engine such as RAGFlow can be evaluated without changing product workflows.

## AI provider boundary

OmniRelay remains the source of truth for tenant identity, permissions, consent and audit events. A retrieval engine receives only the tenant-scoped documents and query context required for a request. It must not own patient identity, clinical permissions or workflow decisions. RAGFlow is an evaluation candidate for complex document ingestion, chunk inspection, citations and reranking; adoption requires tenant-isolation tests, deletion guarantees, observability, cost benchmarks and a documented fallback.

## Multi-tenancy

Organisation ID is the tenant boundary. New tables must include an organisation relationship, RLS policies for every intended role, indexes supporting policy predicates and tests proving cross-tenant denial.

## Source of truth

Postgres is the system of record. Meta, Razorpay and future calendar providers are external systems reconciled through stable provider IDs and idempotency keys.
