export type RegisteredConsultant = {
  id: string;
  name: string;
  specialization: string;
  phone: string;
  email: string;
  queueEnabled: boolean;
  active: boolean;
  chambers: string[];
  shifts: Array<{
    id: string;
    weekday: number;
    dayLabel: string;
    startTime: string;
    endTime: string;
    slotMinutes: number;
    chamber: string;
  }>;
  scheduleSummary: string;
};


export type RosterRow = {
  id: string;
  resourceId: string;
  doctor: string;
  specialization: string;
  department: string;
  departmentId: string | null;
  chamber: string;
  startTime: string;
  endTime: string;
  slotMinutes: number;
  capacity: number;
  booked: number;
  empty: number;
  arrived: number;
  waiting: number;
  inConsultation: number;
  completed: number;
  noShow: number;
  doctorPhone: string | null;
  queueEnabled: boolean;
  dispatch: {
    status: string;
    failure_reason: string | null;
    scheduled_for: string;
    updated_at: string;
  } | null;
  exceptions: Array<{
    id: string;
    type: string;
    reason: string;
    startsAt: string;
    endsAt: string;
  }>;
};

export type OpsAlert = {
  key: string;
  severity: "warning" | "critical";
  title: string;
  detail: string;
};

export type ImportRow = {
  doctor_name: string;
  specialization: string;
  department?: string;
  contact_phone: string;
  contact_email: string;
  chamber: string;
  weekdays: number[];
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
};

export type Preview = {
  valid: boolean;
  committed: boolean;
  row_count: number;
  imported_count?: number;
  rows?: Array<ImportRow & { row: number }>;
  errors: Array<{ row: number; field: string; message: string }>;
};
