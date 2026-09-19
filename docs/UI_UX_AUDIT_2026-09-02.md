# OmniRelay UI/UX audit — 2 September 2026

Scope: authenticated OmniRelay application routes. The review used the deployed UI, the current source, and the supplied signed-in screenshots. It is focused on a calm, premium operational product for non-technical business owners.

## Route coverage

| Area | Routes reviewed |
| --- | --- |
| Workspace | Overview, Action centre, Conversations, Contacts, Care plans, Team operations |
| Clinic operations | Appointments, Clinic operations, Booking concierge, Business setup |
| Automation | Care reminders, Campaigns, Integrations, AI agents, Operations centre |
| Administration | Go-live readiness, Activity logs, Plans & billing |

## Critical — corrected in this release

| Issue | Evidence | Root cause | Correction |
| --- | --- | --- | --- |
| App headings render with crushed, overlapping letters | `ee8a57c6-409b-4436-8d9c-315e55bb9a54.png`; `82c52fce-5a22-43df-8dcb-abde7f949023.png` | A marketing-page `h2` rule applied a `-3px` letter-spacing to application headings. | Scoped the app heading rhythm so dashboard headings retain their intended font sizes and readable tracking. |
| Account menu is covered by the red alert banner | `d2c98ca8-7812-4a65-8843-59fe0f530633.png` | The sticky alert used a higher stacking layer than the account popover. | Raised account-menu layers above the alert; added a separate, lower alert layer. |

## High — corrected in this release

| Issue | Evidence | Root cause | Correction |
| --- | --- | --- | --- |
| Sidebar exposes 18 flat choices | All reviewed app routes | Navigation grew feature-by-feature without grouping. | Grouped navigation into Workspace, Patient care, Automation & engagement, and Administration. The two advanced groups start collapsed, while the current group stays open. |
| Developer-stage wording is visible to customers | `d2c98ca8-7812-4a65-8843-59fe0f530633.png` | Pilot engineering labels were reused in the customer UI. | Replaced `Controlled rollout`, `Managed execution gate`, `Collecting evidence`, and `Ready for CTO review` with customer language: Automation readiness, Monitored testing, Needs attention, and Ready to activate. |
| Red alert has no dismissal and dominates every page | `d2c98ca8-7812-4a65-8843-59fe0f530633.png` | A single global critical state was rendered as a permanent banner. | The banner remains for the current critical item, links to review, and can be dismissed locally. The bell badge and Action centre remain the durable notification surfaces. |
| Business setup accepts invalid phone, postal code and URL inputs | `82c52fce-5a22-43df-8dcb-abde7f949023.png` | Form fields had no browser or submit-time format checks. | Added live invalid states and clear inline feedback; saving now blocks invalid business/location phone, postal code, website and empty business/location names. |
| Guide chip can crowd the sticky business-setup save action | `82c52fce-5a22-43df-8dcb-abde7f949023.png` | Both controls used the same bottom-right fixed area. | Moves the Guide launcher above the business-setup save bar, including mobile. |

## High — needs a dedicated access-control release

| Issue | Evidence | Root cause | Required fix |
| --- | --- | --- | --- |
| An expired trial can still show and permit the normal dashboard | Reported during audit; current layout only displays trial copy | Entitlements are displayed but are not enforced at every mutation boundary. | Use a server-enforced 14-day read-only grace state: allow viewing records and Billing, block all mutations in API/RPC routes, then route to renewal. A UI-only lock would be misleading and unsafe, so it is not included in this UI release. |

## Medium

| Issue | Affected areas | Proposed next improvement |
| --- | --- | --- |
| Small text is inconsistent; several operational labels fall below comfortable reading size | Automation, setup, inbox, activity, operations | Establish a minimum 12px customer-facing metadata scale and a 14/16px default body scale; retain smaller text only for nonessential supporting labels. |
| Search icon has no visible search workflow | Global header | Either open a command/search panel for contacts, bookings and settings, or remove it until search exists. |
| Empty states vary in tone and available next actions | Conversations, campaigns, some operational ledgers | Standardise each empty state as: purpose, what is missing, one primary next action. |
| State chips rely heavily on color | Automation, care plans, notifications | Keep text labels, add an icon/shape distinction, and use a single semantic state palette. |
| Page headers vary between product, engineering and status terminology | Automation, integrations, go-live readiness | Apply a route-level content pass after the access-control release: short title, one-sentence explanation, one next action. |

## Low

| Issue | Proposed improvement |
| --- | --- |
| Mixed text glyphs act as navigation icons | Replace them gradually with one consistent accessible icon set. |
| Some long route labels are visually dense | Use short labels in navigation with explanatory page subtitles. |
| Alert animation is visually strong for persistent problems | Reserve pulse for newly raised critical alerts; leave acknowledged alerts steady. |

## Notification hierarchy

1. **Critical:** dismissible top banner, Action centre card, notification bell badge; only actions that risk service failure.
2. **Needs attention:** Action centre and bell badge; no global red banner.
3. **Informational:** activity log or in-context success message only.

## Release checks

- Verify heading readability at desktop, tablet and 360px mobile width.
- Open the account avatar while a critical alert is visible.
- Try invalid phone, postal code and website formats in Business setup.
- Confirm the Guide launcher clears the sticky save action.
- Confirm the current navigation group opens while advanced groups remain collapsed by default.

## Explicit non-change

No Meta/WhatsApp configuration, database data, patient data, or production messaging configuration is changed by this UI release.
