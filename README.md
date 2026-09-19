# OmniRelay

OmniRelay is a multi-tenant omnichannel SaaS platform for conversations, appointments, clinic CRM, payments, automation and grounded AI assistance. The current product starts with clinic and doctor workflows while keeping the data model extensible to other service businesses.

## Current stack

- Next.js/Vinext and React 19
- Supabase Auth, Postgres, Row Level Security, Realtime and Edge Functions
- Meta WhatsApp Cloud API
- Razorpay payment orders, verification and webhooks
- Vercel/Sites-compatible deployment

## Local verification

```bash
npm install
npm run lint
npm test
```

Do not commit credentials. Copy secret names from `docs/ENVIRONMENT.md` into the deployment platform and Supabase Edge Function secret store.

## Handover

Start with [PROJECT_STATUS.md](PROJECT_STATUS.md), then read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/SECURITY.md](docs/SECURITY.md), [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md), [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) and [ROADMAP.md](ROADMAP.md).

## Social impact

OmniRelay pledges 2% of eligible revenue to the Aariv Impact Fund. This is a voluntary social-impact pledge, not a claim of statutory CSR unless formally qualified and verified.
