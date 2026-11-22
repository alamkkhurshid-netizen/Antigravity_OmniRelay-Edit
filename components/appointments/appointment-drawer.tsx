"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageSquare, Send, CheckCircle2, Loader2, ArrowRight, ExternalLink } from "lucide-react";
import { Appointment, Resource } from "@/app/app/appointments/types";
import { dateKey, longDate, timeLabel, activeStatuses, addDays } from "@/app/app/appointments/utils";

interface AppointmentDrawerProps {
  activeAppointment: Appointment;
  setActiveAppointment: (val: Appointment | null) => void;
  updateStatus: (id: string, status: string) => void;
  cancelAppointment: (id: string) => void;
  rescheduling: boolean;
  setRescheduling: (val: boolean) => void;
  substituteOpen: boolean;
  setSubstituteOpen: (val: boolean) => void;
  substituteResources: Resource[];
  setSubstituteResourceId: (val: string) => void;
  setSubstituteDate: (val: string) => void;
  setSubstituteSlot: (val: string) => void;
  today: string;
  rescheduleDate: string;
  setRescheduleDate: (val: string) => void;
  rescheduleSlot: string;
  setRescheduleSlot: (val: string) => void;
  rescheduleSlots: Array<{ iso: string; label: string; period: string }>;
  rescheduleAppointment: () => void;
  substituteResourceId: string;
  substituteDate: string;
  substituteSlot: string;
  substituteSlots: Array<{ iso: string; label: string; period: string }>;
  assignSubstitute: () => void;
  busy: boolean;
  message: string;
}

export function AppointmentDrawer({
  activeAppointment, setActiveAppointment, updateStatus, cancelAppointment,
  rescheduling, setRescheduling,
  substituteOpen, setSubstituteOpen, substituteResources,
  setSubstituteResourceId, setSubstituteDate, setSubstituteSlot,
  today,
  rescheduleDate, setRescheduleDate, rescheduleSlot, setRescheduleSlot, rescheduleSlots, rescheduleAppointment,
  substituteResourceId, substituteDate, substituteSlot, substituteSlots, assignSubstitute,
  busy, message
}: AppointmentDrawerProps) {
  const [quickChatOpen, setQuickChatOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatFeedback, setChatFeedback] = useState<{ success: boolean; text: string; mode?: string } | null>(null);

  const cleanPhone = (activeAppointment.customer_phone || "").replace(/\D/g, "");
  const doctorName = activeAppointment.resource?.name ? `Dr. ${activeAppointment.resource.name}` : "our doctor";
  const slotTime = timeLabel(new Date(activeAppointment.starts_at));

  return (
    <div className="appointment-drawer-backdrop" onClick={() => setActiveAppointment(null)}>
      <aside className="appointment-drawer" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <span className="app-eyebrow">APPOINTMENT</span>
            <h3>{activeAppointment.customer_name}</h3>
          </div>
          <button onClick={() => setActiveAppointment(null)} aria-label="Close details">×</button>
        </header>
        <div className="appointment-detail-time">
          <b>{longDate(dateKey(new Date(activeAppointment.starts_at)))}</b>
          <span>{timeLabel(new Date(activeAppointment.starts_at))}–{timeLabel(new Date(activeAppointment.ends_at))}</span>
        </div>
        <dl>
          <div><dt>Status</dt><dd>{activeAppointment.status.replaceAll("_", " ")}</dd></div>
          <div><dt>Service</dt><dd>{activeAppointment.service?.name}</dd></div>
          <div><dt>Provider</dt><dd>{activeAppointment.resource?.name}</dd></div>
          <div><dt>Location</dt><dd>{activeAppointment.location?.name}</dd></div>
          <div>
            <dt>Contact</dt>
            <dd className="flex items-center justify-between gap-2">
              <span>{activeAppointment.customer_phone || activeAppointment.customer_email || "Not supplied"}</span>
              {activeAppointment.customer_phone && (
                <button
                  type="button"
                  onClick={() => {
                    setQuickChatOpen(true);
                    setChatFeedback(null);
                    if (!chatMessage) {
                      setChatMessage(`Hello ${activeAppointment.customer_name}, reminder regarding your appointment with ${doctorName} scheduled for ${slotTime}.`);
                    }
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#25D366]/15 hover:bg-[#25D366]/25 text-[#075e54] font-bold text-xs transition-colors cursor-pointer border border-[#25D366]/30 shrink-0"
                  title="Open WhatsApp Chat"
                >
                  <MessageSquare className="size-3" />
                  <span>WhatsApp</span>
                </button>
              )}
            </dd>
          </div>
          <div><dt>Source</dt><dd>{activeAppointment.source}</dd></div>
          {activeAppointment.notes && <div><dt>Notes</dt><dd>{activeAppointment.notes}</dd></div>}
        </dl>
        {(activeStatuses.includes(activeAppointment.status) || activeAppointment.status === "rescheduling_required") && (
          <>
            <div className="lifecycle-actions">
              {activeAppointment.status === "pending" && <button onClick={() => updateStatus(activeAppointment.id, "confirmed")} disabled={busy}>Confirm</button>}
              {activeAppointment.status === "confirmed" && <button onClick={() => updateStatus(activeAppointment.id, "arrived")} disabled={busy}>Mark arrived</button>}
              {activeAppointment.status === "arrived" && <button onClick={() => updateStatus(activeAppointment.id, "in_consultation")} disabled={busy}>Start consultation</button>}
              {["confirmed", "arrived", "in_consultation"].includes(activeAppointment.status) && <button onClick={() => updateStatus(activeAppointment.id, "completed")} disabled={busy}>Complete & document</button>}
              {["confirmed"].includes(activeAppointment.status) && <button onClick={() => updateStatus(activeAppointment.id, "no_show")} disabled={busy}>Mark no-show</button>}
            </div>
            <div className="drawer-actions">
              {activeAppointment.customer_phone && (
                <button
                  type="button"
                  className="secondary-button !border-[#25D366]/50 !bg-[#25D366]/15 !text-[#075e54] hover:!bg-[#25D366]/25 flex items-center justify-center gap-1.5 font-bold"
                  onClick={() => {
                    setQuickChatOpen(!quickChatOpen);
                    setChatFeedback(null);
                    if (!chatMessage) {
                      setChatMessage(`Hello ${activeAppointment.customer_name}, reminder regarding your appointment with ${doctorName} scheduled for ${slotTime}.`);
                    }
                  }}
                >
                  <MessageSquare className="size-3.5" />
                  <span>WhatsApp Chat</span>
                </button>
              )}
              <button className="secondary-button" onClick={() => setRescheduling(!rescheduling)}>{rescheduling ? "Keep current time" : "Reschedule"}</button>
              {substituteResources.length > 0 && <button className="secondary-button" onClick={() => { setSubstituteOpen(!substituteOpen); setSubstituteResourceId(substituteResources[0]?.id ?? ""); setSubstituteDate(dateKey(new Date(activeAppointment.starts_at))); setSubstituteSlot("") }}>Offer substitute doctor</button>}
              <button className="danger-button" onClick={() => cancelAppointment(activeAppointment.id)} disabled={busy}>Cancel appointment</button>
            </div>
          </>
        )}
        {quickChatOpen && activeAppointment.customer_phone && (
          <section className="mt-4 rounded-2xl border border-[#25D366]/40 bg-[linear-gradient(180deg,#f0fdf4,#ffffff)] p-4 shadow-sm">
            <div className="flex items-center justify-between pb-2 border-b border-emerald-100">
              <div className="flex items-center gap-2 text-emerald-900 font-bold text-xs">
                <MessageSquare className="size-4 text-[#25D366]" />
                <span>Quick WhatsApp with {activeAppointment.customer_name}</span>
              </div>
              <button
                type="button"
                onClick={() => setQuickChatOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold cursor-pointer"
                aria-label="Close chat"
              >
                ✕
              </button>
            </div>

            <div className="mt-2 text-xs text-slate-600">
              Recipient: <b>{activeAppointment.customer_phone}</b>
            </div>

            <div className="mt-3 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Quick Presets:</span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setChatMessage(`Hello ${activeAppointment.customer_name}, this is a reminder for your appointment with ${doctorName} at ${slotTime}. Please arrive 15 minutes before your slot.`);
                  }}
                  className="text-[11px] px-2.5 py-1 rounded-md bg-white border border-slate-200 text-slate-700 hover:border-emerald-500 hover:text-emerald-700 transition cursor-pointer"
                >
                  ⏰ Reminder
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const loc = activeAppointment.location?.name ? `in ${activeAppointment.location.name}` : "";
                    setChatMessage(`Hello ${activeAppointment.customer_name}, ${doctorName} is ready for you now ${loc}. Please proceed inside.`);
                  }}
                  className="text-[11px] px-2.5 py-1 rounded-md bg-white border border-slate-200 text-slate-700 hover:border-emerald-500 hover:text-emerald-700 transition cursor-pointer"
                >
                  👨‍⚕️ Doctor Ready
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChatMessage(`Hello ${activeAppointment.customer_name}, ${doctorName} has a slight emergency delay today. We will call you shortly.`);
                  }}
                  className="text-[11px] px-2.5 py-1 rounded-md bg-white border border-slate-200 text-slate-700 hover:border-emerald-500 hover:text-emerald-700 transition cursor-pointer"
                >
                  ⚠️ Delay Update
                </button>
              </div>
            </div>

            <div className="mt-3">
              <textarea
                rows={3}
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                placeholder="Type a WhatsApp message to patient..."
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none"
              />
            </div>

            {chatFeedback && (
              <div className={`mt-2 p-2 rounded-lg text-xs font-medium flex items-center gap-1.5 ${chatFeedback.success ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                {chatFeedback.success ? <CheckCircle2 className="size-4 shrink-0 text-emerald-600" /> : null}
                <span>{chatFeedback.text}</span>
              </div>
            )}

            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                type="button"
                disabled={chatSending || !chatMessage.trim()}
                onClick={async () => {
                  if (!chatMessage.trim() || !activeAppointment.customer_phone) return;
                  setChatSending(true);
                  setChatFeedback(null);
                  try {
                    const res = await fetch("/api/conversations/quick-send", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        phone: activeAppointment.customer_phone,
                        name: activeAppointment.customer_name,
                        text: chatMessage.trim(),
                      }),
                    });
                    const data = await res.json();
                    if (!res.ok) {
                      setChatFeedback({ success: false, text: data.error || "Message failed to send." });
                    } else {
                      setChatFeedback({
                        success: true,
                        text: data.mode === "template"
                          ? "Delivered via approved Meta template (service window closed)."
                          : "Message delivered directly to patient on WhatsApp!",
                      });
                      setChatMessage("");
                    }
                  } catch (err: any) {
                    setChatFeedback({ success: false, text: err?.message || "Network error sending message." });
                  } finally {
                    setChatSending(false);
                  }
                }}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold text-xs transition-colors shadow-xs cursor-pointer disabled:opacity-50"
              >
                {chatSending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                <span>{chatSending ? "Sending..." : "Send WhatsApp"}</span>
              </button>

              <div className="flex items-center gap-2 text-[11px]">
                <Link
                  href={`/app/conversations?phone=${encodeURIComponent(activeAppointment.customer_phone)}&name=${encodeURIComponent(activeAppointment.customer_name)}`}
                  className="text-emerald-700 hover:underline font-semibold flex items-center gap-1"
                  onClick={() => setActiveAppointment(null)}
                >
                  <span>Open Full Chat</span>
                  <ArrowRight className="size-3" />
                </Link>
                {cleanPhone && (
                  <>
                    <span className="text-slate-300">|</span>
                    <a
                      href={`https://wa.me/${cleanPhone}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-500 hover:text-slate-800 flex items-center gap-0.5"
                      title="Open in WhatsApp Web"
                    >
                      <span>Web</span>
                      <ExternalLink className="size-2.5" />
                    </a>
                  </>
                )}
              </div>
            </div>
          </section>
        )}
        {rescheduling && (
          <section className="reschedule-panel">
            <b>Choose a new time</b>
            <div className="reschedule-dates">
              {Array.from({ length: 14 }, (_, index) => addDays(today, index)).map((key) => (
                <button className={rescheduleDate === key ? "selected" : ""} onClick={() => { setRescheduleDate(key); setRescheduleSlot(""); }} key={key}>
                  <span>{new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(new Date(`${key}T00:00:00+05:30`))}</span>
                  <b>{new Date(`${key}T00:00:00+05:30`).getDate()}</b>
                </button>
              ))}
            </div>
            <div className="reschedule-slots">
              {rescheduleSlots.length ? rescheduleSlots.map((slot) => (
                <button className={rescheduleSlot === slot.iso ? "selected" : ""} onClick={() => setRescheduleSlot(slot.iso)} key={slot.iso}>{slot.label}</button>
              )) : <span>No available times on this date.</span>}
            </div>
            <button className="primary-button" onClick={rescheduleAppointment} disabled={!rescheduleSlot || busy}>{busy ? "Checking…" : "Confirm new time"}</button>
          </section>
        )}
        {substituteOpen && (
          <section className="reschedule-panel">
            <b>Offer a suitable colleague</b>
            <p>Only doctors sharing this booking&apos;s department are shown. OmniRelay rechecks chamber, service, schedule and slot availability before changing the appointment.</p>
            <select value={substituteResourceId} onChange={event => { setSubstituteResourceId(event.target.value); setSubstituteSlot("") }}>
              {substituteResources.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <div className="reschedule-dates">
              {Array.from({ length: 14 }, (_, index) => addDays(today, index)).map((key) => (
                <button className={substituteDate === key ? "selected" : ""} onClick={() => { setSubstituteDate(key); setSubstituteSlot(""); }} key={key}>
                  <span>{new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(new Date(`${key}T00:00:00+05:30`))}</span>
                  <b>{new Date(`${key}T00:00:00+05:30`).getDate()}</b>
                </button>
              ))}
            </div>
            <div className="reschedule-slots">
              {substituteSlots.length ? substituteSlots.map((slot) => (
                <button className={substituteSlot === slot.iso ? "selected" : ""} onClick={() => setSubstituteSlot(slot.iso)} key={slot.iso}>{slot.label}</button>
              )) : <span>No suitable slots on this date.</span>}
            </div>
            <button className="primary-button" onClick={assignSubstitute} disabled={!substituteSlot || busy}>{busy ? "Checking…" : "Confirm substitute doctor"}</button>
          </section>
        )}
        {message && <p className="form-message" role="status">{message}</p>}
      </aside>
    </div>
  );
}
