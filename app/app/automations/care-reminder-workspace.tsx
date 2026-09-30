"use client";

import { WorkspaceHero } from "@/components/workspace-hero";
import { Patient, Prescription, Reminder, ReminderRun, TemplateReadiness, ChannelReadiness, Adherence } from "./types";
import { useCareReminderWorkspace } from "./use-care-reminder-workspace";
import { CareMetrics } from "@/components/automations/care-metrics";
import { AdherencePanel } from "@/components/automations/adherence-panel";
import { CareReminderPanel } from "@/components/automations/care-reminder-panel";
import { CareDispatchPanel } from "@/components/automations/care-dispatch-panel";
import { NewCareReminderModal } from "@/components/automations/new-care-reminder-modal";

export function CareReminderWorkspace({
  patients, prescriptions, reminders, runs, templates, channels, adherence, nowIso,
}: {
  patients: Patient[]; prescriptions: Prescription[]; reminders: Reminder[];
  runs: ReminderRun[]; templates: TemplateReadiness[]; channels: ChannelReadiness[];
  adherence: Adherence[]; nowIso: string;
}) {
  const state = useCareReminderWorkspace({
    patients, prescriptions, reminders, runs, templates, channels, adherence, nowIso,
  });

  return (
    <main className="mx-auto grid max-w-7xl gap-5 pb-12">
      <WorkspaceHero
        tag="PATIENT LIFECYCLE"
        title="Care that continues after the consultation."
        subtitle="Turn doctor-entered prescriptions and revisit dates into controlled reminder schedules. Nothing is sent without recorded care consent."
        action={
          <button className="inline-flex min-h-10 items-center justify-center rounded-xl bg-gradient-to-r from-teal-400 to-blue-500 px-4 text-[13px] font-bold text-slate-950 shadow-[0_0_20px_rgba(45,212,191,0.25)] transition-all hover:from-teal-300 hover:to-blue-400 hover:scale-[1.02]" onClick={() => state.setOpen(true)}>
            ＋ New care reminder
          </button>
        }
      />

      <CareMetrics 
        activeCount={state.active.length}
        needsAttention={state.needsAttention}
        failed={state.failed}
        ready={state.ready}
        needsClinicalFollowup={state.needsClinicalFollowup}
        acknowledged={state.acknowledged}
        delivered={state.delivered}
      />

      <AdherencePanel 
        adherence={adherence}
        patientMap={state.patientMap}
      />

      {state.error && <p className="care-error">{state.error}</p>}

      <CareReminderPanel 
        query={state.query}
        setQuery={state.setQuery}
        view={state.view}
        setView={state.setView}
        visibleReminders={state.visibleReminders}
        patientMap={state.patientMap}
        prescriptionMap={state.prescriptionMap}
        medicineMap={state.medicineMap}
        runByReminder={state.runByReminder}
        changeStatus={state.changeStatus}
      />

      <section className="care-safety-note">
        <span>CONTROLLED AUTOMATION</span>
        <div><b>Schedules are operational—not medical advice.</b><p>The doctor defines every medicine, instruction and time. OmniRelay records consent, queues due reminders and tracks delivery.</p></div>
      </section>

      <CareDispatchPanel 
        whatsappConnected={state.whatsappConnected}
        approvedTemplates={state.approvedTemplates}
        runRows={state.runRows}
        patientMap={state.patientMap}
        actOnRun={state.actOnRun}
      />

      <NewCareReminderModal 
        open={state.open}
        setOpen={state.setOpen}
        patientId={state.patientId}
        setPatientId={state.setPatientId}
        selectPrescription={state.selectPrescription}
        patients={patients}
        prescriptionId={state.prescriptionId}
        patientPrescriptions={state.patientPrescriptions}
        medicineId={state.medicineId}
        setMedicineId={state.setMedicineId}
        selectedPrescription={state.selectedPrescription}
        kind={state.kind}
        setKind={state.setKind}
        patientMap={state.patientMap}
        error={state.error}
        saving={state.saving}
        createReminder={state.createReminder}
      />
    </main>
  );
}
