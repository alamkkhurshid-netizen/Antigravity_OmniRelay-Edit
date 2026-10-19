import * as XLSX from "xlsx";

export type ParsedDoctorRow = {
  doctor_name: string;
  specialization: string;
  department?: string;
  contact_phone: string;
  contact_email: string;
  chamber: string;
  weekdays: number[];
  weekdaysLabel: string;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
};

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const DAY_MAP: Record<string, number> = {
  sun: 0,
  sunday: 0,
  "0": 0,
  "7": 0,
  mon: 1,
  monday: 1,
  "1": 1,
  tue: 2,
  tuesday: 2,
  "2": 2,
  wed: 3,
  wednesday: 3,
  "3": 3,
  thu: 4,
  thursday: 4,
  "4": 4,
  fri: 5,
  friday: 5,
  "5": 5,
  sat: 6,
  saturday: 6,
  "6": 6,
};

export const SAMPLE_DOCTOR_DATA = [
  {
    doctor_name: "Dr Ananya Bose",
    specialization: "Neonatology",
    contact_phone: "+919900001101",
    contact_email: "ananya.bose@example.com",
    chamber: "Chamber 1",
    weekdays: "1|3|5",
    start_time: "09:00",
    end_time: "13:00",
    slot_duration_minutes: 20,
  },
  {
    doctor_name: "Dr Rohan Mukherjee",
    specialization: "Pediatrics",
    contact_phone: "+919900001102",
    contact_email: "rohan.mukherjee@example.com",
    chamber: "Chamber 2",
    weekdays: "2|4",
    start_time: "10:00",
    end_time: "14:00",
    slot_duration_minutes: 20,
  },
  {
    doctor_name: "Dr Ishita Sen",
    specialization: "Neonatology",
    contact_phone: "+919900001103",
    contact_email: "ishita.sen@example.com",
    chamber: "Chamber 3",
    weekdays: "1|4",
    start_time: "15:00",
    end_time: "19:00",
    slot_duration_minutes: 20,
  },
  {
    doctor_name: "Dr Arindam Ghosh",
    specialization: "Pediatrics",
    contact_phone: "+919900001104",
    contact_email: "arindam.ghosh@example.com",
    chamber: "Chamber 4",
    weekdays: "2|5",
    start_time: "09:30",
    end_time: "13:30",
    slot_duration_minutes: 20,
  },
  {
    doctor_name: "Dr Priyanka Das",
    specialization: "Pediatrics",
    contact_phone: "+919900001105",
    contact_email: "priyanka.das@example.com",
    chamber: "Chamber 5",
    weekdays: "3|6",
    start_time: "11:00",
    end_time: "15:00",
    slot_duration_minutes: 20,
  },
];

export const SAMPLE_CSV_CONTENT = `doctor_name,specialization,contact_phone,contact_email,chamber,weekdays,start_time,end_time,slot_duration_minutes
Dr Ananya Bose,Neonatology,+919900001101,ananya.bose@example.com,Chamber 1,1|3|5,09:00,13:00,20
Dr Rohan Mukherjee,Pediatrics,+919900001102,rohan.mukherjee@example.com,Chamber 2,2|4,10:00,14:00,20
Dr Ishita Sen,Neonatology,+919900001103,ishita.sen@example.com,Chamber 3,1|4,15:00,19:00,20
Dr Arindam Ghosh,Pediatrics,+919900001104,arindam.ghosh@example.com,Chamber 4,2|5,09:30,13:30,20
Dr Priyanka Das,Pediatrics,+919900001105,priyanka.das@example.com,Chamber 5,3|6,11:00,15:00,20
`;

export function downloadSampleXlsx() {
  const wb = XLSX.utils.book_new();
  const wsDoctorData = XLSX.utils.json_to_sheet(SAMPLE_DOCTOR_DATA);
  XLSX.utils.book_append_sheet(wb, wsDoctorData, "Doctor Data");

  const notesData = [
    { Field: "Data type", Details: "Multi-Doctor OPD Weekly Shift Roster" },
    { Field: "Weekday convention", Details: "1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday, 7 or 0=Sunday" },
    { Field: "Multi-day shifts", Details: "Use pipe separator e.g. 1|3|5 for Monday, Wednesday, Friday" },
    { Field: "Chamber auto-creation", Details: "Chambers referenced here (e.g. Chamber 1, Chamber 2) will be auto-created if not already present" },
    { Field: "Time format", Details: "HH:MM 24-hour format e.g. 09:00, 14:30" },
    { Field: "Slot duration", Details: "Duration per appointment in minutes (e.g. 15, 20, 30)" },
  ];
  const wsNotes = XLSX.utils.json_to_sheet(notesData);
  XLSX.utils.book_append_sheet(wb, wsNotes, "Notes");
  XLSX.writeFile(wb, "Doctor_Roster_Template.xlsx");
}

export function downloadSampleCsv() {
  const blob = new Blob([SAMPLE_CSV_CONTENT], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", "Doctor_Roster_Template.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function parseRosterBuffer(buffer: ArrayBuffer): ParsedDoctorRow[] {
  const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const targetSheetName = wb.SheetNames.find((n) => /doctor|roster|data/i.test(n)) || wb.SheetNames[0];
  if (!targetSheetName || !wb.Sheets[targetSheetName]) {
    throw new Error("No readable worksheet found in the uploaded file.");
  }

  const rawRecords = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[targetSheetName], { raw: false });
  if (!rawRecords || rawRecords.length === 0) {
    throw new Error(`The sheet '${targetSheetName}' does not contain any doctor data rows.`);
  }

  return rawRecords.map((raw, idx) => {
    const row: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      const cleanKey = k.toLowerCase().trim().replace(/[\s\-_]+/g, "_");
      row[cleanKey] = typeof v === "string" ? v.trim() : String(v ?? "").trim();
    }

    const doctorName = row.doctor_name || row.doctor || row.name || row.physician || "";
    if (!doctorName) {
      throw new Error(`Row ${idx + 2}: Doctor name is required.`);
    }

    const specialization = row.specialization || row.specialty || row.specialisation || "General";
    const department = row.department || specialization;

    let contactPhone = row.contact_phone || row.phone || row.mobile || row.contact || "";
    if (contactPhone) {
      const digits = contactPhone.replace(/[^0-9]/g, "");
      if (digits.length === 10) {
        contactPhone = "+91" + digits;
      } else if (digits.length === 12 && digits.startsWith("91")) {
        contactPhone = "+" + digits;
      } else if (!contactPhone.startsWith("+") && digits.length >= 8) {
        contactPhone = "+" + digits;
      }
    }

    const contactEmail = (row.contact_email || row.email || "").toLowerCase();
    const chamber = row.chamber || row.chamber_name || row.room || row.location || "Chamber 1";

    const rawWeekdaysStr = row.weekdays || row.days || row.day || "1|2|3|4|5";
    const rawTokens = String(rawWeekdaysStr)
      .split(/[|,;/+]+/)
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    const weekdaysSet = new Set<number>();
    for (const token of rawTokens) {
      if (token in DAY_MAP) {
        weekdaysSet.add(DAY_MAP[token]);
      } else {
        const num = parseInt(token, 10);
        if (!isNaN(num) && num >= 0 && num <= 7) {
          weekdaysSet.add(num === 7 ? 0 : num);
        }
      }
    }

    const weekdays = Array.from(weekdaysSet).sort((a, b) => a - b);
    if (weekdays.length === 0) {
      weekdays.push(1, 2, 3, 4, 5);
    }
    const weekdaysLabel = weekdays.map((d) => DAY_NAMES[d]).join(", ");

    const startTime = row.start_time || row.start || row.from || "09:00";
    const endTime = row.end_time || row.end || row.to || "17:00";
    const slotDurationMinutes = parseInt(row.slot_duration_minutes || row.slot_duration || row.duration || "20", 10) || 20;

    return {
      doctor_name: doctorName,
      specialization,
      department,
      contact_phone: contactPhone,
      contact_email: contactEmail,
      chamber,
      weekdays,
      weekdaysLabel,
      start_time: startTime,
      end_time: endTime,
      slot_duration_minutes: slotDurationMinutes,
    };
  });
}
