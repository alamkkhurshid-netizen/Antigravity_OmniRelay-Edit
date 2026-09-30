import { Availability, DaySchedule, Service, Appointment, ScheduleException } from "./types";

export const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const activeStatuses = ["pending", "confirmed", "arrived", "in_consultation"];

export function minutes(value: string) {
  const [hours, mins] = value.split(":").map(Number);
  return hours * 60 + mins;
}

export function timeLabel(value: Date) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" }).format(value);
}

export function dateKey(value: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function addDays(key: string, amount: number) {
  const value = new Date(`${key}T00:00:00+05:30`);
  value.setDate(value.getDate() + amount);
  return dateKey(value);
}

export function longDate(key: string) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${key}T00:00:00+05:30`));
}

export function buildSchedule(availability: Availability[], resourceId: string): DaySchedule[] {
  return dayNames.map((_, weekday) => {
    const rule = availability.find((item) => item.resource_id === resourceId && item.weekday === weekday);
    return { weekday, id: rule?.id ?? "", active: Boolean(rule?.active), start_time: rule?.start_time?.slice(0,5) ?? "09:00", end_time: rule?.end_time?.slice(0,5) ?? "18:00", slot_interval_minutes: rule?.slot_interval_minutes ?? 15 };
  });
}

export function rulesFor(availability: Availability[], providerId: string, date: string, chamberId: string) {
  const weekday=new Date(`${date}T00:00:00+05:30`).getDay();
  const matching=availability.filter(item=>item.resource_id===providerId&&item.weekday===weekday&&(item.location_id===chamberId||item.location_id===null));
  return matching.filter(item=>item.location_id===chamberId||!matching.some(exact=>exact.location_id===chamberId&&exact.start_time===item.start_time&&exact.end_time===item.end_time));
}

export function slotsFor(rules: Availability[], service: Service | undefined, date: string, providerId: string, locationId: string, appointments: Appointment[], exceptions: ScheduleException[], nowIso: string, excludedId = "") {
  if (!rules.length || !service) return [];
  const result: Array<{ iso: string; label: string; period: "Morning" | "Afternoon" }> = [];
  for (const rule of rules) for (let cursor = minutes(rule.start_time); cursor + service.duration_minutes + service.buffer_minutes <= minutes(rule.end_time); cursor += rule.slot_interval_minutes) {
    const start = new Date(`${date}T${String(Math.floor(cursor / 60)).padStart(2,"0")}:${String(cursor % 60).padStart(2,"0")}:00+05:30`);
    const end = new Date(start.getTime() + (service.duration_minutes + service.buffer_minutes) * 60000);
    const overlap = appointments.some((item) => item.id !== excludedId && item.resource_id === providerId && activeStatuses.includes(item.status) && start < new Date(item.ends_at) && end > new Date(item.starts_at));
    const blocked = exceptions.some((item) => item.status === "active" && (item.resource_id === null || item.resource_id === providerId) && (item.location_id === null || item.location_id === locationId) && start < new Date(item.ends_at) && end > new Date(item.starts_at));
    if (!overlap && !blocked && start.getTime() > new Date(nowIso).getTime()) result.push({ iso: start.toISOString(), label: timeLabel(start), period: cursor < 720 ? "Morning" : "Afternoon" });
  }
  return Array.from(new Map(result.map(slot=>[slot.iso,slot])).values()).sort((left,right)=>left.iso.localeCompare(right.iso));
}
