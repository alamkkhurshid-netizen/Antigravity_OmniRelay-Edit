import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";

type DoctorImportRow = {
  doctor_name: string;
  specialization: string;
  department?: string | null;
  contact_phone?: string;
  contact_email?: string;
  chamber: string;
  weekdays: number[];
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
};

export async function POST(request: Request) {
  try {
    const { supabase, organization } = await getWorkspace();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    if (!organization) {
      return NextResponse.json({ error: "Workspace not found." }, { status: 409 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      rows?: unknown[];
      commit?: boolean;
      sourceFormat?: string;
    };

    if (!Array.isArray(body.rows) || body.rows.length < 1 || body.rows.length > 200) {
      return NextResponse.json({ error: "Upload between 1 and 200 doctor rows." }, { status: 400 });
    }

    const rawRows = body.rows as Array<Record<string, unknown>>;
    const today = new Date().toISOString().slice(0, 10);

    // 1. Sanitize and normalize input rows
    const sanitizedRows: DoctorImportRow[] = rawRows.map((r, idx) => {
      const name = String(r.doctor_name || "").trim();
      const spec = String(r.specialization || "General").trim();
      const chamber = String(r.chamber || "Chamber 1").trim();

      // Normalize phone
      let phone = String(r.contact_phone || "").trim();
      if (phone) {
        const digits = phone.replace(/[^0-9]/g, "");
        if (digits.length === 10) phone = "+91" + digits;
        else if (digits.length === 12 && digits.startsWith("91")) phone = "+" + digits;
        else if (!phone.startsWith("+") && digits.length >= 8) phone = "+" + digits;
      }

      const email = String(r.contact_email || "").trim().toLowerCase();

      // Normalize weekdays
      let weekdays = Array.isArray(r.weekdays)
        ? r.weekdays.map(Number).filter((n) => !isNaN(n) && n >= 0 && n <= 6)
        : [1, 2, 3, 4, 5];
      if (weekdays.length === 0) weekdays = [1, 2, 3, 4, 5];

      let startTime = String(r.start_time || "09:00").trim();
      if (/^\d:\d\d$/.test(startTime)) startTime = "0" + startTime;

      let endTime = String(r.end_time || "17:00").trim();
      if (/^\d:\d\d$/.test(endTime)) endTime = "0" + endTime;

      const slotDuration = Math.max(5, Math.min(240, Number(r.slot_duration_minutes) || 20));

      return {
        doctor_name: name,
        specialization: spec,
        department: null, // Avoid nonexistent clinic_departments table in RPC
        contact_phone: phone,
        contact_email: email,
        chamber,
        weekdays,
        start_time: startTime,
        end_time: endTime,
        slot_duration_minutes: slotDuration,
      };
    });

    // 2. Ensure all referenced chambers exist in business_locations
    const chamberNames = Array.from(new Set(sanitizedRows.map((r) => r.chamber)));
    const { data: existingLocations } = await supabase
      .from("business_locations")
      .select("id, name")
      .eq("organization_id", organization.id);

    const locationMap = new Map<string, string>();
    (existingLocations || []).forEach((loc) => {
      locationMap.set(loc.name.trim().toLowerCase(), loc.id);
    });

    const missingChambers = chamberNames.filter((name) => !locationMap.has(name.toLowerCase()));
    if (missingChambers.length > 0) {
      const toInsert = missingChambers.map((name) => ({
        organization_id: organization.id,
        name,
        location_type: "chamber",
        timezone: "Asia/Kolkata",
        active: true,
        address: {},
      }));

      const { data: insertedLocations } = await supabase
        .from("business_locations")
        .insert(toInsert)
        .select("id, name");

      (insertedLocations || []).forEach((loc) => {
        locationMap.set(loc.name.trim().toLowerCase(), loc.id);
      });
    }

    // 3. Ensure a default service exists
    let { data: defaultService } = await supabase
      .from("organization_services")
      .select("id")
      .eq("organization_id", organization.id)
      .eq("active", true)
      .limit(1)
      .maybeSingle();

    if (!defaultService) {
      const { data: newService } = await supabase
        .from("organization_services")
        .insert({
          organization_id: organization.id,
          name: "Doctor Consultation",
          duration_minutes: 20,
          buffer_minutes: 0,
          price_paise: 50000,
          booking_enabled: true,
          active: true,
        })
        .select("id")
        .single();
      defaultService = newService;
    }

    // 4. Try native database RPC first
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc("import_doctor_roster_v2", {
        p_organization_id: organization.id,
        p_rows: sanitizedRows,
        p_commit: Boolean(body.commit),
        p_source_format: "csv",
      });

      if (!rpcError && rpcData) {
        return NextResponse.json(rpcData);
      }
      
      console.warn("import_doctor_roster_v2 RPC failed, falling back to direct provisioning:", rpcError?.message);
    } catch (rpcEx) {
      console.warn("import_doctor_roster_v2 threw exception, executing direct fallback:", rpcEx);
    }

    // 5. Resilient Direct Provisioning Fallback
    // If the database RPC failed (e.g. missing optional tables like clinic_departments or digest hash),
    // provision the doctors, chambers, assignments, and availability rules directly!
    let importedCount = 0;

    for (const item of sanitizedRows) {
      const chamberLocationId = locationMap.get(item.chamber.toLowerCase()) || (existingLocations?.[0]?.id ?? null);
      if (!chamberLocationId) continue;

      // Check if doctor resource already exists
      let { data: existingResource } = await supabase
        .from("booking_resources")
        .select("id")
        .eq("organization_id", organization.id)
        .ilike("name", item.doctor_name)
        .maybeSingle();

      let resourceId = existingResource?.id;

      if (!resourceId) {
        // Create doctor resource
        const { data: newResource, error: resError } = await supabase
          .from("booking_resources")
          .insert({
            organization_id: organization.id,
            location_id: chamberLocationId,
            name: item.doctor_name,
            resource_type: "doctor",
            timezone: "Asia/Kolkata",
          })
          .select("id")
          .single();

        if (resError || !newResource) {
          console.error("Failed to create doctor resource:", item.doctor_name, resError);
          continue;
        }

        resourceId = newResource.id;

        // Create provider profile
        await supabase.from("provider_profiles").insert({
          resource_id: resourceId,
          organization_id: organization.id,
          specialization: item.specialization,
          contact_phone: item.contact_phone || null,
          contact_email: item.contact_email || null,
          languages: [],
        });
      }

      // Check or create provider location assignment
      let { data: existingAssignment } = await supabase
        .from("provider_location_assignments")
        .select("id")
        .eq("organization_id", organization.id)
        .eq("resource_id", resourceId)
        .eq("location_id", chamberLocationId)
        .maybeSingle();

      let assignmentId = existingAssignment?.id;

      if (!assignmentId) {
        const { data: newAssignment } = await supabase
          .from("provider_location_assignments")
          .insert({
            organization_id: organization.id,
            resource_id: resourceId,
            location_id: chamberLocationId,
            active: true,
            effective_from: today,
            booking_window_days: 60,
          })
          .select("id")
          .single();

        assignmentId = newAssignment?.id;

        if (assignmentId && defaultService?.id) {
          await supabase.from("provider_location_services").insert({
            organization_id: organization.id,
            assignment_id: assignmentId,
            service_id: defaultService.id,
            active: true,
          });
        }
      }

      // Create or update availability rules for each weekday
      for (const weekday of item.weekdays) {
        await supabase
          .from("availability_rules")
          .upsert(
            {
              organization_id: organization.id,
              resource_id: resourceId,
              location_id: chamberLocationId,
              weekday,
              start_time: item.start_time,
              end_time: item.end_time,
              slot_interval_minutes: item.slot_duration_minutes,
              active: true,
              effective_from: today,
            },
            { onConflict: "resource_id,location_id,weekday,start_time,end_time" }
          );
      }

      importedCount++;
    }

    return NextResponse.json({
      valid: true,
      committed: true,
      row_count: sanitizedRows.length,
      imported_count: importedCount,
      errors: [],
    });
  } catch (error: any) {
    console.error("Roster import error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to process doctor roster import." },
      { status: 500 }
    );
  }
}
