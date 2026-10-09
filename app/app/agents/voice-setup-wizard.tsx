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
  Smartphone
} from "lucide-react";

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
}

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
  const [testCallStatus, setTestCallStatus] = useState<string | null>(null);
  const [activeAudioPreview, setActiveAudioPreview] = useState<string | null>(null);

  const [formData, setFormData] = useState<VoiceConfig>({
    org_id: organizationId,
    clinic_name: initialConfig?.clinic_name || "My Clinic",
    bot_name: initialConfig?.bot_name || "Maya",
    agent_persona: initialConfig?.agent_persona || "receptionist",
    voice_id: initialConfig?.voice_id || "sonic-english-indian-1",
    virtual_number: initialConfig?.virtual_number || "08047283676",
    receptionist_phone: initialConfig?.receptionist_phone || "",
    greeting_message: initialConfig?.greeting_message || `Hello! Thank you for calling ${initialConfig?.clinic_name || "our clinic"}. How can I help you today?`,
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
  });

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
      const res = await fetch("/api/voice/test-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: testCallPhone,
          bot_name: formData.bot_name,
          tester_name: formData.clinic_name
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setTestCallStatus("Failed: " + (data.error || "Could not dial"));
      } else {
        setTestCallStatus("Success! Your phone is ringing right now. Answer to talk to " + formData.bot_name + ".");
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

      {/* STEP 1: IDENTITY & VOICE */}
      {step === 1 && (
        <Card className="border-border/80 shadow-md">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Bot className="h-5 w-5 text-emerald-500" />
              Step 1: Bot Identity & Voice Persona
            </CardTitle>
            <CardDescription>
              Choose how your AI receptionist introduces herself and sounds to patients.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Clinic / Hospital Name
                </label>
                <input
                  type="text"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  value={formData.clinic_name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setFormData(prev => ({
                      ...prev,
                      clinic_name: name,
                      greeting_message: `Hello! Thank you for calling ${name}. How can I help you today?`
                    }));
                  }}
                  placeholder="e.g. Apollo Dental Center"
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  AI Receptionist Name
                </label>
                <input
                  type="text"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  value={formData.bot_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, bot_name: e.target.value }))}
                  placeholder="e.g. Maya"
                />
              </div>
            </div>

            {/* Voice Persona Selector Cards */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 block">
                Choose Voice Sound & Persona
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {VOICE_PERSONAS.map((persona) => {
                  const isSelected = formData.voice_id === persona.id;
                  return (
                    <div
                      key={persona.id}
                      onClick={() => setFormData(prev => ({ ...prev, voice_id: persona.id }))}
                      className={`relative p-4 rounded-xl border-2 transition-all cursor-pointer ${
                        isSelected 
                          ? "border-emerald-500 bg-emerald-500/5 shadow-sm" 
                          : "border-border hover:border-border/80 hover:bg-muted/30"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-semibold text-sm flex items-center gap-1.5">
                            {persona.name}
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {persona.gender}
                            </Badge>
                          </h4>
                          <p className="text-xs text-muted-foreground mt-1">{persona.style}</p>
                          <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 mt-0.5">
                            {persona.accent}
                          </p>
                        </div>
                        {isSelected && (
                          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        )}
                      </div>

                      <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7 px-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            playVoicePreview(persona.id);
                          }}
                        >
                          {activeAudioPreview === persona.id ? (
                            <span className="flex items-center gap-1 text-emerald-500">
                              <Volume2 className="h-3.5 w-3.5 animate-pulse" /> Playing...
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <Play className="h-3 w-3" /> Preview Voice
                            </span>
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Custom Welcome Greeting */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Phone Welcome Greeting (Plays when patient calls)
              </label>
              <textarea
                rows={2}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                value={formData.greeting_message}
                onChange={(e) => setFormData(prev => ({ ...prev, greeting_message: e.target.value }))}
                placeholder="Hello! Thank you for calling our clinic. How can I assist you with your appointment?"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Tip: Keep it short (1 sentence) so the patient can speak without waiting.
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between border-t p-4">
            <span />
            <Button onClick={() => setStep(2)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
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
              Step 2: Operating Hours & Human Transfer Safety
            </CardTitle>
            <CardDescription>
              Specify clinic timings and where to transfer calls when a patient asks for a human.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> Clinic Operating Hours
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
                  <PhoneForwarded className="h-3.5 w-3.5" /> Human Front-Desk Transfer Phone (Required)
                </label>
                <input
                  type="text"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 font-medium"
                  value={formData.receptionist_phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, receptionist_phone: e.target.value }))}
                  placeholder="e.g. +91 98450 12345 or 08047283676"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  If a caller demands a human or reports a severe medical emergency, Maya will warmly transfer them to this number.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300">
              <span className="font-semibold block mb-1">🏥 Emergency Protocol Built-in:</span>
              If a patient speaks emergency keywords (e.g. <em>"severe chest pain", "heavy bleeding", "difficulty breathing"</em>), the voice engine deterministically bypasses LLM conversation in &lt;10ms, provides emergency first-aid guidance, and immediately dials your front-desk transfer number.
            </div>
          </CardContent>
          <CardFooter className="flex justify-between border-t p-4">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
            </Button>
            <Button 
              onClick={() => {
                if (!formData.receptionist_phone.trim()) {
                  alert("Please enter a front-desk transfer phone number before proceeding.");
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
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-emerald-500" />
                <h4 className="text-sm font-semibold">Test Maya Live on Your Mobile Right Now</h4>
              </div>
              <p className="text-xs text-muted-foreground">
                Enter your mobile number below. OmniRelay will ring your phone in 5 seconds so you can hear Maya speak in your clinic name!
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
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {testCalling ? "Dialing..." : "Call My Phone"}
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
              {saving ? "Activating..." : "Save & Activate AI Receptionist 🎉"}
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
