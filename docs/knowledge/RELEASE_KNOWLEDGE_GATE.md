# Product knowledge release gate

Every user-visible OmniRelay product release must carry a verified knowledge record before production deployment.

## Why this exists

OmniRelay Guide explains the product. The clinic concierge retrieves tenant-owned clinic information. Neither should silently drift from released product behaviour.

## Required release work

1. Add a release record under `docs/knowledge/releases/` and update `docs/knowledge/release-manifest.json`.
2. State the affected feature, user outcome, safe operating limits, and the Guide article(s) updated.
3. Update the verified OmniRelay Guide catalogue when product help changes.
4. Do not treat generated text as verified knowledge; a maintainer must review the record.
5. Run CI. Functional source changes require the manifest and its referenced release record to change in the same release.

## RAG indexing and cost control

- Product knowledge is versioned in source and follows the release gate.
- Tenant clinic RAG remains tenant-owned. Only an owner or admin may index approved FAQ, policy, service, or business-information documents.
- Indexing compares document chunks. It embeds only added or changed chunks; unchanged chunks are retained without embedding use.
- Clinical guidance and patient data are excluded from this retrieval path.
- Indexing does not activate a customer-facing agent or WhatsApp. The agent stays in training until separate supervised acceptance is approved.

## Release record format

Each record must identify the product areas changed, verified Guide articles, RAG impact (`none`, `guide_only`, or `tenant_indexing`), and verification performed. Never put patient data, credentials, production tokens, or customer message contents in a release record.
