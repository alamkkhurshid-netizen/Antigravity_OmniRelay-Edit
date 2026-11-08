import { MedicineCatalogueSelection } from "./medicine-lookup";

export type Patient = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  age: number | null;
  date_of_birth: string | null;
  primary_contact_phone: string | null;
  identity_status: "unverified" | "verified" | "staff_verified";
  health_concern: string | null;
  locality: string | null;
  pincode: string | null;
  patient_summary: string | null;
  care_communications_consent: boolean;
  marketing_consent: boolean;
  first_seen_at: string;
  last_seen_at: string;
  avatar_storage_path: string | null;
  avatar_updated_at: string | null;
  avatar_url: string | null;
};

export type PatientGuardianLink = {
  id: string;
  patient_id: string;
  guardian_name: string;
  guardian_phone: string;
  relationship: "self" | "child" | "parent" | "spouse" | "relative" | "other";
  verification_status: "unverified" | "otp_verified" | "staff_verified";
  verified_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PatientAppointment = {
  id: string;
  patient_id: string | null;
  starts_at: string;
  status: string;
  source: string;
  notes: string | null;
  health_concern: string | null;
  patient_summary: string | null;
  location: { name: string } | null;
  service: { name: string } | null;
  resource: { name: string } | null;
};

export type PatientEncounter = {
  id: string;
  patient_id: string;
  appointment_id: string | null;
  encounter_type: string;
  occurred_at: string;
  diagnosis: string | null;
  clinical_note: string;
  treatment_plan: string | null;
  follow_up_at: string | null;
  follow_up_status: string;
  created_at: string;
};

export type PrescriptionItem = {
  id: string;
  prescription_id: string;
  medicine_name: string;
  dosage: string | null;
  frequency: string;
  duration: string | null;
  instructions: string | null;
  sort_order: number;
};

export type Prescription = {
  id: string;
  patient_id: string;
  encounter_id: string | null;
  appointment_id: string | null;
  prescription_number: string;
  issued_at: string;
  status: string;
  diagnosis: string | null;
  advice: string | null;
  tests_requested: string | null;
  follow_up_at: string | null;
  version: number;
  items: PrescriptionItem[];
};

export type PatientDocument = {
  id: string;
  patient_id: string;
  encounter_id: string | null;
  appointment_id: string | null;
  document_type: string;
  title: string;
  mime_type: string;
  file_size_bytes: number;
  created_at: string;
};

export type PatientConsentEvent = {
  id: string;
  patient_id: string;
  consent_type: "care_communications" | "marketing";
  previous_status: boolean | null;
  new_status: boolean;
  source: string;
  captured_at: string;
  note: string | null;
};

export type PatientCareTask = {
  id: string;
  patient_id: string;
  encounter_id: string | null;
  appointment_id: string | null;
  care_plan_id: string | null;
  task_type: "follow_up" | "call" | "test_review" | "document" | "care" | "other";
  title: string;
  details: string | null;
  due_at: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  status: "open" | "in_progress" | "completed" | "cancelled";
  assigned_to: string | null;
  created_by: string;
  completed_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PatientCarePlan = {
  id: string;
  patient_id: string;
  encounter_id: string | null;
  plan_type: "chronic_care" | "post_visit" | "preventive" | "recovery" | "other";
  title: string;
  goal: string | null;
  instructions: string | null;
  status: "draft" | "active" | "paused" | "completed" | "cancelled";
  starts_on: string;
  target_date: string | null;
  next_review_at: string | null;
  assigned_to: string | null;
  created_by: string;
  completed_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CarePlanReminder = {
  id: string;
  patient_id: string;
  care_plan_id: string;
  status: "active" | "paused" | "completed" | "cancelled";
  next_run_at: string;
  last_run_at: string | null;
};

export type ClinicStaff = {
  user_id: string | null;
  name: string;
  extra: { clinic_role?: string } | null;
};

export type MedicineDraft = {
  medicineName: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
  catalogueSelection: MedicineCatalogueSelection | null;
  reminderEnabled: boolean;
  reminderTimes: string;
  reminderDays: number;
};

export const emptyMedicine = (): MedicineDraft => ({
  medicineName: "",
  dosage: "",
  frequency: "",
  duration: "",
  instructions: "",
  catalogueSelection: null,
  reminderEnabled: false,
  reminderTimes: "09:00",
  reminderDays: 7,
});

export const carePlanTemplates = {
  custom: { label: "Custom", planType: "post_visit", title: "", goal: "", instructions: "" },
  post_visit: { label: "Post-visit review", planType: "post_visit", title: "Post-visit care review", goal: "Confirm the doctor-approved next step and review date.", instructions: "Assign a clinic owner, record the planned review, and document any completed follow-up." },
  recovery: { label: "Recovery follow-up", planType: "recovery", title: "Recovery follow-up plan", goal: "Coordinate the doctor-approved recovery review.", instructions: "Record the responsible owner and review date. Escalate clinical questions to the treating clinician." },
  chronic: { label: "Ongoing review", planType: "chronic_care", title: "Ongoing care review", goal: "Keep the doctor-approved review schedule and clinic ownership clear.", instructions: "Set the next review, assign the clinic owner, and capture the outcome after the review." },
} as const;

export function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}
