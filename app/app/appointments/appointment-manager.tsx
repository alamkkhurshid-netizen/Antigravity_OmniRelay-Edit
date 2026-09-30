"use client";

import Link from "next/link";
import { BookingShare } from "./booking-share";
import { WorkspaceHero } from "@/components/workspace-hero";
import { NotificationOperations } from "@/components/appointments/notification-operations";
import { FollowUpPlanner } from "@/components/appointments/follow-up-planner";
import { Location, Service, Resource, Availability, ScheduleException, Reminder, Appointment } from "./types";
import { useAppointments } from "./use-appointments";
import { BookingForm } from "@/components/appointments/booking-form";
import { AvailabilityEditor } from "@/components/appointments/availability-editor";
import { DisruptionPanel } from "@/components/appointments/disruption-panel";
import { CalendarView } from "@/components/appointments/calendar-view";
import { AppointmentDrawer } from "@/components/appointments/appointment-drawer";
import { ClinicalModal } from "@/components/appointments/clinical-modal";
import { addDays, timeLabel } from "./utils";

export function AppointmentManager({
  organizationId, organizationName, businessCategory, locations, services, resources, appointments,
  availability, exceptions, reminders, bookingSlug, whatsappNumber, reminderCount, nowIso, providerDepartments
}: {
  organizationId: string; organizationName: string; businessCategory: string; locations: Location[]; services: Service[]; resources: Resource[]; appointments: Appointment[]; availability: Availability[]; exceptions: ScheduleException[]; reminders: Reminder[]; bookingSlug: string; whatsappNumber: string; reminderCount: number; nowIso: string; providerDepartments: Array<{ resource_id: string; department_id: string }>;
}) {
  const state = useAppointments(
    organizationId, locations, services, resources, appointments, availability, exceptions, nowIso, providerDepartments
  );

  const ready = locations.length > 0 && services.length > 0 && resources.length > 0;

  return (
    <section className="mx-auto grid max-w-7xl gap-5 pb-12">
      <WorkspaceHero
        tag="OPERATIONS CALENDAR"
        title="Appointment Management"
        subtitle="View and manage all your appointments and scheduling rules."
        action={
          <div className="flex flex-wrap items-center gap-3">
            {bookingSlug && (
              <>
                <a className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-[13px] font-bold text-white shadow-sm transition-all hover:bg-white/10" href={`/book/${bookingSlug}`} target="_blank" rel="noreferrer">Open booking page</a>
                <BookingShare slug={bookingSlug} whatsappNumber={whatsappNumber} businessName={organizationName} businessCategory={businessCategory} />
              </>
            )}
            <button className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-[13px] font-bold text-white shadow-sm transition-all hover:bg-white/10" onClick={() => state.setDisruptionOpen(!state.disruptionOpen)}>Emergency change</button>
            <button className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-[13px] font-bold text-white shadow-sm transition-all hover:bg-white/10" onClick={() => state.setAvailabilityOpen(!state.availabilityOpen)}>Availability</button>
            <button className="inline-flex min-h-10 items-center justify-center rounded-xl bg-teal-500 px-4 text-[13px] font-bold text-white shadow-sm transition-all hover:bg-teal-400 disabled:opacity-50" onClick={() => state.setOpen(!state.open)} disabled={!ready}>{state.open ? "Close" : "+ New appointment"}</button>
          </div>
        }
      />
      {!ready && <div className="form-message">Complete at least one location and service in <Link href="/app/settings">Business setup</Link>.</div>}

      {state.open && (
        <BookingForm
          locations={locations} services={services} resources={resources}
          customerName={state.customerName} setCustomerName={state.setCustomerName}
          customerPhone={state.customerPhone} setCustomerPhone={state.setCustomerPhone}
          customerEmail={state.customerEmail} setCustomerEmail={state.setCustomerEmail}
          locationId={state.locationId} setLocationId={state.setLocationId}
          serviceId={state.serviceId} setServiceId={state.setServiceId}
          resourceId={state.resourceId} setResourceId={state.setResourceId}
          notes={state.notes} setNotes={state.setNotes}
          selectedDate={state.selectedDate} setSelectedDate={state.setSelectedDate}
          selectedSlot={state.selectedSlot} setSelectedSlot={state.setSelectedSlot}
          chosenService={state.chosenService} chosenRules={state.chosenRules} availableSlots={state.availableSlots}
          busy={state.busy} message={state.message} createAppointment={state.createAppointment} today={state.today}
        />
      )}

      {state.availabilityOpen && (
        <AvailabilityEditor
          resources={resources}
          availabilityResource={state.availabilityResource} setAvailabilityResource={state.setAvailabilityResource}
          loadSchedule={state.loadSchedule}
          schedule={state.schedule} setSchedule={state.setSchedule}
          saveAvailability={state.saveAvailability}
          busy={state.busy} message={state.message}
        />
      )}

      {state.disruptionOpen && (
        <DisruptionPanel
          resources={resources} locations={locations} today={state.today}
          disruptionResource={state.disruptionResource} setDisruptionResource={state.setDisruptionResource}
          disruptionLocation={state.disruptionLocation} setDisruptionLocation={state.setDisruptionLocation}
          disruptionDate={state.disruptionDate} setDisruptionDate={state.setDisruptionDate}
          disruptionType={state.disruptionType} setDisruptionType={state.setDisruptionType}
          disruptionStart={state.disruptionStart} setDisruptionStart={state.setDisruptionStart}
          disruptionEnd={state.disruptionEnd} setDisruptionEnd={state.setDisruptionEnd}
          disruptionReason={state.disruptionReason} setDisruptionReason={state.setDisruptionReason}
          disruptionAffected={state.disruptionAffected} createDisruption={state.createDisruption}
          disruptionResult={state.disruptionResult} busy={state.busy} message={state.message}
        />
      )}

      {exceptions.length > 0 && (
        <section className="exception-list">
          <header>
            <div><span className="app-eyebrow">ACTIVE EXCEPTIONS</span><h3>Blocked schedule periods</h3></div>
            <span>{exceptions.filter((item) => item.status === "active").length} active</span>
          </header>
          {exceptions.slice(0, 5).map((item) => (
            <article key={item.id}>
              <i>{item.exception_type}</i>
              <b>{new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(item.starts_at))} – {timeLabel(new Date(item.ends_at))}</b>
              <span>{resources.find((resource) => resource.id === item.resource_id)?.name ?? "All providers"} · {locations.find((location) => location.id === item.location_id)?.name ?? "All chambers"}</span>
              <small>{item.reason}</small>
            </article>
          ))}
        </section>
      )}

      <div className="calendar-summary">
        <article><span>Providers</span><b>{resources.length}</b><small>Staff and bookable resources</small></article>
        <article><span>Locations</span><b>{locations.length}</b><small>Available for booking</small></article>
        <article><span>Appointments</span><b>{appointments.filter((item) => item.status !== "cancelled").length}</b><small>Current schedule</small></article>
        <article className="reminder-metric" onClick={() => state.setNotificationOpen(!state.notificationOpen)}>
          <span>Reminders queued</span><b>{reminderCount}</b><small>Open notification operations →</small>
        </article>
      </div>

      {state.notificationOpen && (
        <NotificationOperations reminders={reminders} setNotificationOpen={state.setNotificationOpen} />
      )}

      <FollowUpPlanner
        appointments={appointments}
        nowIso={nowIso}
        today={state.today}
        followUpAppointmentId={state.followUpAppointmentId}
        setFollowUpAppointmentId={state.setFollowUpAppointmentId}
        followUpDate={state.followUpDate}
        setFollowUpDate={state.setFollowUpDate}
        followUpNote={state.followUpNote}
        setFollowUpNote={state.setFollowUpNote}
        busy={state.busy}
        saveFollowUp={state.saveFollowUp}
        startFollowUpBooking={state.startFollowUpBooking}
        addDays={addDays}
      />

      <CalendarView
        view={state.view} setView={state.setView}
        weekStart={state.weekStart} setWeekStart={state.setWeekStart}
        today={state.today} addDays={addDays}
        filterLocation={state.filterLocation} setFilterLocation={state.setFilterLocation}
        filterResource={state.filterResource} setFilterResource={state.setFilterResource}
        filterStatus={state.filterStatus} setFilterStatus={state.setFilterStatus}
        locations={locations} resources={resources} appointments={appointments}
        filteredAppointments={state.filteredAppointments} weekDates={state.weekDates} weekAppointments={state.weekAppointments}
        setActiveAppointment={state.setActiveAppointment} setRescheduleDate={state.setRescheduleDate} setRescheduleSlot={state.setRescheduleSlot} setRescheduling={state.setRescheduling}
      />

      {state.activeAppointment && (
        <AppointmentDrawer
          activeAppointment={state.activeAppointment} setActiveAppointment={state.setActiveAppointment}
          updateStatus={state.updateStatus} cancelAppointment={state.cancelAppointment}
          rescheduling={state.rescheduling} setRescheduling={state.setRescheduling}
          substituteOpen={state.substituteOpen} setSubstituteOpen={state.setSubstituteOpen}
          substituteResources={state.substituteResources} setSubstituteResourceId={state.setSubstituteResourceId}
          setSubstituteDate={state.setSubstituteDate} setSubstituteSlot={state.setSubstituteSlot}
          today={state.today}
          rescheduleDate={state.rescheduleDate} setRescheduleDate={state.setRescheduleDate}
          rescheduleSlot={state.rescheduleSlot} setRescheduleSlot={state.setRescheduleSlot} rescheduleSlots={state.rescheduleSlots} rescheduleAppointment={state.rescheduleAppointment}
          substituteResourceId={state.substituteResourceId} substituteDate={state.substituteDate} substituteSlot={state.substituteSlot} substituteSlots={state.substituteSlots} assignSubstitute={state.assignSubstitute}
          busy={state.busy} message={state.message}
        />
      )}

      {state.documenting && state.activeAppointment && (
        <ClinicalModal
          activeAppointment={state.activeAppointment} setDocumenting={state.setDocumenting}
          encounterType={state.encounterType} setEncounterType={state.setEncounterType}
          diagnosis={state.diagnosis} setDiagnosis={state.setDiagnosis}
          clinicalNote={state.clinicalNote} setClinicalNote={state.setClinicalNote}
          treatmentPlan={state.treatmentPlan} setTreatmentPlan={state.setTreatmentPlan}
          visitFollowUpDate={state.visitFollowUpDate} setVisitFollowUpDate={state.setVisitFollowUpDate}
          today={state.today} completeConsultation={state.completeConsultation}
          busy={state.busy} message={state.message}
        />
      )}
    </section>
  );
}
