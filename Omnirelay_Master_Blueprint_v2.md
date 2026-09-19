# OmniRelay: Platform Architecture Blueprint
**Version:** 2.0 (AI Autopilot & OEM Expansion Edition)
**Audience:** CTO / Fullstack Engineering Team

## 1. System Overview & Core Philosophy
OmniRelay is an orchestration platform designed as a **Managed AI Employee layer** for local businesses and D2C retailers. Rather than providing standard SaaS dashboards, OmniRelay relies on a human-in-the-loop "Approval Architecture." 

Complex operations (Meta Ads API management, complex WhatsApp flow routing, Video generation, Market Research) are abstracted into headless services. Business owners interact exclusively through a unified **Action Centre** to approve, edit, or reject AI-generated drafts.

### Tech Stack
- **Frontend/Framework:** Next.js 14 (App Router), React, TailwindCSS, Lucide Icons, PWA Optimized.
- **Backend/Database:** Supabase (PostgreSQL, RLS, Auth, Storage).
- **AI/Inference:** Gemini Pro Vision / Sonnet (Gatekeepers) + Hermes Agent / LLMs for planning.
- **Creative & Scrape:** Topview/Higgsfield (Creative APIs) + ScrapeGraphAI (Web Intelligence).
- **Integrations:** Meta Conversions API (CAPI), Meta Commerce Manager, WhatsApp Cloud API, MCP (Model Context Protocol).

---

## 2. Core Modules (Latest Implementation State)

### 2.1 The Approval Loop (Human-in-the-Loop)
This is the central nervous system of OmniRelay.
*   **Database (`ai_agent_drafts`):** A unified queue for all AI-generated drafts (Ads, Emails, Messages).
*   **Action Centre UI:** The master inbox. Users read the AI's logic (e.g., "Your ad is losing money, I recommend pausing it") and click **Approve**. 
*   **MCP Gateway (`/api/agents/mcp/meta`):** When approved, the command is routed through an internal Model Context Protocol gateway to execute the database or Meta API changes autonomously.

### 2.2 Retail Vertical: Meta Ads Autopilot
A zero-friction media buying module allowing D2C brands to launch and manage ads without touching Facebook Business Manager.
*   **Catalog Sync:** Live XML feed of `retail_catalog` for Commerce Manager.
*   **Server-Side Tracking:** `syncPurchaseToMeta` fires conversions directly via CAPI.
*   **Scale/Prune Agent:** A background intelligence worker that scans active campaigns. If ROAS drops below 2.0x, it queues a "Pause Campaign" draft in the user's Action Centre.

### 2.3 The Creative Velocity Engine & AI Vision Gate
An autonomous pipeline for assembling high-converting ad media.
*   **File Upload & Storage:** Users snap a product photo directly from their mobile device, instantly saving to Supabase `creative-assets` bucket.
*   **AI Vision Gatekeeper:** The photo is verified by AI for lighting, clarity, and product focus. If it fails (e.g., blurry), the pipeline aborts and forces the user into a "Retake" loop. "Garbage in, garbage out" is eliminated.
*   **Rendering:** Verified images are routed to Topview/Higgsfield integrations to render final MP4s.

### 2.4 Autonomous Trend Intelligence (ScrapeGraphAI)
Turns OmniRelay from a generic AI into a data-driven media sniper.
*   **Keyword-Driven Research (`/app/retail/trends`):** The user types a product niche (e.g., "Ladies Kurti").
*   **Hermes ScrapeGraph Integration:** The Python agent uses `SearchGraph` to autonomously scour the internet, TikTok, and Meta Ad Libraries to find viral content for that keyword.
*   **Data Injection:** The agent extracts the Top Hooks, Visual Styles, Trending Hashtags, and Engagement Signals. This exact data is automatically injected into the Creative Engine prompts to guarantee viral, trend-jacked outputs.

### 2.5 OEM Master Control & Autopilot (Platform Admin)
The God-Mode dashboard (`/admin`) for the platform owner to manage tenants.
*   **Feature Gating (Subscription Tiers):** Instantly toggle a user between `STANDARD` and `PREMIUM` (unlocking the Creative Engine & ScrapeGraph features globally via RLS).
*   **Sandbox Mode (`is_demo`):** Safely mock all external APIs (Meta, Topview) to allow for safe sales demonstrations and investor pitches without spending real money.
*   **OEM Autopilot (Chief of Staff AI):** A background worker that monitors all tenants for churn risk (e.g., hasn't run an ad in 3 days). It queues check-in messages in a dedicated `oem_agent_drafts` inbox for the platform owner to approve.

### 2.6 Clinical Vertical: WhatsApp Booking Concierge
*   **Webhook (`/api/whatsapp`):** Ingests incoming patient queries.
*   **Booking Engine:** Cross-references intent with provider availability using WhatsApp interactive templates for frictionless scheduling.

---

## 3. Database Architecture (Supabase)
Strict multi-tenant architecture enforced by PostgreSQL Row-Level Security (RLS). 

**Key Tables:**
1.  **`organizations` & `onboarding_profiles`:** Identity, tenant isolation, and `subscription_tier`.
2.  **`ai_agent_drafts` & `oem_agent_drafts`:** Operational state and AI event queues (Tenant level vs Admin level).
3.  **`trend_intelligence_reports`:** Stores ScrapeGraphAI keyword research and JSON payloads.
4.  **`retail_catalog`, `orders`, & `retail_creatives`:** E-commerce entities.

---

## 4. Next Steps for Engineering (To-Do)
*   **Live Meta API Keys:** The backend logic and MCP gateways are built. The next phase is mapping the `is_demo=false` requests to the real Facebook Business APIs (Graph API).
*   **Live Python Hermes Connection:** Wire the Next.js `runScrapeGraphPipeline` directly to a live, hosted Python `HERMES_AGENT_URL` running the ScrapeGraph endpoints.
*   **Deploy:** Push the Next.js frontend to Vercel/Render and run final live production tests on mobile PWA.
