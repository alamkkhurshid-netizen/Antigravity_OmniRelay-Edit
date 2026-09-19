# Guide and RAG knowledge foundation — 12 September 2026

## Product outcome

OmniRelay Guide now contains verified help for reception boards, named multi-doctor operations, Follow-up Desk, medication-reminder boundaries, and doctor-specific emergency notices.

The clinic concierge now has a tenant-isolated semantic retrieval path with cited sources. It retrieves only approved non-clinical clinic FAQ, policy, service, and business-information records.

## What users should know

- Guide remains product help only; it cannot access tenant records, patient data, credentials, or payment details.
- The concierge remains in training. It is not activated for customer-facing WhatsApp replies by this release.
- An owner or administrator can index changed knowledge from AI Agents. The indexer reuses unchanged chunks and embeds only added or edited chunks.
- Clinical guidance and patient data cannot enter the concierge RAG retrieval path.

## Guide articles updated

- `reception-board`
- `multi-doctor-operations`
- `follow-up-desk`
- `doctor-emergency-notice`
- `guide-boundaries`

## Verification

- Full build and 262 automated tests passed.
- Retrieval RPC is tenant-bound, server-only, cited, and excludes non-approved or clinical source types.
- Browser roles have no direct access to raw RAG chunks or embeddings.

## RAG impact

`tenant_indexing`: an administrator may index approved tenant documents. This is explicit and does not run simply because a code release is deployed.
