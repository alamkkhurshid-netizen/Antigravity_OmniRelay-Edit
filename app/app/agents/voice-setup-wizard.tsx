"use client";

import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Bot, 
  Volume2, 
  Clock, 
  PhoneCall, 
  Languages, 
  ShieldCheck, 
  CheckCircle2, 
  ArrowRight, 
  ArrowLeft, 
  PhoneForwarded, 
  Sparkles,
  Play,
  RotateCcw,
  Smartphone,
  HeartHandshake,
  TrendingUp,
  Stethoscope,
  Tag,
  UserCheck,
  ShoppingBag,
  Building2
} from "lucide-react";

export type BusinessVertical = "healthcare" | "retail" | "hospitality";

interface VoiceConfig {
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

const VOICE_PERSONAS = [
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

const AVAILABLE_LANGUAGES = [
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

const RECEPTIONIST_EQ_TONES = [
  { id: "empathetic", title: "Empathetic & Bedside Care", desc: "Warm, gentle, speaks softly to soothe unwell or nervous callers." },
  { id: "reassuring", title: "Calm & Reassuring", desc: "Validates caller concerns, explains steps clearly, builds trust." },
  { id: "crisp", title: "Crisp & Efficient", desc: "Direct, professional, optimal for high-volume quick support queues." }
];

const SALES_EQ_STYLES = [
  { id: "consultative", title: "Consultative Advisor", desc: "Focuses on customer outcomes, asks guiding questions, zero pressure." },
  { id: "educational", title: "Educational & Informative", desc: "Explains features, credentials, benefits, and value transparently." },
  { id: "value_driven", title: "Value-Driven & Confident", desc: "Clearly highlights package cost savings, bundled inclusions, and limited slots." }
];

export function VoiceSetupWizard({
  initialConfig,
  organizationId,
  onComplete,
  onCancel
}: {
  initialConfig?: Partial<VoiceConfig>;
  organizationId: string;
  onComplete?: (updated: VoiceConfig) => void;
  onCancel?: () => void;
}) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [testCalling, setTestCalling] = useState(false);
  const [testCallPhone, setTestCallPhone] = useState("");
  const [testCallRole, setTestCallRole] = useState<"receptionist" | "sales">("receptionist");
  const [testCallStatus, setTestCallStatus] = useState<string | null>(null);
  const [activeAudioPreview, setActiveAudioPreview] = useState<string | null>(null);

  const initialVertical: BusinessVertical = (initialConfig?.business_vertical as BusinessVertical) || "healthcare";
  const initialDef = VERTICALS.find(v => v.id === initialVertical) || VERTICALS[0];

  const [formData, setFormData] = useState<VoiceConfig>({
    org_id: organizationId,
    clinic_name: initialConfig?.clinic_name || "My Business",
    bot_name: initialConfig?.bot_name || initialDef.defaultBotName,
    agent_persona: initialConfig?.agent_persona || "receptionist",
    voice_id: initialConfig?.voice_id || "sonic-english-indian-1",
    virtual_number: initialConfig?.virtual_number || "08047283676",
    receptionist_phone: initialConfig?.receptionist_phone || "",
    greeting_message: initialConfig?.greeting_message || initialDef.greeting(initialConfig?.clinic_name || "our company"),
    primary_language: initialConfig?.primary_language || "en-IN",
    auto_language_switch: initialConfig?.auto_language_switch !== false,
    enabled_languages: initialConfig?.enabled_languages || ["en-IN", "hi-IN", "kn-IN"],
    operating_hours: initialConfig?.operating_hours || { mon_sat: "09:00 - 19:00", sunday: "closed" },
    emergency_instructions: initialConfig?.emergency_instructions || "Call 108 or proceed to the nearest emergency hospital immediately.",
    sms_confirmation_enabled: initialConfig?.sms_confirmation_enabled !== false,
    whatsapp_confirmation_enabled: initialConfig?.whatsapp_confirmation_enabled !== false,
    is_active: initialConfig?.is_active !== false,
    onboarding_completed: true,
    telephony_mode: initialConfig?.telephony_mode || "smart_forwarding",
    forwarding_carrier: initialConfig?.forwarding_carrier || "airtel",
    forwarding_phone_number: initialConfig?.forwarding_phone_number || "",
    vmn_number: initialConfig?.vmn_number || "+919845024001",
    vmn_status: initialConfig?.vmn_status || "active",
    vmn_plan_active: initialConfig?.vmn_plan_active || false,
    business_vertical: initialVertical,
    business_category: initialConfig?.business_category || initialDef.categories[0].id,
    vertical_settings: initialConfig?.vertical_settings || {
      vertical: initialVertical,
      enable_booking: true,
      enable_emergency_bypass: initialVertical === "healthcare",
      order_tracking_enabled: initialVertical === "retail",
      room_reservation_enabled: initialVertical === "hospitality"
    },
    receptionist_eq_tone: initialConfig?.receptionist_eq_tone || "empathetic",
    sales_agent_name: initialConfig?.sales_agent_name || initialDef.defaultSalesName,
    sales_agent_active: initialConfig?.sales_agent_active !== false,
    sales_eq_style: initialConfig?.sales_eq_style || "consultative",
    sales_packages: initialConfig?.sales_packages || [
      { name: initialDef.categories[0].defaultPackage, price_inr: initialDef.categories[0].defaultPrice, description: `Specialized ${initialDef.categories[0].name} package.` }
    ],
    sales_campaign_type: initialConfig?.sales_campaign_type || "promotional_leads",
    outbound_calling_window: initialConfig?.outbound_calling_window || { start: "09:30", end: "19:30" },
  });

  const activeVerticalDef = VERTICALS.find(v => v.id === formData.business_vertical) || VERTICALS[0];

  const handleVerticalChange = (newVerticalId: BusinessVertical) => {
    const def = VERTICALS.find(v => v.id === newVerticalId) || VERTICALS[0];
    const bName = formData.clinic_name || "our company";
    setFormData(prev => ({
      ...prev,
      business_vertical: newVerticalId,
      bot_name: def.defaultBotName,
      sales_agent_name: def.defaultSalesName,
      greeting_message: def.greeting(bName),
      business_category: def.categories[0].id,
      sales_packages: [
        { name: def.categories[0].defaultPackage, price_inr: def.categories[0].defaultPrice, description: `Specialized ${def.categories[0].name} package.` }
      ],
      vertical_settings: {
        vertical: newVerticalId,
        enable_booking: true,
        enable_emergency_bypass: newVerticalId === "healthcare",
        order_tracking_enabled: newVerticalId === "retail",
        room_reservation_enabled: newVerticalId === "hospitality"
      }
    }));
  };

  const toggleLanguage = (langCode: string) => {
    setFormData(prev => {
      const exists = prev.enabled_languages.includes(langCode);
      if (exists && prev.enabled_languages.length <= 1) return prev; // Keep at least one
      return {
        ...prev,
        enabled_languages: exists
          ? prev.enabled_languages.filter(c => c !== langCode)
          : [...prev.enabled_languages, langCode]
      };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/voice/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      if (onComplete) onComplete(data.config);
    } catch (err: any) {
      alert("Error saving voice configuration: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTestCall = async () => {
    if (!testCallPhone.trim()) {
      alert("Please enter a valid 10-digit mobile number.");
      return;
    }
    setTestCalling(true);
    setTestCallStatus("Connecting call via Exotel carrier network...");
    try {
      const activeBotName = testCallRole === "sales" ? (formData.sales_agent_name || "Rohan") : (formData.bot_name || "Maya");
      const res = await fetch("/api/voice/test-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: testCallPhone,
          bot_name: activeBotName,
          tester_name: formData.clinic_name,
          agent_role: testCallRole,
          campaign_type: testCallRole === "sales" ? "sales_package" : "demo_test"
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setTestCallStatus("Failed: " + (data.error || "Could not dial"));
      } else {
        setTestCallStatus(`Success! Your phone is ringing right now. Answer to talk to ${activeBotName} (${testCallRole === "sales" ? "Sales & Growth Advisor" : "Medical Receptionist"}).`);
      }
    } catch (err: any) {
      setTestCallStatus("Error connecting to voice cluster: " + err.message);
    } finally {
      setTestCalling(false);
    }
  };

  const playVoicePreview = (personaId: string) => {
    setActiveAudioPreview(personaId);
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const persona = VOICE_PERSONAS.find(p => p.id === personaId);
      const utterance = new SpeechSynthesisUtterance(persona?.sampleText || "");
      utterance.rate = 0.95;
      utterance.onend = () => setActiveAudioPreview(null);
      window.speechSynthesis.speak(utterance);
    } else {
      setTimeout(() => setActiveAudioPreview(null), 3000);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-6">
      {/* Step Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Bot className="h-5 w-5" />
              </span>
              <h2 className="text-2xl font-bold tracking-tight">AI Voice Receptionist Setup</h2>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Configure your clinic's automated voice receptionist in 3 easy steps.
            </p>
          </div>
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Exit Setup
            </Button>
          )}
        </div>

        {/* Progress Tracker */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { num: 1, title: "1. Identity & Voice" },
            { num: 2, title: "2. Hours & Safety" },
            { num: 3, title: "3. Languages" },
            { num: 4, title: "4. Test & Activate" }
          ].map((s) => (
            <div 
              key={s.num} 
              className={`h-2 rounded-full transition-all duration-300 ${
                step >= s.num ? "bg-emerald-500" : "bg-muted"
              }`}
            />
          ))}
        </div>
      </div>

      {/* STEP 1: BUSINESS VERTICAL & DUAL AI AGENT CONFIGURATION */}
      {step === 1 && (
        <Card className="border-border/80 shadow-md">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Bot className="h-5 w-5 text-emerald-500" />
                  Step 1: Choose Business Vertical & Dual AI Agents
                </CardTitle>
                <CardDescription>
                  Select your industry vertical to instantly tailor speech terminology, tool capabilities, and conversational EQ.
                </CardDescription>
              </div>
              <Badge variant="outline" className="border-emerald-500 text-emerald-600 self-start sm:self-auto font-semibold">
                {activeVerticalDef.badge}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 3-WAY BUSINESS VERTICAL SELECTOR */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-2">
                Select Your Industry Vertical
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {VERTICALS.map((vert) => {
                  const isSelected = formData.business_vertical === vert.id;
                  const Icon = vert.id === "healthcare" ? Stethoscope : vert.id === "retail" ? ShoppingBag : Building2;
                  return (
                    <div
                      key={vert.id}
                      onClick={() => handleVerticalChange(vert.id)}
                      className={`relative p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                        isSelected
                          ? "border-emerald-500 bg-emerald-500/10 shadow-sm"
                          : "border-border hover:border-emerald-500/40 bg-card hover:bg-muted/20"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`p-1.5 rounded-lg ${isSelected ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"}`}>
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="font-bold text-sm text-foreground">{vert.name}</span>
                        </div>
                        {isSelected && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                        {vert.tagline}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Business Name & Category / Specialty */}
            <div className="space-y-4 pt-2 border-t">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                  {activeVerticalDef.businessLabel}
                </label>
                <input
                  type="text"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                  value={formData.clinic_name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setFormData(prev => ({
                      ...prev,
                      clinic_name: name,
                      greeting_message: activeVerticalDef.greeting(name || "our company")
                    }));
                  }}
                  placeholder={activeVerticalDef.businessPlaceholder}
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-2">
                  {activeVerticalDef.categoryLabel}
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                  {activeVerticalDef.categories.map((cat) => {
                    const isSelected = formData.business_category === cat.id;
                    return (
                      <div
                        key={cat.id}
                        onClick={() => {
                          setFormData(prev => ({
                            ...prev,
                            business_category: cat.id,
                            sales_packages: [
                              { name: cat.defaultPackage, price_inr: cat.defaultPrice, description: `Specialized ${cat.name} package.` }
                            ]
                          }));
                        }}
                        className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                          isSelected
                            ? "border-emerald-500 bg-emerald-500/10 font-medium text-foreground shadow-sm"
                            : "border-border hover:bg-muted/30 text-muted-foreground"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-foreground">{cat.name}</span>
                          {isSelected && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                        </div>
                        <p className="text-[11px] text-muted-foreground line-clamp-1">{cat.description}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* AGENT 1: INBOUND AI SPECIALIST */}
            <div className="p-4 rounded-xl border bg-muted/10 space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <HeartHandshake className="h-4 w-4" />
                  </span>
                  <div>
                    <h4 className="text-sm font-bold text-foreground">Agent 1: {activeVerticalDef.inboundTitle}</h4>
                    <p className="text-[11px] text-muted-foreground">{activeVerticalDef.inboundSubtitle}</p>
                  </div>
                </div>
                <Badge variant="outline" className="border-emerald-500 text-emerald-600 text-[10px]">
                  INBOUND ACTIVE
                </Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                    Agent Representative Name
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    value={formData.bot_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, bot_name: e.target.value }))}
                    placeholder={`e.g. ${activeVerticalDef.defaultBotName}`}
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                    Emotional Intelligence & Conversational Tone
                  </label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    value={formData.receptionist_eq_tone || "empathetic"}
                    onChange={(e: any) => setFormData(prev => ({ ...prev, receptionist_eq_tone: e.target.value }))}
                  >
                    {RECEPTIONIST_EQ_TONES.map(t => (
                      <option key={t.id} value={t.id}>{t.title} — {t.desc.split(",")[0]}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Persona Voice Cards */}
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-2">
                  Voice Model
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  {VOICE_PERSONAS.map((persona) => {
                    const isSelected = formData.voice_id === persona.id;
                    return (
                      <div
                        key={persona.id}
                        onClick={() => setFormData(prev => ({ ...prev, voice_id: persona.id }))}
                        className={`p-3 rounded-lg border cursor-pointer transition-all ${
                          isSelected 
                            ? "border-emerald-500 bg-emerald-500/5 shadow-sm" 
                            : "border-border hover:bg-muted/30"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-xs text-foreground">{persona.name} ({persona.gender})</span>
                          {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{persona.style}</p>
                        <button
                          type="button"
                          className="mt-2 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1 hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            playVoicePreview(persona.id);
                          }}
                        >
                          <Volume2 className="h-3 w-3" /> Preview Voice
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                  Inbound Welcome Greeting
                </label>
                <textarea
                  rows={2}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  value={formData.greeting_message}
                  onChange={(e) => setFormData(prev => ({ ...prev, greeting_message: e.target.value }))}
                />
              </div>
            </div>

            {/* AGENT 2: OUTBOUND AI GROWTH & SALES AGENT */}
            <div className="p-4 rounded-xl border bg-muted/10 space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    <TrendingUp className="h-4 w-4" />
                  </span>
                  <div>
                    <h4 className="text-sm font-bold text-foreground">Agent 2: {activeVerticalDef.outboundTitle}</h4>
                    <p className="text-[11px] text-muted-foreground">{activeVerticalDef.outboundSubtitle}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-blue-500 text-blue-600 text-[10px]">
                    OUTBOUND REVENUE
                  </Badge>
                  <input
                    type="checkbox"
                    checked={formData.sales_agent_active !== false}
                    onChange={(e) => setFormData(prev => ({ ...prev, sales_agent_active: e.target.checked }))}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </div>
              </div>

              {formData.sales_agent_active !== false && (
                <div className="space-y-4 pt-1">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                        Sales Advisor Name
                      </label>
                      <input
                        type="text"
                        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                        value={formData.sales_agent_name || activeVerticalDef.defaultSalesName}
                        onChange={(e) => setFormData(prev => ({ ...prev, sales_agent_name: e.target.value }))}
                        placeholder={`e.g. ${activeVerticalDef.defaultSalesName}`}
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                        Persuasion & Objection Handling Style
                      </label>
                      <select
                        className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                        value={formData.sales_eq_style || "consultative"}
                        onChange={(e: any) => setFormData(prev => ({ ...prev, sales_eq_style: e.target.value }))}
                      >
                        {SALES_EQ_STYLES.map(s => (
                          <option key={s.id} value={s.id}>{s.title} — {s.desc.split(",")[0]}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Featured Vertical Package / Promotion Offer */}
                  <div className="p-3 rounded-lg border bg-background space-y-2">
                    <span className="text-[11px] font-bold text-foreground block">
                      {activeVerticalDef.featuredOfferLabel}
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="sm:col-span-2">
                        <label className="text-[10px] text-muted-foreground uppercase font-semibold block mb-0.5">Package / Offer Name</label>
                        <input
                          type="text"
                          className="w-full rounded border px-2.5 py-1 text-xs font-medium"
                          value={formData.sales_packages?.[0]?.name || activeVerticalDef.categories[0].defaultPackage}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFormData(prev => {
                              const existing = [...(prev.sales_packages || [{ name: "", price_inr: 999, description: "" }])];
                              existing[0] = { ...existing[0], name: val };
                              return { ...prev, sales_packages: existing };
                            });
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground uppercase font-semibold block mb-0.5">Special Price (INR ₹)</label>
                        <input
                          type="number"
                          className="w-full rounded border px-2.5 py-1 text-xs font-mono font-bold text-emerald-600"
                          value={formData.sales_packages?.[0]?.price_inr || activeVerticalDef.categories[0].defaultPrice}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            setFormData(prev => {
                              const existing = [...(prev.sales_packages || [{ name: "", price_inr: 999, description: "" }])];
                              existing[0] = { ...existing[0], price_inr: val };
                              return { ...prev, sales_packages: existing };
                            });
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Automated Outbound Campaigns */}
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
                      Automated Revenue Campaigns Enabled:
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                      <div className="p-2 rounded border bg-background flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-blue-500 flex-shrink-0" />
                        <div>
                          <div className="font-semibold text-foreground text-[11px]">Promotional Leads</div>
                          <div className="text-[10px] text-muted-foreground">Inbounds inquiring about offers</div>
                        </div>
                      </div>
                      <div className="p-2 rounded border bg-background flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-blue-500 flex-shrink-0" />
                        <div>
                          <div className="font-semibold text-foreground text-[11px]">Reactivation Dials</div>
                          <div className="text-[10px] text-muted-foreground">Calls back inactive or missed leads</div>
                        </div>
                      </div>
                      <div className="p-2 rounded border bg-background flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-blue-500 flex-shrink-0" />
                        <div>
                          <div className="font-semibold text-foreground text-[11px]">Post-Service Upgrades</div>
                          <div className="text-[10px] text-muted-foreground">Follow-up reorders & renewals</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex justify-between border-t p-4">
            <span />
            <Button onClick={() => setStep(2)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
              Next: Hours & Safety <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* STEP 2: HOURS & SAFETY */}
      {step === 2 && (
        <Card className="border-border/80 shadow-md">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-500" />
              Step 2: Operating Hours & Human Escalation Safety
            </CardTitle>
            <CardDescription>
              Specify business operating hours and where to route calls when a customer requests a human agent.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> Business Operating Hours
                </label>
                <input
                  type="text"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  value={formData.operating_hours.mon_sat}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    operating_hours: { ...prev.operating_hours, mon_sat: e.target.value }
                  }))}
                  placeholder="e.g. 09:00 AM - 07:00 PM (Mon-Sat)"
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-rose-500 flex items-center gap-1">
                  <PhoneForwarded className="h-3.5 w-3.5" /> {activeVerticalDef.transferLabel}
                </label>
                <input
                  type="text"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 font-medium"
                  value={formData.receptionist_phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, receptionist_phone: e.target.value }))}
                  placeholder="e.g. +91 98450 12345 or 08047283676"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  {activeVerticalDef.transferHelp}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300">
              <span className="font-semibold block mb-1">{activeVerticalDef.protocolBox.title}</span>
              {activeVerticalDef.protocolBox.text}
            </div>
          </CardContent>
          <CardFooter className="flex justify-between border-t p-4">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
            </Button>
            <Button 
              onClick={() => {
                if (!formData.receptionist_phone.trim()) {
                  alert("Please enter an escalation/transfer phone number before proceeding.");
                  return;
                }
                setStep(3);
              }} 
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Next: Languages <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* STEP 3: LANGUAGES & CONFIRMATIONS */}
      {step === 3 && (
        <Card className="border-border/80 shadow-md">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Languages className="h-5 w-5 text-emerald-500" />
              Step 3: Multi-Language & Messaging Preferences
            </CardTitle>
            <CardDescription>
              Select the regional Indian languages your bot should speak and toggle post-call messaging.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Enabled Languages (Indian Regional + English)
                </label>
                <Badge variant="outline" className="text-xs">
                  {formData.enabled_languages.length} Selected
                </Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                {AVAILABLE_LANGUAGES.map((lang) => {
                  const isChecked = formData.enabled_languages.includes(lang.code);
                  return (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => toggleLanguage(lang.code)}
                      className={`flex items-center justify-between p-2.5 rounded-lg border text-left text-xs transition-colors cursor-pointer ${
                        isChecked 
                          ? "border-emerald-500 bg-emerald-500/10 font-medium text-emerald-700 dark:text-emerald-300" 
                          : "border-border hover:bg-muted/30 text-muted-foreground"
                      }`}
                    >
                      <div>
                        <div className="font-medium text-foreground">{lang.name}</div>
                        <div className="text-[10px] opacity-70">{lang.native}</div>
                      </div>
                      {isChecked && <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-4 border-t space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                <div>
                  <h4 className="text-xs font-semibold text-foreground">Auto-Detect & Switch Language Mid-Call</h4>
                  <p className="text-[11px] text-muted-foreground">
                    If caller starts speaking in Kannada or Hindi, Maya will automatically reply in that language.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={formData.auto_language_switch}
                  onChange={(e) => setFormData(prev => ({ ...prev, auto_language_switch: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                <div>
                  <h4 className="text-xs font-semibold text-foreground">Post-Call WhatsApp & SMS Confirmations</h4>
                  <p className="text-[11px] text-muted-foreground">
                    Automatically sends the patient booking date, doctor name, and clinic address right after the call.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={formData.whatsapp_confirmation_enabled}
                  onChange={(e) => setFormData(prev => ({ ...prev, whatsapp_confirmation_enabled: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between border-t p-4">
            <Button variant="outline" onClick={() => setStep(2)}>
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
            </Button>
            <Button onClick={() => setStep(4)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              Next: Telephony & Test <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* STEP 4: TELEPHONY PROVISIONING & 1-CLICK VERIFICATION */}
      {step === 4 && (
        <Card className="border-border/80 shadow-md">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <PhoneCall className="h-5 w-5 text-emerald-500" />
              Step 4: Telephony Setup & Live Test Call
            </CardTitle>
            <CardDescription>
              Choose how your clinic connects to Maya: Keep your existing phone number with 1-step forwarding, or activate a dedicated 10-digit mobile line.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Dual Provisioning Mode Selector */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Option A: Smart Call Forwarding */}
              <div 
                onClick={() => setFormData(prev => ({ ...prev, telephony_mode: "smart_forwarding" }))}
                className={`relative p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  formData.telephony_mode !== "dedicated_vmn"
                    ? "border-emerald-500 bg-emerald-500/5 shadow-sm"
                    : "border-border hover:border-emerald-500/40 bg-card"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <PhoneForwarded className="h-5 w-5" />
                    </span>
                    <div>
                      <h4 className="text-sm font-bold text-foreground">Option A: Smart Call Forwarding</h4>
                      <p className="text-[11px] text-muted-foreground">Keep your existing clinic phone number</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="border-emerald-500 text-emerald-600 text-[10px] font-semibold">
                    FREE & INSTANT
                  </Badge>
                </div>

                <div className="mt-3 text-xs text-muted-foreground">
                  Your patients continue dialing your existing Google Maps/WhatsApp clinic number. When you don't answer or line is busy, call forwards to Maya silently in &lt;1 sec.
                </div>

                {formData.telephony_mode !== "dedicated_vmn" && (
                  <div className="mt-4 pt-3 border-t space-y-3">
                    <div>
                      <label className="text-[11px] font-semibold text-foreground uppercase tracking-wider block mb-1">
                        Select Your Clinic SIM Carrier:
                      </label>
                      <div className="grid grid-cols-4 gap-1.5">
                        {["jio", "airtel", "vi", "bsnl"].map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFormData(prev => ({ ...prev, forwarding_carrier: c }));
                            }}
                            className={`py-1.5 px-2 rounded text-xs font-semibold uppercase transition-colors ${
                              formData.forwarding_carrier === c
                                ? "bg-emerald-600 text-white"
                                : "bg-muted text-foreground hover:bg-muted/80"
                            }`}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-background border font-mono text-xs">
                      <span className="text-[10px] text-muted-foreground uppercase font-sans font-semibold block mb-0.5">
                        Dial this on your clinic phone to activate:
                      </span>
                      <code className="text-emerald-600 dark:text-emerald-400 font-bold text-sm">
                        *401*{formData.virtual_number || "08047283676"}#
                      </code>
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-foreground uppercase tracking-wider block mb-1">
                        Your Existing Clinic Mobile / Landline:
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. +91 98450 12345"
                        value={formData.forwarding_phone_number || ""}
                        onChange={(e) => setFormData(prev => ({ ...prev, forwarding_phone_number: e.target.value }))}
                        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Option B: Dedicated 10-Digit Mobile Number */}
              <div 
                onClick={() => setFormData(prev => ({ ...prev, telephony_mode: "dedicated_vmn" }))}
                className={`relative p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  formData.telephony_mode === "dedicated_vmn"
                    ? "border-emerald-500 bg-emerald-500/5 shadow-sm"
                    : "border-border hover:border-emerald-500/40 bg-card"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                      <Smartphone className="h-5 w-5" />
                    </span>
                    <div>
                      <h4 className="text-sm font-bold text-foreground">Option B: Dedicated Mobile Line</h4>
                      <p className="text-[11px] text-muted-foreground">+91 9xxxxxxxxx Dedicated VMN</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="border-blue-500 text-blue-600 text-[10px] font-semibold">
                    ENTERPRISE VMN
                  </Badge>
                </div>

                <div className="mt-3 text-xs text-muted-foreground">
                  Get a dedicated 10-digit Indian mobile number for prescription pads, clinic signboards, and WhatsApp profiles with 30 simultaneous calling channels.
                </div>

                {formData.telephony_mode === "dedicated_vmn" && (
                  <div className="mt-4 pt-3 border-t space-y-3">
                    <div>
                      <label className="text-[11px] font-semibold text-foreground uppercase tracking-wider block mb-1">
                        Assigned 10-Digit Enterprise Mobile Line:
                      </label>
                      <div className="space-y-1.5">
                        {[
                          { num: "+91 98450 24001", tag: "Fast Bangalore Gateway" },
                          { num: "+91 98450 24002", tag: "High-Capacity Cellular Trunk" },
                          { num: "+91 98450 24003", tag: "National Priority Line" }
                        ].map((vmn) => (
                          <div 
                            key={vmn.num}
                            onClick={(e) => {
                              e.stopPropagation();
                              setFormData(prev => ({ ...prev, vmn_number: vmn.num, vmn_status: "active" }));
                            }}
                            className={`p-2 rounded-lg border flex items-center justify-between text-xs cursor-pointer transition-colors ${
                              formData.vmn_number === vmn.num
                                ? "border-emerald-500 bg-emerald-500/10 font-bold text-foreground"
                                : "hover:bg-muted/30 text-muted-foreground"
                            }`}
                          >
                            <span className="font-mono text-sm">{vmn.num}</span>
                            <span className="text-[10px] text-muted-foreground">{vmn.tag}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-800 dark:text-emerald-300">
                      ✅ <strong>Direct Inbound &amp; Outbound Active:</strong> Patients can dial this mobile number directly or receive confirmation calls from it without busy tones.
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Instant Mobile Test Calling Section */}
            <div className="p-5 rounded-xl border bg-muted/10 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-emerald-500" />
                  <h4 className="text-sm font-semibold">Test Your Voice AI Live on Mobile</h4>
                </div>
                {/* Agent Role Toggle */}
                <div className="flex rounded-lg border bg-background p-0.5 text-xs self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setTestCallRole("receptionist")}
                    className={`px-2.5 py-1 rounded font-medium transition-colors ${
                      testCallRole === "receptionist"
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    👩‍⚕️ {formData.bot_name || "Maya"} (Receptionist)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTestCallRole("sales")}
                    className={`px-2.5 py-1 rounded font-medium transition-colors ${
                      testCallRole === "sales"
                        ? "bg-blue-600 text-white shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    💼 {formData.sales_agent_name || "Rohan"} (Sales &amp; Offers)
                  </button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {testCallRole === "receptionist"
                  ? `Dial your phone to experience ${formData.bot_name || "Maya"} answering incoming appointment queries and operating hours.`
                  : `Dial your phone to experience ${formData.sales_agent_name || "Rohan"} presenting your featured offer (${formData.sales_packages?.[0]?.name || "Package"} at ₹${formData.sales_packages?.[0]?.price_inr || 999}) with consultative EQ.`}
              </p>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter 10-digit mobile (e.g. 9845012345)"
                  value={testCallPhone}
                  onChange={(e) => setTestCallPhone(e.target.value)}
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <Button
                  onClick={handleTestCall}
                  disabled={testCalling}
                  className={testCallRole === "sales" ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-emerald-600 hover:bg-emerald-700 text-white"}
                >
                  {testCalling ? "Dialing..." : `Call My Phone (${testCallRole === "sales" ? "Sales" : "Reception"})`}
                </Button>
              </div>

              {testCallStatus && (
                <div className="text-xs p-2.5 rounded bg-background border text-foreground">
                  {testCallStatus}
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex justify-between border-t p-4">
            <Button variant="outline" onClick={() => setStep(3)}>
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-6"
            >
              {saving ? "Activating..." : "Save & Activate Dual AI Agents 🎉"}
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
