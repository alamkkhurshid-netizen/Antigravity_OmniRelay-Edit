export type Patient = {
  id: string;
  full_name: string;
  phone: string | null;
  care_communications_consent: boolean;
};

export type Medicine = {
  id: string;
  medicine_name: string;
  dosage: string | null;
  frequency: string;
  duration: string | null;
  instructions: string | null;
};

export type Prescription = {
  id: string;
  patient_id: string;
  prescription_number: string;
  items: Medicine[];
};

export type Reminder = {
  id: string;
  patient_id: string;
  prescription_id: string | null;
  prescription_item_id: string | null;
  reminder_type: string;
  title: string;
  instructions: string | null;
  schedule_kind: "one_time" | "daily";
  scheduled_for: string | null;
  time_of_day: string | null;
  starts_on: string | null;
  ends_on: string | null;
  channel: string;
  status: string;
  consent_snapshot: boolean;
  next_run_at: string;
  last_run_at: string | null;
  created_at: string;
};

export type ReminderRun = {
  id: string;
  reminder_id: string;
  patient_id: string;
  scheduled_for: string;
  channel: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  failure_reason: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  approved_at: string | null;
  acknowledged_at: string | null;
  acknowledgement: string | null;
  response_kind: "confirmed" | "missed" | "snoozed" | "help" | null;
  response_text: string | null;
  response_received_at: string | null;
  created_at: string;
};

export type TemplateReadiness = { event_type: string; provider_template_name: string; status: string };

export type ChannelReadiness = { channel: string; status: string };

export type Adherence = {
  patient_id: string;
  total_doses: number;
  taken_doses: number;
  skipped_doses: number;
  snoozed_doses: number;
  help_requests: number;
  adherence_percent: number | null;
  last_response_at: string | null;
};
