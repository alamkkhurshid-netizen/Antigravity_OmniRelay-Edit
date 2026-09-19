import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";

type Medicine = {
  medicineName?: string;
  catalogueSelection?: { id?: number } | null;
  dosage?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
  reminderEnabled?: boolean;
  reminderTimes?: string;
  reminderDays?: number;
};

type Payload = {
  patientId?: string;
  encounterId?: string | null;
  appointmentId?: string | null;
  diagnosis?: string;
  advice?: string;
  testsRequested?: string;
  followUpAt?: string | null;
  medicines?: Medicine[];
};

const clean = (value: unknown) =>
  typeof value === "string" ? value.trim() || null : null;

export async function POST(request: Request) {
  const { supabase, organization } = await getWorkspace();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 409 });
  }

  const payload = (await request.json().catch(() => ({}))) as Payload;
  const patientId = clean(payload.patientId);
  const medicines = (payload.medicines ?? [])
    .map((item) => {
      const reminderTimes = (clean(item.reminderTimes) ?? "")
        .split(",")
        .map((time) => time.trim())
        .filter(Boolean);
      return {
        medicine_name: clean(item.medicineName),
        catalog_entry_id: Number.isSafeInteger(item.catalogueSelection?.id)
          ? Number(item.catalogueSelection?.id)
          : null,
        dosage: clean(item.dosage),
        frequency: clean(item.frequency),
        duration: clean(item.duration),
        instructions: clean(item.instructions),
        reminder_enabled: item.reminderEnabled === true,
        reminder_times: reminderTimes,
        reminder_days: Math.min(365, Math.max(1, Number(item.reminderDays) || 1)),
      };
    })
    .filter((item) => item.medicine_name && item.frequency);

  if (!patientId) {
    return NextResponse.json({ error: "Patient is required." }, { status: 400 });
  }
  if (medicines.length === 0) {
    return NextResponse.json(
      { error: "Add at least one medicine with a frequency." },
      { status: 400 },
    );
  }
  if (medicines.length > 20) {
    return NextResponse.json({ error: "A prescription can contain up to 20 medicines." }, { status: 400 });
  }
  const invalidReminder = medicines.find(
    (item) =>
      item.reminder_enabled &&
      (item.reminder_times.length === 0 ||
        item.reminder_times.length > 6 ||
        item.reminder_times.some((time) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))),
  );
  if (invalidReminder) {
    return NextResponse.json(
      { error: "Reminder times must use 24-hour HH:MM format, with up to six times per medicine." },
      { status: 400 },
    );
  }

  const catalogIds = [
    ...new Set(
      medicines
        .map((item) => item.catalog_entry_id)
        .filter((id): id is number => id !== null),
    ),
  ];
  const { data: catalogEntries, error: catalogError } = catalogIds.length
    ? await supabase
        .from("medicine_catalog_entries")
        .select(
          "id,source_identifier,entry_type,display_name,generic_identifier,generic_name,product_identifier,product_name,supplier_identifier,supplier_name,dose_form_identifier,dose_form_name,route_identifiers,route_names",
        )
        .in("id", catalogIds)
    : { data: [], error: null };

  if (catalogError || (catalogEntries?.length ?? 0) !== catalogIds.length) {
    return NextResponse.json(
      { error: "One or more catalogue medicines are no longer active. Search and select them again." },
      { status: 409 },
    );
  }
  const catalogById = new Map((catalogEntries ?? []).map((entry) => [entry.id, entry]));
  const verifiedMedicines = medicines.map((medicine) => {
    const entry = medicine.catalog_entry_id
      ? catalogById.get(medicine.catalog_entry_id)
      : null;
    return {
      ...medicine,
      medicine_name: entry?.display_name ?? medicine.medicine_name,
      medicine_identifier: entry?.source_identifier ?? null,
      medicine_source: entry ? "cdci_flat" : "manual",
      catalogue_snapshot: entry ?? {},
    };
  });

  const { data, error } = await supabase.rpc("issue_clinical_prescription", {
    p_organization_id: organization.id,
    p_patient_id: patientId,
    p_encounter_id: clean(payload.encounterId),
    p_appointment_id: clean(payload.appointmentId),
    p_diagnosis: clean(payload.diagnosis),
    p_advice: clean(payload.advice),
    p_tests_requested: clean(payload.testsRequested),
    p_follow_up_at: clean(payload.followUpAt),
    p_medicines: verifiedMedicines,
  });

  if (error || !data?.prescription) {
    return NextResponse.json(
      { error: error?.message ?? "Prescription could not be issued." },
      { status: error?.code === "P0002" ? 404 : 400 },
    );
  }

  return NextResponse.json({
    prescription: data.prescription,
    reminderCount: data.reminder_count ?? 0,
    warning: data.reminders_skipped_for_consent
      ? "Prescription issued. Medication reminders were not activated because care-message consent is not active."
      : null,
  });
}
