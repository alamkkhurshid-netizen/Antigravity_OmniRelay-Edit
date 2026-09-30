export type Location = { id: string; name: string; location_type: string; address: Record<string,string>; phone: string | null };
export type Service = { id: string; name: string; duration_minutes: number; buffer_minutes: number; price_paise: number | null };
export type Resource = { id: string; name: string; resource_type: string; timezone: string };
export type Availability = { id: string; resource_id: string; location_id: string | null; weekday: number; start_time: string; end_time: string; slot_interval_minutes: number; active: boolean };
export type ScheduleException = { id:string; resource_id:string|null; location_id:string|null; starts_at:string; ends_at:string; exception_type:string; reason:string; status:string; created_at:string };
export type Reminder = { id:string; appointment_id:string; event_type:string; scheduled_for:string; channel:string; status:string; attempts:number; next_attempt_at:string|null; failure_reason:string|null; sent_at:string|null; delivered_at:string|null; read_at:string|null; appointment:{customer_name:string;starts_at:string}|null };
export type Appointment = {
  id: string; patient_id: string | null; resource_id: string; location_id: string; service_id: string;
  customer_name: string; customer_phone: string | null; customer_email: string | null;
  starts_at: string; ends_at: string; status: string; source: string; notes: string | null; payment_status:string;
  follow_up_at:string|null;follow_up_note:string|null;payment:Array<{payment_mode:string;amount_paise:number;status:string}>|null;
  resource: { name: string } | null; location: { name: string } | null;
  service: { name: string; duration_minutes: number } | null;
};
export type DaySchedule = { weekday: number; id: string; active: boolean; start_time: string; end_time: string; slot_interval_minutes: number };
