export interface VoiceSlot {
  time: string; // "10:30"
  display_time: string; // "10:30 AM"
  starts_at: string; // ISO
  ends_at: string; // ISO
  doctor_id: string;
  doctor_name: string;
  available: boolean;
}

export interface AvailabilityResult {
  date: string;
  doctor_name: string;
  available_slots: VoiceSlot[];
  speech_summary: string;
}

/**
 * Generates slot intervals (e.g. 30 min) between start and end hour
 */
export function generateDaySlots(
  dateStr: string,
  startHour: number = 10,
  endHour: number = 18,
  intervalMinutes: number = 30
): Array<{ time: string; display_time: string; starts_at: string; ends_at: string }> {
  const slots: Array<{ time: string; display_time: string; starts_at: string; ends_at: string }> = [];

  for (let hour = startHour; hour < endHour; hour++) {
    for (let min = 0; min < 60; min += intervalMinutes) {
      const time = `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
      const period = hour >= 12 ? "PM" : "AM";
      const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
      const display_time = `${displayHour}:${String(min).padStart(2, "0")} ${period}`;

      const starts_at = new Date(`${dateStr}T${time}:00+05:30`).toISOString();
      const endMinute = min + intervalMinutes;
      const endH = endMinute >= 60 ? hour + 1 : hour;
      const endM = endMinute >= 60 ? endMinute - 60 : endMinute;
      const endTimeStr = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
      const ends_at = new Date(`${dateStr}T${endTimeStr}:00+05:30`).toISOString();

      slots.push({ time, display_time, starts_at, ends_at });
    }
  }

  return slots;
}

/**
 * Filter out slots that conflict with booked appointments
 */
export function filterAvailableSlots(
  allSlots: Array<{ time: string; display_time: string; starts_at: string; ends_at: string }>,
  bookedAppointments: Array<{ starts_at: string; ends_at: string }>,
  doctorId: string,
  doctorName: string
): VoiceSlot[] {
  return allSlots.map((slot) => {
    const slotStart = new Date(slot.starts_at).getTime();
    const slotEnd = new Date(slot.ends_at).getTime();

    const isBooked = bookedAppointments.some((appt) => {
      const apptStart = new Date(appt.starts_at).getTime();
      const apptEnd = new Date(appt.ends_at).getTime();
      // Overlap condition
      return slotStart < apptEnd && slotEnd > apptStart;
    });

    return {
      time: slot.time,
      display_time: slot.display_time,
      starts_at: slot.starts_at,
      ends_at: slot.ends_at,
      doctor_id: doctorId,
      doctor_name: doctorName,
      available: !isBooked,
    };
  });
}

/**
 * Builds natural speech output for voice agent LLM
 */
export function buildVoiceAvailabilitySpeech(
  doctorName: string,
  dateStr: string,
  availableSlots: VoiceSlot[]
): string {
  const free = availableSlots.filter((s) => s.available);
  if (free.length === 0) {
    return `I apologize, but Dr. ${doctorName} has no available slots left on ${dateStr}. Would you like me to check the next available day?`;
  }

  const sample = free.slice(0, 3).map((s) => s.display_time).join(", ");
  return `Dr. ${doctorName} has openings on ${dateStr}. Available times include ${sample}. Which time works best for you?`;
}
