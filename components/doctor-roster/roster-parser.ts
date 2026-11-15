import * as XLSX from "xlsx";

export type ParsedDoctorRow = {
  doctor_name: string;
  specialization: string;
  department?: string;
  qualifications?: string;
  registration_number?: string;
  experience_years?: number | null;
  languages?: string;
  consultation_fee?: number | null;
  biography?: string;
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
    department: "Pediatrics",
    qualifications: "MBBS, MD (Pediatrics), DM (Neonatology)",
    registration_number: "WBMC-68421",
    experience_years: 14,
    languages: "English, Bengali, Hindi",
    consultation_fee: 900,
    contact_phone: "+919900001101",
    contact_email: "ananya.bose@example.com",
    chamber: "Chamber 1",
    weekdays: "1|3|5",
    start_time: "09:00",
    end_time: "13:00",
    slot_duration_minutes: 20,
    biography: "Senior Neonatologist specializing in newborn intensive care, high-risk infant follow-up, and neonatal nutrition.",
  },
  {
    doctor_name: "Dr Rohan Mukherjee",
    specialization: "Cardiology",
    department: "Cardiology",
    qualifications: "MBBS, MD (Med), DM (Cardiology), FACC",
    registration_number: "WBMC-71934",
    experience_years: 16,
    languages: "English, Bengali, Hindi",
    consultation_fee: 1000,
    contact_phone: "+919900001102",
    contact_email: "rohan.mukherjee@example.com",
    chamber: "Chamber 2",
    weekdays: "2|4",
    start_time: "10:00",
    end_time: "14:00",
    slot_duration_minutes: 20,
    biography: "Interventional Cardiologist focused on coronary angiography, hypertension management, and preventive heart health.",
  },
  {
    doctor_name: "Dr Ishita Sen",
    specialization: "Pediatrics",
    department: "Pediatrics",
    qualifications: "MBBS, DCH, DNB (Pediatrics)",
    registration_number: "WBMC-59280",
    experience_years: 11,
    languages: "English, Bengali",
    consultation_fee: 700,
    contact_phone: "+919900001103",
    contact_email: "ishita.sen@example.com",
    chamber: "Chamber 3",
    weekdays: "1|4",
    start_time: "15:00",
    end_time: "19:00",
    slot_duration_minutes: 20,
    biography: "Consultant Pediatrician with expertise in adolescent health, childhood asthma, and routine immunization.",
  },
  {
    doctor_name: "Dr Arindam Ghosh",
    specialization: "Orthopedics",
    department: "Orthopedics",
    qualifications: "MBBS, MS (Orthopedics), MCh",
    registration_number: "WBMC-64819",
    experience_years: 15,
    languages: "English, Bengali, Hindi",
    consultation_fee: 800,
    contact_phone: "+919900001104",
    contact_email: "arindam.ghosh@example.com",
    chamber: "Chamber 4",
    weekdays: "2|5",
    start_time: "09:30",
    end_time: "13:30",
    slot_duration_minutes: 20,
    biography: "Orthopedic & Joint Replacement Surgeon treating sports injuries, arthritis, and complex trauma fractures.",
  },
  {
    doctor_name: "Dr Priyanka Das",
    specialization: "Dermatology",
    department: "Dermatology",
    qualifications: "MBBS, MD (Dermatology, Venereology & Leprosy)",
    registration_number: "WBMC-83015",
    experience_years: 9,
    languages: "English, Bengali, Hindi",
    consultation_fee: 800,
    contact_phone: "+919900001105",
    contact_email: "priyanka.das@example.com",
    chamber: "Chamber 5",
    weekdays: "3|6",
    start_time: "11:00",
    end_time: "15:00",
    slot_duration_minutes: 20,
    biography: "Clinical and aesthetic dermatologist specializing in eczema, psoriasis, acne therapy, and laser skincare.",
  },
];

export const SAMPLE_CSV_CONTENT = `doctor_name,specialization,department,qualifications,registration_number,experience_years,languages,consultation_fee,contact_phone,contact_email,chamber,weekdays,start_time,end_time,slot_duration_minutes,biography
"Dr Ananya Bose","Neonatology","Pediatrics","MBBS, MD (Pediatrics), DM (Neonatology)","WBMC-68421",14,"English, Bengali, Hindi",900,"+919900001101","ananya.bose@example.com","Chamber 1","1|3|5","09:00","13:00",20,"Senior Neonatologist specializing in newborn intensive care, high-risk infant follow-up, and neonatal nutrition."
"Dr Rohan Mukherjee","Cardiology","Cardiology","MBBS, MD (Med), DM (Cardiology), FACC","WBMC-71934",16,"English, Bengali, Hindi",1000,"+919900001102","rohan.mukherjee@example.com","Chamber 2","2|4","10:00","14:00",20,"Interventional Cardiologist focused on coronary angiography, hypertension management, and preventive heart health."
"Dr Ishita Sen","Pediatrics","Pediatrics","MBBS, DCH, DNB (Pediatrics)","WBMC-59280",11,"English, Bengali",700,"+919900001103","ishita.sen@example.com","Chamber 3","1|4","15:00","19:00",20,"Consultant Pediatrician with expertise in adolescent health, childhood asthma, and routine immunization."
"Dr Arindam Ghosh","Orthopedics","Orthopedics","MBBS, MS (Orthopedics), MCh","WBMC-64819",15,"English, Bengali, Hindi",800,"+919900001104","arindam.ghosh@example.com","Chamber 4","2|5","09:30","13:30",20,"Orthopedic & Joint Replacement Surgeon treating sports injuries, arthritis, and complex trauma fractures."
"Dr Priyanka Das","Dermatology","Dermatology","MBBS, MD (Dermatology)","WBMC-83015",9,"English, Bengali, Hindi",800,"+919900001105","priyanka.das@example.com","Chamber 5","3|6","11:00","15:00",20,"Clinical and aesthetic dermatologist specializing in eczema, psoriasis, acne therapy, and laser skincare."
`;

export function downloadSampleXlsx() {
  const wb = XLSX.utils.book_new();
  const wsDoctorData = XLSX.utils.json_to_sheet(SAMPLE_DOCTOR_DATA);
  XLSX.utils.book_append_sheet(wb, wsDoctorData, "Doctor Data");

  const notesData = [
    { Column: "doctor_name", Required: "Yes", Description: "Doctor full name with title (e.g. Dr Ananya Bose)" },
    { Column: "specialization", Required: "Yes", Description: "Primary medical specialty (e.g. Neonatology, Cardiology)" },
    { Column: "department", Required: "Optional", Description: "OPD department name (auto-created if not already present; defaults to specialization)" },
    { Column: "qualifications", Required: "Optional", Description: "Medical degrees & fellowships (e.g. MBBS, MD, DM, DNB)" },
    { Column: "registration_number", Required: "Optional", Description: "Medical council registration number (e.g. WBMC-68421)" },
    { Column: "experience_years", Required: "Optional", Description: "Years of clinical practice as a number (e.g. 14)" },
    { Column: "languages", Required: "Optional", Description: "Languages spoken separated by commas (e.g. English, Bengali, Hindi)" },
    { Column: "consultation_fee", Required: "Optional", Description: "OPD consultation fee in INR/Rupees (e.g. 900)" },
    { Column: "contact_phone", Required: "Optional", Description: "Doctor mobile/WhatsApp with country code (e.g. +919900001101)" },
    { Column: "contact_email", Required: "Optional", Description: "Doctor official email (e.g. ananya.bose@example.com)" },
    { Column: "chamber", Required: "Yes", Description: "Chamber or room name (e.g. Chamber 1). Auto-created if missing." },
    { Column: "weekdays", Required: "Yes", Description: "Shift days: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 0 or 7=Sun. Pipe-separated for multiple days (e.g. 1|3|5)" },
    { Column: "start_time", Required: "Yes", Description: "Shift start time in 24h format HH:MM (e.g. 09:00)" },
    { Column: "end_time", Required: "Yes", Description: "Shift end time in 24h format HH:MM (e.g. 13:00)" },
    { Column: "slot_duration_minutes", Required: "Yes", Description: "Duration per appointment in minutes (e.g. 15, 20, 30)" },
    { Column: "biography", Required: "Optional", Description: "Patient-facing professional profile summary shown on WhatsApp and web booking" },
  ];
  const wsNotes = XLSX.utils.json_to_sheet(notesData);
  XLSX.utils.book_append_sheet(wb, wsNotes, "Column Guide");
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
    const department = row.department || row.dept || specialization;

    const qualifications = row.qualifications || row.qualification || row.degree || row.degrees || "";
    const registrationNumber =
      row.registration_number ||
      row.registration_no ||
      row.reg_no ||
      row.reg_num ||
      row.medical_registration_number ||
      row.medical_council_reg ||
      "";

    const rawExp = row.experience_years || row.experience || row.exp_years || row.years_of_experience || row.exp || "";
    const parsedExp = parseInt(rawExp, 10);
    const experienceYears = !isNaN(parsedExp) && parsedExp >= 0 ? parsedExp : null;

    const languages = row.languages || row.language || row.spoken_languages || "";

    const rawFee = row.consultation_fee || row.consultation_fees || row.fee || row.fees || row.price || row.charge || "";
    const parsedFee = parseFloat(rawFee.replace(/[^0-9.]/g, ""));
    const consultationFee = !isNaN(parsedFee) && parsedFee >= 0 ? parsedFee : null;

    const biography = row.biography || row.bio || row.about || row.description || row.profile_summary || "";

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
      qualifications,
      registration_number: registrationNumber,
      experience_years: experienceYears,
      languages,
      consultation_fee: consultationFee,
      biography,
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
