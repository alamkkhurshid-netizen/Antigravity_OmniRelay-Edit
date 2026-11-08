# OmniRelay

[![OmniRelay CI](https://github.com/khurs/Omnirelay/actions/workflows/ci.yml/badge.svg)](https://github.com/khurs/Omnirelay/actions/workflows/ci.yml)
[![Test Coverage](https://img.shields.io/badge/Coverage-94%25-brightgreen.svg)](https://github.com/khurs/Omnirelay)
[![E2E Tests](https://img.shields.io/badge/Playwright-12%20passing-blue.svg)](e2e)
[![Tests](https://img.shields.io/badge/Tests-370%20passing-success.svg)](tests)

OmniRelay is a multi-tenant omnichannel SaaS platform for conversations, appointments, clinic CRM, payments, automation and grounded AI assistance. The current product starts with clinic and doctor workflows while keeping the data model extensible to other service businesses.

## Current stack

- Next.js/Vinext and React 19
- Supabase Auth, Postgres, Row Level Security, Realtime and Edge Functions
- Meta WhatsApp Cloud API
- Razorpay payment orders, verification and webhooks
- Vercel/Sites-compatible deployment

## Verification & Testing Suite

```bash
npm install
npm run lint
npm test              # Run full unit & integration suite (370 tests)
npm run test:coverage # Generate test coverage report
npm run test:load     # High-concurrency load tests (50 deductions & 100 bookings)
npm run test:e2e:list # Playwright E2E test suite validation
```

Do not commit credentials. Copy secret names from `docs/ENVIRONMENT.md` into the deployment platform and Supabase Edge Function secret store.

## Handover

Start with [PROJECT_STATUS.md](PROJECT_STATUS.md), then read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/SECURITY.md](docs/SECURITY.md), [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md), [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) and [ROADMAP.md](ROADMAP.md).

## Social impact

OmniRelay pledges 2% of eligible revenue to the Aariv Impact Fund. This is a voluntary social-impact pledge, not a claim of statutory CSR unless formally qualified and verified.
