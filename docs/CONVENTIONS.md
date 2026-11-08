# OmniRelay Architecture & Code Conventions

**Status:** Active  
**Last Updated:** October 2026

---

## 1. Component Boundaries & Directives

- **Server Components (Default):** All Next.js page components and layout components MUST be Server Components unless they require state (`useState`), effects (`useEffect`), browser events, or browser APIs.
- **Client Components (`"use client"`):** Must be placed strictly at the interactive leaf level. Keep client components as small and focused as possible.
- **Server Actions / API Handlers (`"use server"`):** Mutations must use Server Actions or dedicated Next.js Route Handlers (`app/api/**/route.ts`).

---

## 2. Shared UI Components (`@/components/ui`)

All new or refactored UI elements must use the core design primitives:
- **Buttons & Badges:** `Button`, `Badge`, `StatusBadge`
- **Cards & Layout:** `Card`, `SectionCard`, `PageHeader`, `EmptyState`
- **Form Controls:** `Input`, `Textarea`, `Select`, `Switch`, `Label`
- **Data Display:** `Table`, `DataTable`, `Tabs`, `Dialog`, `Dropdown`, `Avatar`, `Tooltip`, `Skeleton`

Import all primitives via `@/components/ui`:
```tsx
import { Button, Card, PageHeader, StatusBadge } from "@/components/ui";
```

---

## 3. Data Fetching & Mutations

- **Server Components:** Fetch data directly using `createClient()` from `@/lib/supabase/server`.
- **Client Components:** Use custom React hooks or SWR/React Query patterns. Never call direct database mutations from client components without server authentication or RPC wrappers.
- **API Handlers:** Standardize response formats using `@/lib/api-response`:
  - `apiSuccess(data, statusCode)`
  - `apiError(message, statusCode, code, details)`
  - `apiValidationError(details)`

---

## 4. Supabase Client Usage

- **Server-side (Route Handlers, Server Components, Server Actions):**
  ```ts
  import { createClient } from "@/lib/supabase/server";
  const supabase = await createClient();
  ```
- **Client-side:**
  ```ts
  import { createClient } from "@/lib/supabase/client";
  const supabase = createClient();
  ```
- **Service-Role (Background workers, webhooks, system cron only):**
  Never expose `SUPABASE_SERVICE_ROLE_KEY` to client-side bundles or public endpoints.
