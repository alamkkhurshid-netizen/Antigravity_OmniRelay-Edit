import { Json, Message } from "./types";

export function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function textFromContent(content: Json) {
  const value = object(content);
  if (typeof value.text === "string") return value.text;
  const file = object(value.file);
  if (typeof file.name === "string") return `Attachment · ${file.name}`;
  if (typeof value.kind === "string") return value.kind.replaceAll("_", " ");
  return "Message";
}

export function timeLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return new Intl.DateTimeFormat("en-IN", sameDay
    ? { hour: "numeric", minute: "2-digit" }
    : { day: "numeric", month: "short" }).format(date);
}

export function deliveryLabel(status: Json) {
  const value = object(status);
  if (value.failed) return "Failed";
  if (value.read) return "Read";
  if (value.delivered) return "Delivered";
  if (value.sent || value.accepted) return "Sent";
  return "Sending";
}

export function deliveryPresentation(status: Json) {
  const label = deliveryLabel(status);
  if (label === "Read") return { label, icon: "✓✓", className: "read" };
  if (label === "Delivered") return { label, icon: "✓✓", className: "delivered" };
  if (label === "Sent") return { label, icon: "✓", className: "sent" };
  if (label === "Failed") return { label, icon: "!", className: "failed" };
  return { label, icon: "◷", className: "sending" };
}

export function messageOrigin(message: Message) {
  if (message.direction === "incoming") return "Patient reply";
  if (message.direction === "internal") return "Internal note";
  const source = String(object(message.status).source ?? "");
  if (source === "booking_concierge") return "Booking concierge";
  if (source === "whatsapp_booking_handoff") return "Booking confirmation";
  return "Staff reply";
}
