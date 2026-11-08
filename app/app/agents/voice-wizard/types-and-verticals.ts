export type BusinessVertical = "healthcare" | "retail" | "hospitality";

export interface VoiceConfig {
  org_id: string;
  clinic_name: string;
  bot_name: string;
  agent_persona: string;
  voice_id: string;
  virtual_number: string;
  receptionist_phone: string;
  greeting_message: string;
  primary_language: string;
  auto_language_switch: boolean;
  enabled_languages: string[];
  operating_hours: {
    mon_sat: string;
    sunday: string;
  };
  emergency_instructions: string;
  sms_confirmation_enabled: boolean;
  whatsapp_confirmation_enabled: boolean;
  is_active: boolean;
  onboarding_completed: boolean;
  telephony_mode?: "smart_forwarding" | "dedicated_vmn";
  forwarding_carrier?: string;
  forwarding_phone_number?: string;
  vmn_number?: string | null;
  vmn_status?: string;
  vmn_plan_active?: boolean;
  business_vertical?: BusinessVertical;
  business_category?: string;
  vertical_settings?: {
    vertical: string;
    enable_booking?: boolean;
    enable_emergency_bypass?: boolean;
    order_tracking_enabled?: boolean;
    room_reservation_enabled?: boolean;
  };
  receptionist_eq_tone?: "empathetic" | "reassuring" | "crisp";
  sales_agent_name?: string;
  sales_agent_active?: boolean;
  sales_eq_style?: "consultative" | "educational" | "value_driven";
  sales_packages?: Array<{ name: string; price_inr: number; description: string }>;
  sales_campaign_type?: string;
  outbound_calling_window?: { start: string; end: string };
}

export const VERTICALS = [
  {
    id: "healthcare" as BusinessVertical,
    name: "Healthcare & Clinics",
    badge: "OPD & Patients",
    tagline: "Doctor appointments, patient triage, bedside empathy & emergency safeguards",
    defaultBotName: "Maya",
    defaultSalesName: "Rohan",
    greeting: (name: string) => `Hello! Thank you for calling ${name}. How can I assist you with your appointment today?`,
    businessLabel: "Clinic / Hospital Name",
    businessPlaceholder: "e.g. Apollo Dental Center or City Care Clinic",
    categoryLabel: "Select Healthcare Specialty",
    inboundTitle: "AI Medical Receptionist",
    inboundSubtitle: "Inbound Patient Care, Bookings, Rescheduling & Triage",
    outboundTitle: "AI Healthcare Sales & Growth Agent",
    outboundSubtitle: "Promotional Calls, Package Sales, No-Show Reactivations & Follow-ups",
    featuredOfferLabel: "Featured Health Checkup / Treatment Package Offer:",
    categories: [
      { id: "dental", name: "Dental Practice", description: "Cleanings, implants, braces, root canals", defaultPackage: "Comprehensive Dental Scaling & Cleaning", defaultPrice: 999 },
      { id: "dermatology", name: "Dermatology & Aesthetics", description: "Acne therapy, laser treatments, chemical peels", defaultPackage: "HydraFacial & Deep Skin Assessment", defaultPrice: 2499 },
      { id: "ophthalmology", name: "Eye Care & Ophthalmology", description: "Vision checks, LASIK evaluation, cataract screens", defaultPackage: "Comprehensive Eye Exam & Scan", defaultPrice: 699 },
      { id: "general_practice", name: "General Practice / Multispecialty", description: "General OPD, blood work, chronic care", defaultPackage: "Executive Full Body Checkup", defaultPrice: 2999 },
      { id: "orthopedics", name: "Physiotherapy & Orthopedics", description: "Joint rehab, spine therapy, sports injuries", defaultPackage: "Physiotherapy Pain Relief Session", defaultPrice: 899 },
      { id: "wellness", name: "Mental Health & Wellness", description: "Therapy, nutrition, lifestyle consultation", defaultPackage: "Initial Wellness Assessment", defaultPrice: 1499 },
    ],
    transferLabel: "Human Front-Desk / Emergency Transfer Phone (Required)",
    transferHelp: "If a caller demands a human or reports a severe medical emergency, Maya will warmly transfer them to this number.",
    protocolBox: {
      title: "🏥 Emergency Protocol (108 Bypass Built-in):",
      text: "If a patient speaks emergency keywords (e.g. severe chest pain, heavy bleeding, difficulty breathing), the voice engine deterministically bypasses LLM conversation in <10ms, provides emergency first-aid guidance, and immediately dials your front-desk transfer number."
    }
  },
  {
    id: "retail" as BusinessVertical,
    name: "Retail & E-Commerce",
    badge: "D2C & Orders",
    tagline: "Live order tracking, return authorization, product inquiries & promotional bundles",
    defaultBotName: "Priya",
    defaultSalesName: "Kabir",
    greeting: (name: string) => `Hello! Thank you for calling ${name} Customer Care. How can I assist you with your order or product inquiries today?`,
    businessLabel: "Store / Brand / Company Name",
    businessPlaceholder: "e.g. Urban Threads Apparel or BoltTech Store",
    categoryLabel: "Select Retail & E-Commerce Segment",
    inboundTitle: "AI Customer Care Specialist",
    inboundSubtitle: "Live Order Tracking, Delivery Status, Return Requests & FAQs",
    outboundTitle: "AI Retail Sales & Conversions Agent",
    outboundSubtitle: "Abandoned Cart Recovery, VIP Offers & Promotional Campaigns",
    featuredOfferLabel: "Featured Promotional Bundle / Discount Offer:",
    categories: [
      { id: "fashion", name: "Fashion & Apparel", description: "Order status, returns/exchanges, sizing guidance", defaultPackage: "VIP Festive Wardrobe Bundle (Flat 20% Off)", defaultPrice: 1499 },
      { id: "electronics", name: "Electronics & Gadgets", description: "Shipment tracking, warranty checks, accessories", defaultPackage: "Premium Device Protection & Accessory Kit", defaultPrice: 799 },
      { id: "beauty", name: "Beauty & Cosmetics", description: "Product inquiries, skin routine picks, refills", defaultPackage: "Glow Skincare Replenishment Hamper", defaultPrice: 1299 },
      { id: "grocery", name: "Grocery & Essentials", description: "Delivery ETA, item replacement, refunds", defaultPackage: "Weekly Farm-Fresh Essentials Subscription", defaultPrice: 899 },
      { id: "home_decor", name: "Home & Furniture", description: "Delivery window, assembly bookings, adjustments", defaultPackage: "Living Room Styling Consultation Pack", defaultPrice: 1999 },
      { id: "d2c_brand", name: "D2C Direct Brand", description: "Direct order lookup, exchange support, coupons", defaultPackage: "Best-Seller Discovery Hamper", defaultPrice: 1199 },
    ],
    transferLabel: "Customer Care Escalation Phone (Required)",
    transferHelp: "If an order issue requires tier-2 human supervisor intervention or custom billing approval, Priya connects to this number.",
    protocolBox: {
      title: "📦 Automated Order Tracking & Return Capture:",
      text: "When callers ask for order status or returns, the AI verifies their registered phone or order number, fetches live courier tracking, and initiates return authorizations without customer support hold times."
    }
  },
  {
    id: "hospitality" as BusinessVertical,
    name: "Hotel & Hospitality",
    badge: "Rooms & Dining",
    tagline: "Room reservations, table bookings, front desk concierge & guest services",
    defaultBotName: "Aria",
    defaultSalesName: "Neil",
    greeting: (name: string) => `Welcome to ${name}! How may I assist you with your room booking or dining reservation today?`,
    businessLabel: "Hotel / Resort / Restaurant Name",
    businessPlaceholder: "e.g. The Grand Heritage Hotel or Olive Bistro",
    categoryLabel: "Select Hospitality & Dining Category",
    inboundTitle: "AI Front Desk & Concierge Host",
    inboundSubtitle: "Room Inquiries, Table Reservations, Amenities & Local Guidance",
    outboundTitle: "AI Guest Relations & Upgrade Agent",
    outboundSubtitle: "Booking Confirmations, Stay Upgrades & Dining Reservations",
    featuredOfferLabel: "Featured Stay Package / Dining Experience:",
    categories: [
      { id: "luxury_hotel", name: "Luxury Hotel & Resort", description: "Room suites, infinity pool, spa, airport transfers", defaultPackage: "Weekend Luxury Retreat with Breakfast", defaultPrice: 5999 },
      { id: "boutique_hotel", name: "Boutique Hotel & Stays", description: "Heritage rooms, check-in/out, local tour guides", defaultPackage: "Deluxe Boutique Suite Stay (2 Nights)", defaultPrice: 3499 },
      { id: "fine_dining", name: "Fine Dining & Bistro", description: "Chef's table, dietary preferences, private dining", defaultPackage: "Chef's 5-Course Tasting Experience for Two", defaultPrice: 2199 },
      { id: "cafe_dining", name: "Cafe & Casual Dining", description: "Table reservations, birthday parties, takeaway", defaultPackage: "Weekend Celebration Brunch Table", defaultPrice: 999 },
      { id: "event_venue", name: "Banquet & Event Venue", description: "Wedding halls, corporate conferences, catering", defaultPackage: "Corporate Executive Conference Half-Day", defaultPrice: 14999 },
      { id: "wellness_resort", name: "Wellness & Ayurvedic Retreat", description: "Rejuvenation therapies, yoga sessions, detox", defaultPackage: "Full-Day Ayurvedic Rejuvenation Pass", defaultPrice: 2999 },
    ],
    transferLabel: "Front Desk Manager Phone (Required)",
    transferHelp: "If guests require custom billing, special concierge accommodations, or direct manager assistance, Aria transfers immediately.",
    protocolBox: {
      title: "🏨 Instant Reservation & Concierge Routing:",
      text: "The AI checks room/table availability in real time, records special guest preferences (e.g. late check-in, dietary restrictions), and provides instant SMS confirmations."
    }
  }
];

export const VOICE_PERSONAS = [
  {
    id: "sonic-english-indian-1",
    name: "Maya",
    gender: "Female",
    style: "Warm, Polite & Empathetic",
    accent: "Indian English & Indic Native",
    sampleText: "Hello! Thank you for calling. How can I assist you with your doctor appointment today?"
  },
  {
    id: "sonic-english-indian-2",
    name: "Rohan",
    gender: "Male",
    style: "Calm, Professional & Clear",
    accent: "Indian English & Neutral",
    sampleText: "Welcome to our clinic. Would you like to check doctor availability or schedule a visit?"
  },
  {
    id: "sonic-english-indian-3",
    name: "Priya",
    gender: "Female",
    style: "Gentle, Reassuring Healthcare Host",
    accent: "South Indian & Pan-India Bilingual",
    sampleText: "Namaskara! I am here to help you book appointments or answer clinic queries."
  }
];

export const AVAILABLE_LANGUAGES = [
  { code: "en-IN", name: "English (India)", native: "English" },
  { code: "hi-IN", name: "Hindi", native: "हिन्दी" },
  { code: "kn-IN", name: "Kannada", native: "ಕನ್ನಡ" },
  { code: "ta-IN", name: "Tamil", native: "தமிழ்" },
  { code: "te-IN", name: "Telugu", native: "తెలుగు" },
  { code: "mr-IN", name: "Marathi", native: "मराठी" },
  { code: "bn-IN", name: "Bengali", native: "বাংলা" },
  { code: "gu-IN", name: "Gujarati", native: "ગુજરાતી" },
  { code: "ml-IN", name: "Malayalam", native: "മലയാളം" },
  { code: "pa-IN", name: "Punjabi", native: "ਪੰਜਾਬੀ" },
  { code: "ur-IN", name: "Urdu", native: "اردو" }
];

export const RECEPTIONIST_EQ_TONES = [
  { id: "empathetic", title: "Empathetic & Bedside Care", desc: "Warm, gentle, speaks softly to soothe unwell or nervous callers." },
  { id: "reassuring", title: "Calm & Reassuring", desc: "Validates caller concerns, explains steps clearly, builds trust." },
  { id: "crisp", title: "Crisp & Efficient", desc: "Direct, professional, optimal for high-volume quick support queues." }
];

export const SALES_EQ_STYLES = [
  { id: "consultative", title: "Consultative Advisor", desc: "Focuses on customer outcomes, asks guiding questions, zero pressure." },
  { id: "educational", title: "Educational & Informative", desc: "Explains features, credentials, benefits, and value transparently." },
  { id: "value_driven", title: "Value-Driven & Confident", desc: "Clearly highlights package cost savings, bundled inclusions, and limited slots." }
];
