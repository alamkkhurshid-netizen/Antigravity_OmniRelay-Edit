/**
 * CSV audience parser and validator for OmniRelay broadcast campaigns.
 * Safely parses contact lists, normalizes phone numbers to E.164,
 * filters duplicates, and generates downloadable sample templates.
 */

export type ParsedContact = {
  name: string;
  phone: string;
  notes?: string;
};

export type ParseCsvResult = {
  validContacts: ParsedContact[];
  invalidCount: number;
  duplicateCount: number;
  totalRows: number;
  headers: string[];
};

export function normalizePhoneNumber(raw: string): string | null {
  if (!raw) return null;
  const cleaned = raw.trim();
  const digitsOnly = cleaned.replace(/\D/g, "");

  // Standard Indian 10-digit mobile starting with 6, 7, 8, or 9
  if (digitsOnly.length === 10 && /^[6-9]/.test(digitsOnly)) {
    return `+91${digitsOnly}`;
  }

  // 11 digits starting with 0 (e.g. 09831582626)
  if (digitsOnly.length === 11 && digitsOnly.startsWith("0") && /^[6-9]/.test(digitsOnly.slice(1))) {
    return `+91${digitsOnly.slice(1)}`;
  }

  // 12 digits starting with 91 (e.g. 919831582626)
  if (digitsOnly.length === 12 && digitsOnly.startsWith("91")) {
    return `+${digitsOnly}`;
  }

  // International standard E.164 (already has '+' or 10-15 digits)
  if (digitsOnly.length >= 10 && digitsOnly.length <= 15) {
    return `+${digitsOnly}`;
  }

  return null;
}

export function parseCampaignCsv(csvContent: string): ParseCsvResult {
  const lines = csvContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { validContacts: [], invalidCount: 0, duplicateCount: 0, totalRows: 0, headers: [] };
  }

  // Simple CSV line parser supporting basic quotes
  const parseLine = (text: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        result.push(current.trim().replace(/^"|"$/g, ""));
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim().replace(/^"|"$/g, ""));
    return result;
  };

  const rawHeaders = parseLine(lines[0]);
  const lowerHeaders = rawHeaders.map((h) => h.toLowerCase());

  // Find column indices
  let nameIndex = lowerHeaders.findIndex((h) =>
    ["name", "full_name", "patient_name", "patient", "customer", "contact_name"].includes(h)
  );
  let phoneIndex = lowerHeaders.findIndex((h) =>
    ["phone", "mobile", "whatsapp", "contact", "number", "tel", "phone_number", "mobile_number"].includes(h)
  );
  const notesIndex = lowerHeaders.findIndex((h) =>
    ["notes", "note", "health_concern", "concern", "tags", "tag", "remark", "remarks"].includes(h)
  );

  // If standard headers not found, fallback to column 0 = name, column 1 = phone
  if (phoneIndex === -1 && rawHeaders.length >= 2) {
    nameIndex = 0;
    phoneIndex = 1;
  }

  const seenPhones = new Set<string>();
  const validContacts: ParsedContact[] = [];
  let invalidCount = 0;
  let duplicateCount = 0;

  // Process rows after header
  for (let i = 1; i < lines.length; i++) {
    const row = parseLine(lines[i]);
    if (row.length === 0 || (row.length === 1 && !row[0])) continue;

    const rawName = nameIndex !== -1 ? row[nameIndex] : row[0] || "Patient";
    const rawPhone = phoneIndex !== -1 ? row[phoneIndex] : row[1] || "";
    const rawNotes = notesIndex !== -1 ? row[notesIndex] : "";

    const cleanName = (rawName || "").trim();
    const normalizedPhone = normalizePhoneNumber(rawPhone || "");

    if (!normalizedPhone || cleanName.length === 0) {
      invalidCount++;
      continue;
    }

    if (seenPhones.has(normalizedPhone)) {
      duplicateCount++;
      continue;
    }

    seenPhones.add(normalizedPhone);
    validContacts.push({
      name: cleanName,
      phone: normalizedPhone,
      notes: rawNotes ? rawNotes.trim() : undefined,
    });
  }

  return {
    validContacts,
    invalidCount,
    duplicateCount,
    totalRows: lines.length - 1,
    headers: rawHeaders,
  };
}

export function generateSampleCampaignCsv(): string {
  const bom = "\uFEFF";
  const rows = [
    "Full Name,Phone,Notes",
    "Ramesh Patel,+919831582626,Cardiology Patient",
    "Anita Sen,+919830012345,Health Camp Attendee",
    "Sunil Verma,+919811122233,Diabetic Checkup",
  ];
  return bom + rows.join("\r\n");
}
