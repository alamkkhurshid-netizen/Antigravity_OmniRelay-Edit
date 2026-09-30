import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Location, Service, Resource, Availability, ScheduleException, Appointment, DaySchedule } from "./types";
import { activeStatuses, addDays, buildSchedule, dateKey, dayNames, minutes, rulesFor, slotsFor } from "./utils";

export function useAppointments(
  organizationId: string,
  locations: Location[],
  services: Service[],
  resources: Resource[],
  appointments: Appointment[],
  availability: Availability[],
  exceptions: ScheduleException[],
  nowIso: string,
  providerDepartments: Array<{ resource_id: string; department_id: string }>
) {
  const router = useRouter();
  const today = dateKey(new Date(nowIso));

  // --- UI Layout State ---
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [view, setView] = useState<"week" | "agenda">("week");
  const [weekStart, setWeekStart] = useState(today);
  const [activeAppointment, setActiveAppointment] = useState<Appointment | null>(null);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [disruptionOpen, setDisruptionOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);

  // --- Booking Form State ---
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [resourceId, setResourceId] = useState(resources[0]?.id ?? "");
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [notes, setNotes] = useState("");

  // --- Availability Editor State ---
  const [availabilityResource, setAvailabilityResource] = useState(resources[0]?.id ?? "");
  const [schedule, setSchedule] = useState<DaySchedule[]>(() => buildSchedule(availability, resources[0]?.id ?? ""));

  // --- Disruption State ---
  const [disruptionResource, setDisruptionResource] = useState(resources[0]?.id ?? "");
  const [disruptionLocation, setDisruptionLocation] = useState("");
  const [disruptionDate, setDisruptionDate] = useState(today);
  const [disruptionStart, setDisruptionStart] = useState("09:00");
  const [disruptionEnd, setDisruptionEnd] = useState("18:00");
  const [disruptionType, setDisruptionType] = useState("emergency");
  const [disruptionReason, setDisruptionReason] = useState("");
  const [disruptionResult, setDisruptionResult] = useState<{ affected_appointments: number; notifications_queued: number } | null>(null);

  // --- Filtering State ---
  const [filterLocation, setFilterLocation] = useState("");
  const [filterResource, setFilterResource] = useState("");
  const [filterStatus, setFilterStatus] = useState("active");

  // --- Follow-Up Planner State ---
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpNote, setFollowUpNote] = useState("");
  const [followUpAppointmentId, setFollowUpAppointmentId] = useState("");

  // --- Clinical Documenting State ---
  const [documenting, setDocumenting] = useState(false);
  const [encounterType, setEncounterType] = useState("consultation");
  const [diagnosis, setDiagnosis] = useState("");
  const [clinicalNote, setClinicalNote] = useState("");
  const [treatmentPlan, setTreatmentPlan] = useState("");
  const [visitFollowUpDate, setVisitFollowUpDate] = useState("");

  // --- Rescheduling State ---
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState(today);
  const [rescheduleSlot, setRescheduleSlot] = useState("");

  // --- Substitute State ---
  const [substituteOpen, setSubstituteOpen] = useState(false);
  const [substituteResourceId, setSubstituteResourceId] = useState("");
  const [substituteDate, setSubstituteDate] = useState(today);
  const [substituteSlot, setSubstituteSlot] = useState("");

  // --- Derived State (Booking) ---
  const chosenService = services.find((item) => item.id === serviceId);
  const chosenRules = rulesFor(availability, resourceId, selectedDate, locationId);
  const availableSlots = slotsFor(chosenRules, chosenService, selectedDate, resourceId, locationId, appointments, exceptions, nowIso);

  // --- Derived State (Calendar) ---
  const weekDates = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const filteredAppointments = appointments.filter((item) =>
    (!filterLocation || item.location_id === filterLocation) && (!filterResource || item.resource_id === filterResource) &&
    (filterStatus === "all" || (filterStatus === "active" ? ["pending", "payment_pending", "confirmed", "arrived", "in_consultation", "rescheduling_required"].includes(item.status) : item.status === filterStatus))
  );
  const weekAppointments = filteredAppointments.filter((item) => item.status !== "cancelled" && dateKey(new Date(item.starts_at)) >= weekDates[0] && dateKey(new Date(item.starts_at)) <= weekDates[6]);

  // --- Derived State (Reschedule & Substitute) ---
  const rescheduleService = activeAppointment ? services.find((item) => item.id === activeAppointment.service_id) : undefined;
  const rescheduleRules = activeAppointment ? rulesFor(availability, activeAppointment.resource_id, rescheduleDate, activeAppointment.location_id) : [];
  const rescheduleSlots = activeAppointment ? slotsFor(rescheduleRules, rescheduleService, rescheduleDate, activeAppointment.resource_id, activeAppointment.location_id, appointments, exceptions, nowIso, activeAppointment.id) : [];

  const sourceDepartmentIds = activeAppointment ? providerDepartments.filter(item => item.resource_id === activeAppointment.resource_id).map(item => item.department_id) : [];
  const substituteResources = activeAppointment && sourceDepartmentIds.length > 0 ? resources.filter(item => item.id !== activeAppointment.resource_id && providerDepartments.some(link => link.resource_id === item.id && sourceDepartmentIds.includes(link.department_id))) : [];
  const substituteService = activeAppointment ? services.find(item => item.id === activeAppointment.service_id) : undefined;
  const substituteRules = activeAppointment ? rulesFor(availability, substituteResourceId, substituteDate, activeAppointment.location_id) : [];
  const substituteSlots = activeAppointment ? slotsFor(substituteRules, substituteService, substituteDate, substituteResourceId, activeAppointment.location_id, appointments, exceptions, nowIso, activeAppointment.id) : [];

  // --- Derived State (Disruptions) ---
  const disruptionStartIso = new Date(`${disruptionDate}T${disruptionStart}:00+05:30`).toISOString();
  const disruptionEndIso = new Date(`${disruptionDate}T${disruptionEnd}:00+05:30`).toISOString();
  const disruptionAffected = appointments.filter((item) => activeStatuses.includes(item.status) && (disruptionResource === "" || item.resource_id === disruptionResource) && (disruptionLocation === "" || item.location_id === disruptionLocation) && new Date(item.starts_at) < new Date(disruptionEndIso) && new Date(item.ends_at) > new Date(disruptionStartIso));


  // --- Actions ---
  async function createAppointment(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMessage("");
    const supabase = createClient();
    const { error } = await supabase.rpc("create_appointment", { p_organization_id: organizationId, p_resource_id: resourceId, p_location_id: locationId, p_service_id: serviceId, p_customer_name: customerName, p_customer_phone: customerPhone, p_customer_email: customerEmail, p_starts_at: selectedSlot, p_notes: notes });
    if (error) { setMessage(error.message); setBusy(false); return; }
    router.refresh();
  }

  function startFollowUpBooking(appointment: Appointment) {
    setCustomerName(appointment.customer_name); setCustomerPhone(appointment.customer_phone ?? ""); setCustomerEmail(appointment.customer_email ?? "");
    setLocationId(appointment.location_id); setServiceId(appointment.service_id); setResourceId(appointment.resource_id);
    setSelectedDate(today); setSelectedSlot(""); setNotes(`Follow-up for appointment ${dateKey(new Date(appointment.starts_at))}`); setOpen(true);
    setMessage(`Follow-up booking: ${appointment.resource?.name ?? "the original doctor"} is selected first. Choose an available slot, or use the substitute flow only if necessary.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function cancelAppointment(id: string) {
    await updateStatus(id, "cancelled");
  }

  async function updateStatus(id: string, status: string) {
    if (status === "completed") { setDocumenting(true); return; }
    setBusy(true); setMessage("");
    const { error } = await createClient().rpc("update_appointment_status", { p_organization_id: organizationId, p_appointment_id: id, p_status: status });
    if (error) { setMessage(error.message); setBusy(false); } else router.refresh();
  }

  async function completeConsultation() {
    if (!activeAppointment || !clinicalNote.trim()) { setMessage("Add a clinical note before completing this consultation."); return; }
    setBusy(true); setMessage("");
    const { error } = await createClient().rpc("complete_appointment_visit", {
      p_organization_id: organizationId, p_appointment_id: activeAppointment.id,
      p_clinical_note: clinicalNote, p_diagnosis: diagnosis,
      p_treatment_plan: treatmentPlan, p_follow_up_note: treatmentPlan,
      p_follow_up_at: visitFollowUpDate ? new Date(`${visitFollowUpDate}T09:00:00+05:30`).toISOString() : null,
      p_encounter_type: encounterType,
    });
    if (error) { setMessage(error.message); setBusy(false); return; }
    setMessage("Visit documented, appointment completed and follow-up actions synchronized.");
    window.setTimeout(() => router.refresh(), 900);
  }

  async function rescheduleAppointment() {
    if (!activeAppointment || !rescheduleSlot) return;
    setBusy(true); setMessage("");
    const { error } = await createClient().rpc("reschedule_appointment", { p_organization_id: organizationId, p_appointment_id: activeAppointment.id, p_starts_at: rescheduleSlot });
    if (error) { setMessage(error.message); setBusy(false); } else router.refresh();
  }

  async function assignSubstitute() {
    if (!activeAppointment || !substituteResourceId || !substituteSlot) return;
    setBusy(true); setMessage("");
    const { error } = await createClient().rpc("reassign_appointment_provider", { p_organization_id: organizationId, p_appointment_id: activeAppointment.id, p_resource_id: substituteResourceId, p_starts_at: substituteSlot });
    if (error) { setMessage(error.message); setBusy(false); return; }
    router.refresh();
  }

  function loadSchedule(nextResource: string) {
    setAvailabilityResource(nextResource);
    setSchedule(buildSchedule(availability, nextResource));
  }

  async function saveAvailability() {
    setBusy(true); setMessage("");
    const supabase = createClient();
    for (const item of schedule) {
      if (item.active && minutes(item.end_time) <= minutes(item.start_time)) { setMessage(`${dayNames[item.weekday]} closing time must be after opening time.`); setBusy(false); return; }
      const payload = { active: item.active, start_time: item.start_time, end_time: item.end_time, slot_interval_minutes: item.slot_interval_minutes, updated_at: new Date().toISOString() };
      const result = item.id
        ? await supabase.from("availability_rules").update(payload).eq("id", item.id).eq("organization_id", organizationId)
        : await supabase.from("availability_rules").insert({ ...payload, organization_id: organizationId, resource_id: availabilityResource, location_id: null, weekday: item.weekday });
      if (result.error) { setMessage(result.error.message); setBusy(false); return; }
    }
    router.refresh();
  }

  async function createDisruption() {
    if (!disruptionReason.trim()) { setMessage("Add a patient-safe reason for this schedule change."); return; }
    if (new Date(disruptionEndIso) <= new Date(disruptionStartIso)) { setMessage("The end time must be after the start time."); return; }
    setBusy(true); setMessage(""); setDisruptionResult(null);
    const { data, error } = await createClient().rpc("create_schedule_exception", {
      p_organization_id: organizationId, p_resource_id: disruptionResource || null, p_location_id: disruptionLocation || null,
      p_starts_at: disruptionStartIso, p_ends_at: disruptionEndIso, p_exception_type: disruptionType, p_reason: disruptionReason,
    });
    if (error) { setMessage(error.message); setBusy(false); return; }
    setDisruptionResult(data as { affected_appointments: number; notifications_queued: number });
    window.setTimeout(() => router.refresh(), 1100);
  }

  async function saveFollowUp() {
    if (!followUpAppointmentId || !followUpDate) return;
    setBusy(true); setMessage("");
    const { error } = await createClient().rpc("set_appointment_follow_up", {
      p_organization_id: organizationId, p_appointment_id: followUpAppointmentId,
      p_follow_up_at: new Date(`${followUpDate}T09:00:00+05:30`).toISOString(), p_note: followUpNote,
    });
    if (error) { setMessage(error.message); setBusy(false); return; }
    router.refresh();
  }

  return {
    today, open, setOpen, busy, setBusy, message, setMessage, view, setView, weekStart, setWeekStart,
    activeAppointment, setActiveAppointment, availabilityOpen, setAvailabilityOpen, disruptionOpen, setDisruptionOpen, notificationOpen, setNotificationOpen,
    customerName, setCustomerName, customerPhone, setCustomerPhone, customerEmail, setCustomerEmail, locationId, setLocationId, serviceId, setServiceId, resourceId, setResourceId,
    selectedDate, setSelectedDate, selectedSlot, setSelectedSlot, notes, setNotes,
    availabilityResource, setAvailabilityResource, schedule, setSchedule,
    disruptionResource, setDisruptionResource, disruptionLocation, setDisruptionLocation, disruptionDate, setDisruptionDate, disruptionStart, setDisruptionStart,
    disruptionEnd, setDisruptionEnd, disruptionType, setDisruptionType, disruptionReason, setDisruptionReason, disruptionResult, setDisruptionResult,
    filterLocation, setFilterLocation, filterResource, setFilterResource, filterStatus, setFilterStatus,
    followUpDate, setFollowUpDate, followUpNote, setFollowUpNote, followUpAppointmentId, setFollowUpAppointmentId,
    documenting, setDocumenting, encounterType, setEncounterType, diagnosis, setDiagnosis, clinicalNote, setClinicalNote, treatmentPlan, setTreatmentPlan, visitFollowUpDate, setVisitFollowUpDate,
    rescheduling, setRescheduling, rescheduleDate, setRescheduleDate, rescheduleSlot, setRescheduleSlot,
    substituteOpen, setSubstituteOpen, substituteResourceId, setSubstituteResourceId, substituteDate, setSubstituteDate, substituteSlot, setSubstituteSlot,
    chosenService, chosenRules, availableSlots, weekDates, filteredAppointments, weekAppointments,
    rescheduleService, rescheduleRules, rescheduleSlots, substituteResources, substituteService, substituteRules, substituteSlots, disruptionAffected,
    createAppointment, startFollowUpBooking, cancelAppointment, updateStatus, completeConsultation, rescheduleAppointment, assignSubstitute, loadSchedule, saveAvailability, createDisruption, saveFollowUp
  };
}
