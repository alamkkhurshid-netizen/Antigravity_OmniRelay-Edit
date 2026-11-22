export interface KnowledgeCard {
  id: string;
  title: string;
  category: string;
  paths: string[];
  keywords: string[];
  what: string;
  why: string;
  how: string[];
  watchOut: string[];
  examples: string[];
  quickAction?: { label: string; href: string };
  faqs?: Array<{ q: string; a: string }>;
}

export const OMNIRELAY_MASTER_KNOWLEDGE: KnowledgeCard[] = [
  // ==========================================
  // 1. BROADCAST CAMPAIGNS & PATIENT OUTREACH
  // ==========================================
  {
    id: "campaigns-broadcast-composer",
    title: "Campaigns & Broadcast Composer",
    category: "Campaigns",
    paths: ["/app/campaigns"],
    keywords: [
      "campaign", "broadcast", "campaigns", "bulk message", "bulk whatsapp", "marketing campaign",
      "care campaign", "emergency notice", "audience", "dispatch", "poster", "flyer"
    ],
    what: "Campaigns is OmniRelay's Broadcast Composer for delivering health packages, screening camps, clinic announcements, and emergency notices to patient WhatsApp numbers. It supports both registered CRM patients and external CSV contact uploads with approved Meta WhatsApp templates.",
    why: "Clinics often need to announce new doctors, seasonal health checkup camps, or holiday hours to hundreds of patients without being banned by Meta. OmniRelay guarantees 100% Meta compliance by validating template parameters, filtering communication opt-outs, and separating Utility from Marketing broadcasts.",
    how: [
      "Click 'New campaign' on the Campaigns page (/app/campaigns).",
      "Select Campaign Type: Marketing (Health Packages, Eye Camps), Care Update (Chronic Recall, Health Guidance), or Emergency Disruption.",
      "Select Audience Source: Choose 'All consented CRM patients' or upload an external CSV list.",
      "Select the approved Meta template matching your category.",
      "Type the message details (which bind directly into Meta template variable {{3}}).",
      "Attach an image flyer (JPEG/PNG up to 10MB) or PDF brochure tariff sheet (up to 10MB) if desired.",
      "Optionally add a website or booking link (e.g., https://omnirelay.in/book/neoclinic) to render a one-tap appointment button.",
      "Review the real-time WhatsApp preview bubble and click 'Schedule Campaign'."
    ],
    watchOut: [
      "Marketing campaigns can only be sent to patients who have given marketing consent.",
      "Patients who reply STOP are automatically added to the opt-out registry and will be skipped from future broadcasts.",
      "Media attachments are automatically purged from secure storage after the campaign is completed to protect patient data and save storage fees."
    ],
    examples: [
      "Free Eye & Vision Screening Camp: Sent to 250 patients with an attached eye camp flyer and a direct booking link.",
      "Preventive Full Body Checkup at ₹999: Delivered to dormant patients with an attached PDF test package tariff sheet."
    ],
    quickAction: { label: "Open Campaigns", href: "/app/campaigns" },
    faqs: [
      {
        q: "Can I send photos or PDF brochures with my campaign?",
        a: "Yes! OmniRelay supports direct upload of JPEG/PNG images (up to 10MB) and PDF documents (such as test tariff brochures). These are delivered as WhatsApp media cards."
      },
      {
        q: "What happens to uploaded campaign files after dispatch?",
        a: "All campaign images and PDFs are automatically purged from the database and storage post-dispatch to maintain zero-PHI data safety and optimize clinic storage costs."
      }
    ]
  },
  {
    id: "campaigns-csv-upload",
    title: "Campaign CSV Audience Upload & Sample Template",
    category: "Campaigns",
    paths: ["/app/campaigns"],
    keywords: [
      "csv", "excel", "upload contacts", "sample csv", "import phone numbers", "audience upload",
      "download sample", "e164", "phone format", "contact list"
    ],
    what: "The CSV Audience Upload feature allows clinics to import existing patient lists from Excel or external hospital management systems into a campaign. OmniRelay provides a downloadable sample CSV template with pre-validated headers (`phone`, `name`, `health_concern`).",
    why: "Many clinics maintain patient databases in Excel or billing software. This feature eliminates manual typing, formats phone numbers to international E.164 standards (+91 for India), and flags invalid or duplicate rows before sending.",
    how: [
      "Open the New Campaign modal and click 'Upload CSV Contact List'.",
      "Click 'Download Sample CSV' to get the correctly formatted template.",
      "Fill your patient details in Excel or Google Sheets and save as .CSV.",
      "Upload your file via drag-and-drop or file picker.",
      "OmniRelay instantly parses the rows, displaying valid contacts, duplicates removed, and invalid rows."
    ],
    watchOut: [
      "Phone numbers must include country code (e.g. +91 98315 82626) or 10 digits (9831582626). OmniRelay automatically standardizes them.",
      "Duplicate phone numbers in the CSV are automatically merged to prevent sending duplicate messages to the same patient."
    ],
    examples: [
      "A clinic exports 500 cardiac checkup patients from its desktop software, uploads the CSV into a Diwali Health Checkup campaign, and reaches them in under 2 minutes."
    ],
    quickAction: { label: "Open Campaigns", href: "/app/campaigns" }
  },

  // ==========================================
  // 2. WHATSAPP INTEGRATION & META CLOUD API
  // ==========================================
  {
    id: "whatsapp-meta-integration",
    title: "WhatsApp Cloud API & Coexistence Mode",
    category: "Integrations",
    paths: ["/app/integrations"],
    keywords: [
      "whatsapp", "meta", "cloud api", "coexistence", "embedded signup", "waba", "phone id",
      "meta connection", "qr", "live status", "whatsapp business"
    ],
    what: "WhatsApp Integration connects the clinic's business phone number directly to Meta Cloud API via Meta Embedded Signup. It supports both dedicated Cloud API numbers and 'Coexistence Mode' where clinic staff retain their existing WhatsApp Business mobile app while OmniRelay automates reminders in the background.",
    why: "Clinics cannot afford to lose their existing WhatsApp chat history or give up their mobile phone app. Coexistence allows OmniRelay to send official template messages while the clinic continues chatting on their phone app.",
    how: [
      "Navigate to Integrations (/app/integrations).",
      "Click 'Continue with Meta' to start the official Embedded Signup popup.",
      "Log in to your Meta Business Manager and select your WhatsApp Business Account (WABA).",
      "If Meta offers Coexistence for your existing number, select it to keep your phone app active. If not, connect a dedicated business SIM.",
      "Verify via 6-digit SMS/Voice OTP. OmniRelay records the connection and provisions webhooks automatically."
    ],
    watchOut: [
      "Never disconnect a live number without guidance as it pauses all automated appointment reminders.",
      "Coexistence availability is determined by Meta based on phone number history and account standing."
    ],
    examples: [
      "Neoclinic connected +91 89108 60959 in Coexistence mode. Receptionists reply on their Android phone while OmniRelay sends automated 24h reminders from the Cloud API."
    ],
    quickAction: { label: "Go to Integrations", href: "/app/integrations" }
  },
  {
    id: "whatsapp-template-library",
    title: "WhatsApp Template Library (11 UI Cards vs 14 Triggers)",
    category: "Integrations",
    paths: ["/app/integrations"],
    keywords: [
      "templates", "approved templates", "11/11", "14 templates", "meta templates",
      "template readiness", "template approval", "confirmation template", "reminder template"
    ],
    what: "The Template Library manages the pre-approved WhatsApp message formats required by Meta. OmniRelay organizes all 14 underlying database event triggers into 11 human-readable operational cards: Confirmation, Appointment Reminders (combining 24h & 2h), Cancellation, Reschedule, Follow-Up, Doctor Shift Roster, Emergency Notice, Booking Resume, Payment Action, Care Campaign, and Marketing Campaign.",
    why: "Meta strictly prohibits sending free-form automated WhatsApp messages outside the 24-hour service window. Pre-approved templates ensure 100% deliverability for appointment reminders, clinic notices, and prescription follow-ups without risk of phone number banning.",
    how: [
      "OmniRelay automatically seeds all standard healthcare templates into your Meta WABA upon connection.",
      "The Integrations page displays the real-time readiness status (e.g., '11/11 Meta-approved utility messages').",
      "When an appointment is booked or rescheduled, OmniRelay automatically injects the patient name, doctor, and date/time into the corresponding approved template."
    ],
    watchOut: [
      "11/11 displayed on the dashboard represents 100% template readiness. All 14 underlying triggers are fully covered because 24h & 2h reminders are bundled into a single card.",
      "Never alter variable place-holders like {{1}} or {{2}} directly in Meta Business Manager without updating OmniRelay variable maps."
    ],
    examples: [
      "Booking Confirmation: 'Hello Rahul, your appointment with Dr Ananya Sen is confirmed on 22 Nov at 11:00 AM. Chamber 1. Reference: OR-28491.'"
    ],
    quickAction: { label: "View Template Library", href: "/app/integrations" }
  },

  // ==========================================
  // 3. APPOINTMENTS & CLINIC SCHEDULING
  // ==========================================
  {
    id: "appointments-calendar-manager",
    title: "Appointments & Multi-Doctor Scheduling",
    category: "Appointments",
    paths: ["/app/appointments"],
    keywords: [
      "appointment", "appointments", "book appointment", "calendar", "slot", "availability",
      "doctor shift", "chamber", "reschedule", "cancel appointment", "double booking"
    ],
    what: "The Appointments Manager is the operational calendar for clinic receptionists and doctors. It provides Week and Agenda views, slot calculation, double-booking prevention, attendance updating, clinical documentation, and instant WhatsApp confirmations.",
    why: "Double-booking and scheduling chaos damage clinic reputation. OmniRelay uses database-level exclusion locks so two patients can never be scheduled in the same chamber with the same doctor at the same time.",
    how: [
      "Open Appointments (/app/appointments).",
      "Click 'New appointment' or choose an open calendar slot.",
      "Enter patient details, choose doctor, chamber, service, and start time.",
      "Click 'Create appointment'. OmniRelay locks the slot and sends an instant WhatsApp confirmation to the patient and an in-app Bell alert to clinic staff."
    ],
    watchOut: [
      "Always set up Doctor availability in Business Setup before taking bookings.",
      "To reschedule a patient, use the 'Reschedule' button on their appointment card to select a new live slot rather than creating a duplicate booking."
    ],
    examples: [
      "Dr. Alam visits Mon, Wed, Fri from 10:00 AM to 1:00 PM. OmniRelay generates 15-minute bookable slots and marks them unavailable as soon as patients book."
    ],
    quickAction: { label: "Open Appointments", href: "/app/appointments" }
  },
  {
    id: "appointments-today-reception-board",
    title: "Reception Today Board & Patient Queue",
    category: "Appointments",
    paths: ["/app/appointments"],
    keywords: [
      "today board", "reception board", "mark arrived", "token", "patient queue",
      "in consultation", "complete visit", "consultation note", "diagnosis"
    ],
    what: "The Reception Today Board is a fast, streamlined view for receptionists managing the physical OPD queue. Staff can mark patients as 'Arrived', advance them to 'In Consultation', document clinical notes/diagnosis, and mark visits 'Completed' or 'No-show'.",
    why: "Front desk staff do not have time to navigate complex EHR software while patients are waiting. The Today Board allows one-click status transitions and creates clean audit trails.",
    how: [
      "Select 'Agenda / Today' view on the Appointments page.",
      "When a patient enters the clinic, click 'Mark arrived'.",
      "When called into the doctor chamber, change status to 'In consultation'.",
      "Upon finish, click 'Document visit' to record doctor notes, diagnosis, and prescription, which automatically schedules follow-up tasks."
    ],
    watchOut: [
      "Marking a patient as 'Completed' requires at least a short clinical note for audit compliance.",
      "If a patient does not arrive, mark them 'No-show' so the analytics dashboard calculates accurate no-show rates."
    ],
    examples: [
      "A patient arrives at 10:45 AM for an 11:00 AM appointment: Reception clicks 'Arrived', alerting the doctor's assistant."
    ],
    quickAction: { label: "Go to Appointments", href: "/app/appointments" }
  },

  // ==========================================
  // 4. WHATSAPP BOOKING CONCIERGE & PAYMENTS
  // ==========================================
  {
    id: "booking-concierge-flow",
    title: "WhatsApp Booking Concierge & QR Entry",
    category: "Concierge",
    paths: ["/app/booking-concierge", "/book"],
    keywords: [
      "booking concierge", "qr code", "wa.me", "doctor directory", "clinic brochure",
      "timings", "front desk", "menu", "patient booking", "self booking"
    ],
    what: "Booking Concierge is OmniRelay's 24/7 automated WhatsApp booking assistant. Patients scan a clinic QR code or tap a wa.me link to view available doctors, read clinic timings, check fees, book slots, make online payments, or speak to reception.",
    why: "Over 60% of appointment requests come after clinic operating hours. The WhatsApp Concierge captures these bookings automatically without human staff having to answer phone calls at night.",
    how: [
      "Generate the clinic QR poster or link from /app/booking-concierge.",
      "Patients scan the QR code which opens WhatsApp with a pre-filled greeting ('Hi').",
      "OmniRelay presents interactive buttons: 1. Choose appointment, 2. Doctor directory & brochure, 3. Clinic timings, 4. Speak to team.",
      "The patient selects doctor, date, and time, enters their name, and receives their confirmed booking reference."
    ],
    watchOut: [
      "Patients can type MENU anytime to restart the concierge flow.",
      "The digital brochure can be automatically generated from registered doctor records or uploaded as a custom PDF in Business Setup."
    ],
    examples: [
      "A mother scans the clinic flyer at 10:30 PM, selects Pediatrician Dr. Roy for tomorrow at 4:30 PM, and receives a confirmed booking with Google Maps directions."
    ],
    quickAction: { label: "Configure Concierge", href: "/app/booking-concierge" }
  },
  {
    id: "booking-payments-razorpay",
    title: "Patient Payment Choices: Pay at Clinic vs Razorpay Deposit",
    category: "Payments",
    paths: ["/app/settings", "/app/billing"],
    keywords: [
      "payment", "razorpay", "deposit", "consultation fee", "pay at clinic", "pay now",
      "online payment", "no-show protection", "refund"
    ],
    what: "OmniRelay supports three flexible payment modes for appointments: 1. Pay at Clinic (cash/card during visit), 2. Pay Now (full fee via Razorpay UPI/cards), and 3. Pay Deposit (nominal advance fee, e.g. ₹100, to secure the slot and eliminate no-shows).",
    why: "Unpaid bookings often result in 20-30% patient no-show rates. Collecting a nominal deposit or advance consultation fee cuts no-shows by more than 85% while giving patients the convenience of instant UPI payments.",
    how: [
      "Configure consultation fees for each doctor in Settings (/app/settings).",
      "Enable payment modes: choose Pay at Clinic, Pay Now, or Pay Deposit.",
      "During booking (via Web or WhatsApp), the patient sees the doctor's fee and can complete Razorpay checkout.",
      "Once payment succeeds, OmniRelay locks the slot and marks payment status as 'paid' or 'deposit_paid'."
    ],
    watchOut: [
      "In demo/test mode, Razorpay test checkout allows full workflow testing without real money.",
      "Payment receipts and references are securely stored in the audit ledger."
    ],
    examples: [
      "For a ₹800 specialist consultation, the clinic requires a ₹150 advance deposit. The patient pays via Google Pay UPI on WhatsApp, securing their appointment."
    ]
  },

  // ==========================================
  // 5. NOTIFICATIONS & MOBILE PWA SYSTEM
  // ==========================================
  {
    id: "notifications-bell-system",
    title: "Dashboard Bell Notifications & Mark Read Actions",
    category: "Notifications",
    paths: ["/app"],
    keywords: [
      "bell", "notification", "notifications", "unread badge", "mark all read",
      "booking notification", "template approved alert", "alerts", "push notifications"
    ],
    what: "The top-bar Bell Notification system provides instant in-app alerts for clinic owners and staff. It notifies when new appointments are booked, when WhatsApp templates are approved by Meta, when reminders fail, or when urgent patient tasks are overdue.",
    why: "Staff should never have to manually refresh screens or guess whether new bookings came in. The Bell badge increments in real time and provides one-tap navigation directly to the affected record.",
    how: [
      "Whenever a booking occurs (WhatsApp, Web, Voice, or Admin), an alert is instantly posted to the top-right Bell icon.",
      "Click the Bell icon to view the notification list with patient name, doctor, and consultation time.",
      "Click 'Mark all read' to clear unread counts at once, or click an individual notification to mark it read and open the booking directly."
    ],
    watchOut: [
      "The bell notification is for clinic staff and doctors inside the workspace. Patients receive their notifications via WhatsApp.",
      "The dropdown preserves the latest 10 notifications for quick reference even after they have been marked read."
    ],
    examples: [
      "'New Booking: Khurshid Alam with Dr. Ananya Sen on 22 Nov 2026 at 11:00 AM' appears on the bell badge as soon as the patient confirms."
    ]
  },
  {
    id: "notifications-pwa-push",
    title: "PWA Mobile App & Lock-Screen Push Alerts",
    category: "Notifications",
    paths: ["/app"],
    keywords: [
      "pwa", "mobile app", "install app", "service worker", "lock screen alert",
      "web push", "enable alerts", "omnirelay-sw.js", "android", "ios"
    ],
    what: "OmniRelay is a certified Progressive Web App (PWA). Clinic staff can install it directly from Chrome or Safari onto Android, iPhone, Windows, or Mac. It features a background Service Worker (`omnirelay-sw.js`) that delivers WebPush alerts to device lock screens even when the browser is closed.",
    why: "Doctors and clinic managers are constantly on the move. PWA push alerts turn their smartphone into an instant clinic monitor without requiring app store downloads or developer licenses.",
    how: [
      "Open https://omnirelay.in in Chrome or Edge and click 'Install OmniRelay' or 'Add to Home Screen'.",
      "Click 'Enable alerts' in the top header or notification dropdown to grant push permissions.",
      "OmniRelay registers the device via WebPush. When a booking or emergency disruption occurs, an alert sounds on the phone's lock screen.",
      "Tapping the lock-screen notification opens OmniRelay directly to the appointment."
    ],
    watchOut: [
      "On iOS devices, WebPush requires iOS 16.4+ and adding the app to the Home Screen via Safari.",
      "Push alerts contain zero sensitive clinical data (Zero-PHI compliant) to prevent exposure on public lock screens."
    ],
    examples: [
      "A doctor receives a lock-screen notification at 8:00 AM: 'New Booking: Ananya Sen with Dr. Roy at 10:30 AM' while commuting to the clinic."
    ]
  },

  // ==========================================
  // 6. PATIENT 360 & CONTINUED CARE
  // ==========================================
  {
    id: "contacts-patient-360",
    title: "Contacts & Patient 360 Records",
    category: "Patients",
    paths: ["/app/contacts"],
    keywords: [
      "contacts", "patient", "patients", "patient 360", "medical record", "guardian",
      "family booking", "consent", "opt in", "duplicate patient"
    ],
    what: "Contacts is the centralized patient directory. It links patient identity, booking history, verified mobile numbers, communication consents (care vs. marketing), guardian/family relationships, digital prescriptions, and encounter clinical notes.",
    why: "Maintaining duplicate patient records leads to missing medical histories and sending messages to wrong numbers. OmniRelay automatically reconciles appointments by phone number to create a unified Patient 360 profile.",
    how: [
      "Navigate to Contacts (/app/contacts).",
      "Search by patient name, phone number, or health concern.",
      "Click a patient to open their comprehensive profile: booking timeline, prescriptions, care tasks, and consent status.",
      "Manage guardian relationships (e.g. parent booking for child) without confusing clinical identities."
    ],
    watchOut: [
      "A booking guardian (e.g. parent) is recorded for coordination but does not compromise the patient's individual clinical record.",
      "Care communications consent is required for reminder workflows; marketing consent is required for promotional broadcasts."
    ],
    examples: [
      "Searching '+919831582626' displays Rahul Sharma's complete timeline: 3 previous visits, 1 active prescription, and an upcoming dental review."
    ],
    quickAction: { label: "Open Contacts", href: "/app/contacts" }
  },
  {
    id: "care-plans-follow-up-desk",
    title: "Follow-Up Desk & Continued Care Recall",
    category: "Care Plans",
    paths: ["/app/care-plans"],
    keywords: [
      "care plan", "follow-up", "follow up desk", "5d", "10d", "15d", "30d",
      "patient recall", "care task", "overdue review", "continuity of care"
    ],
    what: "The Follow-Up Desk automates post-consultation patient recalls. After a clinic session, staff can set follow-up timings (5D, 10D, 15D, 30D, or custom dates) to automatically trigger reminder messages or assign staff follow-up calls.",
    why: "Over 40% of patients fail to complete necessary clinical follow-ups when left to memory. The Follow-Up Desk creates predictable review pipelines, ensuring patient recovery and recurring clinic revenue.",
    how: [
      "Open Care Plans (/app/care-plans).",
      "Use 'Set all' to apply a standard 10-day review for today's OPD batch, adjusting exceptions manually.",
      "OmniRelay assigns a staff owner and calculates the exact recall date.",
      "If the review date arrives without a booking, an alert appears in the Action Centre for staff follow-up."
    ],
    watchOut: [
      "Every care task requires a named staff owner so accountability is clear.",
      "Follow-up plans are for routine clinical continuity, never for emergency triage."
    ],
    examples: [
      "Following a diabetic review, the doctor sets a 30D recall. OmniRelay automatically queues a WhatsApp check-in message 3 days prior to the review date."
    ],
    quickAction: { label: "View Care Plans", href: "/app/care-plans" }
  },

  // ==========================================
  // 7. VOICE AI INTEGRATION
  // ==========================================
  {
    id: "voice-ai-telephony",
    title: "Voice AI Agent & Telephone Booking",
    category: "Voice AI",
    paths: ["/app/agents"],
    keywords: [
      "voice", "voice ai", "phone call", "telephony", "voice booking", "call log",
      "reception escalation", "voice availability", "audio recording"
    ],
    what: "Voice AI is OmniRelay's conversational telephone assistant. It answers incoming clinic phone calls, checks doctor availability in real time, books appointments over voice, logs call transcripts, and escalates to human receptionists when complex clinical assistance is required.",
    why: "Clinic phone lines are frequently busy during morning OPD hours, resulting in frustrated patients and lost bookings. Voice AI handles simultaneous telephone calls with zero hold time.",
    how: [
      "When a patient calls the clinic number, Voice AI greets them conversationally.",
      "The caller asks for an appointment: Voice AI checks real-time slots via internal availability RPCs.",
      "The caller confirms their name and time; Voice AI books the appointment, logs the session, and triggers an instant WhatsApp confirmation with booking details.",
      "If the caller asks an urgent medical question, Voice AI immediately transfers the call to human staff."
    ],
    watchOut: [
      "Voice AI is strictly restricted to scheduling, directions, and hours; it never provides clinical diagnoses or medical advice.",
      "All voice sessions are logged in `voice_call_logs` with duration, recording status, and caller metadata."
    ],
    examples: [
      "A patient calls: 'Is Dr. Khurshid available this evening?' Voice AI replies: 'Yes, Dr. Khurshid has slots at 5:15 PM and 6:00 PM. Would you like me to book one for you?'"
    ]
  },

  // ==========================================
  // 8. FLOW BUILDER & AUTOMATIONS
  // ==========================================
  {
    id: "automations-flow-builder",
    title: "Flow Builder & Care Reminders",
    category: "Automations",
    paths: ["/app/automations"],
    keywords: [
      "automation", "flow builder", "care reminder", "medication reminder", "cron",
      "retry", "worker stall", "automation runs", "delayed worker"
    ],
    what: "Flow Builder governs the automated delivery of appointment reminders, medication schedules, and patient surveys. Each workflow has deterministic triggers, delivery conditions, retry policies, and an operational audit ledger.",
    why: "Automating repetitive clinic tasks saves 3-5 hours of staff time daily. However, unmonitored automations can spam patients or silently fail. Flow Builder provides bounded retries, worker stall monitoring (15-min stall alert), and automatic dead-letter retention.",
    how: [
      "Review automated flows on the Automations page (/app/automations).",
      "Confirm active triggers: 24-hour reminder before visit, 2-hour reminder before visit.",
      "The automation worker evaluates scheduled runs every minute via Supabase cron.",
      "If a run fails due to carrier network issues, it retries up to 3 times before moving to Operations for review."
    ],
    watchOut: [
      "Reminders will never send if the patient's phone number is invalid or has opted out with STOP.",
      "If an automation worker is delayed over 15 minutes, an 'Automation worker needs attention' alert is triggered on the dashboard."
    ],
    examples: [
      "Appointment on Tuesday at 4:00 PM: 24h reminder dispatches Monday at 4:00 PM; 2h reminder dispatches Tuesday at 2:00 PM."
    ],
    quickAction: { label: "Go to Automations", href: "/app/automations" }
  },

  // ==========================================
  // 9. BILLING, WABA CALCULATOR & BUSINESS SETUP
  // ==========================================
  {
    id: "billing-waba-calculator",
    title: "WABA Cost Calculator & Wallet Pilot",
    category: "Billing",
    paths: ["/app/billing"],
    keywords: [
      "waba calc", "calculator", "whatsapp cost", "rate card", "billing", "wallet",
      "razorpay topup", "paise", "utility rate", "marketing rate"
    ],
    what: "WABA Calc is OmniRelay's communications cost simulator located in the header bar and Billing page. It calculates exact monthly WhatsApp utility and marketing costs based on doctor capacity, patient volume, and working days.",
    why: "WhatsApp charges businesses per delivered conversation. Clinics need complete transparency into monthly costs before launching campaigns or automated reminders.",
    how: [
      "Click 'WABA Calc' in the top header or Billing page.",
      "Enter average patients seen per doctor per day, active doctors, and working days (default 26).",
      "The calculator models 3 core utility messages per booked patient: confirmation, 24h reminder, and 2h reminder.",
      "Optionally add follow-up recalls, medication reminders, or consented marketing broadcast numbers.",
      "OmniRelay displays the exact base Meta rate + platform fee breakdown in paise and INR."
    ],
    watchOut: [
      "Enter patients per single doctor, not the total clinic volume, so doctor capacity calculates accurately.",
      "Customer-initiated service window replies within 24 hours incur zero Meta utility fees."
    ],
    examples: [
      "2 doctors seeing 20 patients/day over 26 days = 1,040 visits = 3,120 automated utility reminders, estimated at approximately ₹2,100/month."
    ],
    quickAction: { label: "Open Billing", href: "/app/billing" }
  },
  {
    id: "settings-business-setup",
    title: "Business Setup: Chambers, Doctors & Services",
    category: "Settings",
    paths: ["/app/settings"],
    keywords: [
      "settings", "business setup", "clinic setup", "chambers", "services", "doctors",
      "consultation fee", "google maps", "working hours", "availability"
    ],
    what: "Business Setup is the administrative foundation of the clinic. It configures clinic locations with Google Maps links, examination chambers, service tariffs and durations, named doctor profiles, and recurring weekly availability sessions.",
    why: "Accurate booking, reminder generation, and brochure links depend on this data. If a doctor's shift or chamber address is wrong here, patient reminders and public booking links will display incorrect details.",
    how: [
      "Navigate to Business Setup (/app/settings).",
      "Clinic Profile: Set official clinic name, logo, phone, and upload a custom public PDF brochure.",
      "Locations & Chambers: Add physical clinic branches with Google Maps share links (included in patient WhatsApp directions).",
      "Services: Define consultation types, durations (e.g. 15 mins), buffer intervals, and standard fees.",
      "Doctors & Availability: Add named providers and configure separate morning/evening sessions."
    ],
    watchOut: [
      "Always create separate weekly sessions if a doctor works morning and evening shifts (e.g. 9 AM - 1 PM and 5 PM - 8 PM).",
      "Never upload private patient documents as the public brochure."
    ],
    examples: [
      "Neoclinic adds 'Chamber 1' with full address and Google Maps share link; patients tapping 'Clinic timings' on WhatsApp get turn-by-turn directions."
    ],
    quickAction: { label: "Go to Settings", href: "/app/settings" }
  },

  // ==========================================
  // 10. ACTION CENTRE & OPERATIONS
  // ==========================================
  {
    id: "action-centre-daily-queue",
    title: "Action Centre & Priority Alert Review",
    category: "Operations",
    paths: ["/app/action-centre"],
    keywords: [
      "action centre", "action center", "priority alert", "exception", "waitlist",
      "booking approval", "schedule disruption", "failed reminder", "attention"
    ],
    what: "Action Centre is the centralized daily operational command desk. It separates routine automated tasks from exceptions requiring human clinical or administrative judgment: escalated booking approvals, schedule disruptions, failed reminder retries, and overdue follow-up care tasks.",
    why: "Clinic staff should not have to hunt across 10 different pages to see what went wrong. Action Centre brings every blocked or urgent task into one accountable queue with visible ownership.",
    how: [
      "Open Action Centre (/app/action-centre).",
      "Review items organized by priority: Critical (Level 3/2), High (Level 1), Normal.",
      "Click 'Claim' on an exception to assume ownership so colleagues don't duplicate work.",
      "Resolve the underlying condition (e.g., call patient, reschedule doctor, or update phone number) and click 'Complete'."
    ],
    watchOut: [
      "Never close an alert without resolving its underlying cause.",
      "Actions in Action Centre are audit-logged with the claiming staff member's identity."
    ],
    examples: [
      "A patient requested an appointment on WhatsApp but needs approval: The request appears in Action Centre with a 15-minute escalation countdown."
    ],
    quickAction: { label: "Open Action Centre", href: "/app/action-centre" }
  }
];

export function searchMasterKnowledge(query: string): KnowledgeCard[] {
  const normalized = query.toLowerCase().trim();
  const queryTokens = normalized.split(/\s+/).filter(Boolean);
  if (!queryTokens.length) return [];

  return OMNIRELAY_MASTER_KNOWLEDGE
    .map((card) => {
      let score = 0;
      for (const token of queryTokens) {
        if (card.keywords.some((k) => k.includes(token))) score += 4;
        if (card.title.toLowerCase().includes(token)) score += 6;
        if (card.what.toLowerCase().includes(token)) score += 2;
        if (card.why.toLowerCase().includes(token)) score += 2;
        if (card.how.some((h) => h.toLowerCase().includes(token))) score += 2;
      }
      return { card, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.card);
}

