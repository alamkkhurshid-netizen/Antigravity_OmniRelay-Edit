# OmniRelay: Commercial Pricing Architecture & Vertical Landing Pages Roadmap

This document serves as the persistent architectural and commercial reference for OmniRelay's voice AI pricing, unit economics, and planned dedicated marketing pages.

---

## 1. Unit Economics & Cost of Goods Sold (COGS)

| Component | Provider Used | Cost per Minute (INR) | Notes |
| :--- | :--- | :--- | :--- |
| **Telecom Carrier** | Exotel Inbound SIP/WebSocket | ~₹0.45 | Real-time carrier audio streaming |
| **Speech-to-Text (STT)** | Deepgram Nova-3 (8,000 Hz) | ~₹0.35 | Low-latency sub-150ms transcription |
| **LLM Inference** | Groq LPU (`qwen/qwen3.8-27b`) | ~₹0.03 | Ultra-fast LPU inference (sub-250ms) |
| **Text-to-Speech (TTS)**| Cartesia Sonic (PCM 16-bit) | ~₹0.50 | Maya voice (`cbaf8084`) |
| **Cloud Infrastructure**| Oracle Cloud VM + Redis | ~₹0.05 | High-availability compute & cluster cache |
| **Total Production Cost** | **End-to-End Stack** | **~₹1.38 / minute** | **Hard Floor Cost** |

---

## 2. Customer Pricing Structure & Tiers

The standard commercial voice rate calibrated in `billing_meter.py` is **₹3.99 / minute**, delivering a **~65% gross profit margin** on usage.

```
                  ┌────────────────────────────────────────┐
                  │      OmniRelay SaaS Commercial Tiers   │
                  └────────────────────────────────────────┘
                                      │
         ┌────────────────────────────┼───────────────────────────┐
         ▼                            ▼                           ▼
┌──────────────────┐        ┌──────────────────┐        ┌──────────────────┐
│  Tier 1: Starter │        │   Tier 2: Pro    │        │ Tier 3: Hospital │
│      Clinic      │        │    Healthcare    │        │    Enterprise    │
├──────────────────┤        ├──────────────────┤        ├──────────────────┤
│ ₹2,499 / month   │        │ ₹5,999 / month   │        │ ₹14,999+ / month │
│ 500 AI minutes   │        │ 1,500 AI minutes │        │ 5,000+ AI mins   │
│ Smart Forwarding │        │ Dedicated Line   │        │ Multi-department │
│ (*401*)          │        │ Multilingual AI  │        │ Custom EMR sync  │
│ Extra: ₹3.99/min │        │ Extra: ₹3.49/min │        │ Human Escalation │
└──────────────────┘        └──────────────────┘        └──────────────────┘
```

### Detailed Tier Specifications

#### 🥉 Tier 1: Starter Clinic (Smart Forwarding `*401*`)
* **Price:** **₹2,499 / month**
* **Included:**
  * 500 included AI voice minutes (~150 patient appointments).
  * Uses the clinic's existing mobile/landline number via Smart Forwarding (`*401*08047291019#`).
  * Automated appointment booking + Doctor calendar sync.
  * Instant post-call WhatsApp/SMS confirmation.
  * Over-quota rate: **₹3.99 / minute**.

#### 🥈 Tier 2: Pro Healthcare (Dedicated Phone Line)
* **Price:** **₹5,999 / month**
* **Included:**
  * 1,500 included AI voice minutes (~450 patient appointments).
  * **Dedicated 10-digit virtual phone line** or regional landline (e.g., `080-4729-XXXX`).
  * Real-time doctor availability check + multi-doctor roster.
  * Multi-lingual auto-switching (English, Hindi, Kannada, Telugu).
  * Persistent Caller Memory (recognizes returning patients by name & past doctor).
  * Over-quota rate: **₹3.49 / minute**.

#### 🥇 Tier 3: Hospital & Enterprise Chain
* **Price:** **₹14,999+ / month** (Custom billing)
* **Included:**
  * 5,000+ included AI voice minutes.
  * Dedicated multi-channel trunking (handles 50+ simultaneous patient calls).
  * Custom EHR/EMR bidirectional synchronization (Practo, Clinicea, KareXpert).
  * Front-desk warm human receptionist transfer & emergency triage (108 bypass).
  * Dedicated Account Manager + 99.9% uptime SLA.

---

## 3. Dedicated Vertical Pages Roadmap (`omnirelay.app` & `omnirelay.in`)

To maximize conversion and provide industry-tailored value propositions, the public web properties will feature dedicated vertical landing pages:

### Page 1: `/hospital` (Hospital & Inpatient Care)
* **Headline:** *"Zero Missed Calls. 24/7 AI Voice Reception for Multi-Specialty Hospitals."*
* **Core Capabilities Highlighted:**
  * Multi-department routing (OPD, Emergency, Diagnostics, Billing).
  * Emergency Triage: Immediate detection of life-threatening symptoms and transfer to ER / 108.
  * Hospital EMR integration and high-concurrency line management.
* **Pricing Section:** Transparent breakdown of the Tier 3 Enterprise Hospital Package.

### Page 2: `/clinic` (Private Practices, Dentists, & OPDs)
* **Headline:** *"Your Clinic's 24/7 AI Receptionist on Your Existing Phone Number."*
* **Core Capabilities Highlighted:**
  * **30-Second Smart Forwarding (`*401*`):** No new SIM, no number change on Google Maps or prescription pads.
  * Real-time slot booking with Dr. Sarah Sharma or any clinic doctor.
  * WhatsApp appointment slips sent automatically to the patient after every call.
* **Pricing Section:** Clear side-by-side comparison of **Tier 1 (₹2,499/mo)** and **Tier 2 (₹5,999/mo)**.

### Page 3: `/retail` (E-Commerce, Direct-to-Consumer, & Showrooms)
* **Headline:** *"Turn Inbound Phone Calls into Instant Orders and Real-Time Package Tracking."*
* **Core Capabilities Highlighted:**
  * Powered by the **Priya** persona (Retail Customer Care).
  * Order status tracking via phone number (`check_order_status`).
  * Catalog inquiries, store operating hours, and return policy queries.
* **Pricing Section:** Pay-as-you-grow volume pricing for high-traffic retail.

### Page 4: `/hospitality` (Hotels, Resorts, & Luxury Dining)
* **Headline:** *"Five-Star Voice Concierge for Table Reservations and Guest Inquiries."*
* **Core Capabilities Highlighted:**
  * Powered by the **Aria** persona (Guest Relations).
  * Room booking inquiries, dining table reservations, and amenities guidance.
  * Seamless transfer to human concierge for VIP guests.

---

## 4. Flexible Billing Collection Models (Customer Choice)

During checkout or onboarding, every client (clinic or hospital) is given the **choice between two payment collection models** to suit their internal accounting and financial workflow:

```
                      ┌─────────────────────────────────────────┐
                      │    Customer Checkout: Payment Choice     │
                      └─────────────────────────────────────────┘
                                           │
                 ┌─────────────────────────┴─────────────────────────┐
                 ▼                                                   ▼
     ┌────────────────────────┐                          ┌────────────────────────┐
     │   Option A: Auto-Debit │                          │ Option B: Pay Monthly  │
     │   (UPI Autopay/Mandate)│                          │ (Manual GST Invoice)   │
     ├────────────────────────┤                          ├────────────────────────┤
     │ • Cashfree Subscriptions│                          │ • 30-day billing cycle │
     │ • 1-time setup via UPI │                          │ • Invoice on Day 27    │
     │ • Auto-renews monthly  │                          │ • 3-Day Grace Period   │
     │ • Zero admin overhead  │                          │ • Netbanking/Cards/UPI │
     │ • Best for Solo Clinics│                          │ • Best for Hospitals   │
     └────────────────────────┘                          └────────────────────────┘
```

### Option A: Automated Recurring Debit (UPI Autopay / Card e-Mandate)
* **How it works:** 
  * Powered by Cashfree Subscriptions API.
  * During the initial checkout, the customer registers a recurring mandate via UPI (Google Pay, PhonePe, Paytm, BHIM) or an authorized Credit/Debit Card.
  * Under RBI guidelines (effective for recurring payments up to ₹15,000), monthly recurring fees (e.g. Starter ₹2,499, Pro ₹5,999, Hospital ₹14,999) are debited automatically without requiring an OTP each cycle.
* **Benefits:** 
  * Zero phone downtime; services never get paused due to forgotten invoices.
  * Ideal for busy doctors, solo dental practices, and outpatient clinics.

### Option B: Manual Monthly Invoice (Corporate / Accounts Approval)
* **How it works:**
  * Standard 30-day SaaS entitlement cycle.
  * On Day 27 of each cycle, the system automatically generates and emails a verified GST Tax Invoice (with CGST/SGST/IGST breakdown and HSN/SAC code).
  * Includes an automated WhatsApp reminder to the clinic manager or finance desk with a 1-click Cashfree payment link.
  * Features a built-in **3-day grace period** (`grace_ends_at = period_end + 3 days`) so that internal accounting approvals or bank transfer delays do not disrupt active patient phone lines.
* **Benefits:**
  * Accommodates hospital finance departments requiring formal purchase orders, GST input credit filing, or TDS deductions before payment release.

### Voice Minute Overage Handling (Common to Both Options)
* For both Option A and Option B, extra minutes beyond the plan's bundled minutes (e.g., beyond 5,000 minutes) are debited in real time from their **Prepaid Usage Wallet** at their contracted tier rate (₹2.99 – ₹3.99/min).
* If the wallet balance runs low, the system provides automated low-balance WhatsApp alerts and triggers an emergency safety buffer (`-₹50`) to guarantee zero call drops during active patient conversations.


