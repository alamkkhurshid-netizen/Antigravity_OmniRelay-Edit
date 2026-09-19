# OmniRelay workspace type scale

New workspace UI uses shared type tokens rather than one-off font sizes.

| Token | Use | Definition |
| --- | --- | --- |
| `or-type-page` | Primary page and hero title | `text-3xl sm:text-4xl` |
| `or-type-section` | Major panel or queue title | `text-2xl` |
| `or-type-card` | Card and control title | `text-xl` |
| `or-type-stat` | Numeric metric value | `text-3xl` |
| `or-type-label` | Eyebrows, metric labels and navigation group labels | `text-xs` |

`StatCard` is the single workspace metric-card primitive. `AppShell` is the single workspace navigation shell for every `/app/*` route.
