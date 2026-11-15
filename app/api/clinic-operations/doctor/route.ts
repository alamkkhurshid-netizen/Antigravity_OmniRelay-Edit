import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";

export async function DELETE(request: Request) {
  try {
    const { supabase, organization } = await getWorkspace();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    if (!organization) {
      return NextResponse.json({ error: "Workspace not found." }, { status: 409 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Doctor resource ID required." }, { status: 400 });
    }

    // Check if doctor belongs to this organization
    const { data: doctor, error: docErr } = await supabase
      .from("booking_resources")
      .select("id, name")
      .eq("id", id)
      .eq("organization_id", organization.id)
      .maybeSingle();

    if (docErr || !doctor) {
      return NextResponse.json({ error: "Doctor not found in this clinic." }, { status: 404 });
    }

    // Check if doctor has active appointments
    const { count: appointmentCount } = await supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id)
      .eq("resource_id", id);

    if (appointmentCount && appointmentCount > 0) {
      // Discontinue doctor safely without breaking appointment history:
      // Deactivate resource and remove future availability rules
      await supabase
        .from("availability_rules")
        .delete()
        .eq("organization_id", organization.id)
        .eq("resource_id", id);

      await supabase
        .from("booking_resources")
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("organization_id", organization.id);

      return NextResponse.json({
        success: true,
        discontinued: true,
        message: `${doctor.name} has existing appointment records and has been safely discontinued (schedules and booking deactivated).`,
      });
    }

    // No existing appointments: clean cascade deletion
    try {
      await supabase
        .from("availability_rules")
        .delete()
        .eq("organization_id", organization.id)
        .eq("resource_id", id);

      await supabase
        .from("provider_departments")
        .delete()
        .eq("organization_id", organization.id)
        .eq("resource_id", id);

      const { data: assignments } = await supabase
        .from("provider_location_assignments")
        .select("id")
        .eq("organization_id", organization.id)
        .eq("resource_id", id);

      if (assignments && assignments.length > 0) {
        const assignmentIds = assignments.map((a) => a.id);
        await supabase
          .from("provider_location_services")
          .delete()
          .eq("organization_id", organization.id)
          .in("assignment_id", assignmentIds);

        await supabase
          .from("provider_location_assignments")
          .delete()
          .eq("organization_id", organization.id)
          .eq("resource_id", id);
      }

      await supabase
        .from("provider_profiles")
        .delete()
        .eq("organization_id", organization.id)
        .eq("resource_id", id);
    } catch (cleanErr) {
      console.warn("Child cleanup non-fatal warning:", cleanErr);
    }

    const { error: deleteError } = await supabase
      .from("booking_resources")
      .delete()
      .eq("id", id)
      .eq("organization_id", organization.id);

    if (deleteError) {
      // If foreign key constraint still blocks, fallback to deactivation
      await supabase
        .from("availability_rules")
        .delete()
        .eq("organization_id", organization.id)
        .eq("resource_id", id);

      await supabase
        .from("booking_resources")
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("organization_id", organization.id);

      return NextResponse.json({
        success: true,
        discontinued: true,
        message: `${doctor.name} has been discontinued and removed from the active roster.`,
      });
    }

    return NextResponse.json({
      success: true,
      deleted: true,
      message: `${doctor.name} was successfully removed from the clinic roster.`,
    });
  } catch (error: any) {
    console.error("Delete doctor error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to remove doctor." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const { supabase, organization } = await getWorkspace();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    if (!organization) {
      return NextResponse.json({ error: "Workspace not found." }, { status: 409 });
    }

    const body = await request.json().catch(() => ({}));
    const {
      id,
      name,
      specialization,
      qualifications,
      registration_number,
      experience_years,
      languages,
      biography,
      contact_phone,
      contact_email,
      shifts,
    } = body;

    if (!id) {
      return NextResponse.json({ error: "Doctor resource ID required." }, { status: 400 });
    }

    // Verify doctor belongs to this organization
    const { data: doctor, error: docErr } = await supabase
      .from("booking_resources")
      .select("id, name")
      .eq("id", id)
      .eq("organization_id", organization.id)
      .maybeSingle();

    if (docErr || !doctor) {
      return NextResponse.json({ error: "Doctor not found in this clinic." }, { status: 404 });
    }

    // Update doctor resource name if provided
    if (name && typeof name === "string" && name.trim()) {
      await supabase
        .from("booking_resources")
        .update({ name: name.trim(), updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("organization_id", organization.id);
    }

    // Update provider profile
    let cleanPhone = contact_phone ? String(contact_phone).trim() : null;
    if (cleanPhone) {
      const digits = cleanPhone.replace(/[^0-9]/g, "");
      if (digits.length === 10) cleanPhone = "+91" + digits;
      else if (digits.length === 12 && digits.startsWith("91")) cleanPhone = "+" + digits;
      else if (!cleanPhone.startsWith("+") && digits.length >= 8) cleanPhone = "+" + digits;
    }

    const parsedExp = typeof experience_years === "number" ? experience_years : parseInt(String(experience_years ?? ""), 10);
    const validExp = !isNaN(parsedExp) && parsedExp >= 0 ? parsedExp : null;

    let parsedLanguages: string[] = [];
    if (Array.isArray(languages)) {
      parsedLanguages = languages.map((l) => String(l).trim()).filter(Boolean);
    } else if (typeof languages === "string") {
      parsedLanguages = languages.split(/[,;/]+/).map((l) => l.trim()).filter(Boolean);
    }

    await supabase.from("provider_profiles").upsert(
      {
        resource_id: id,
        organization_id: organization.id,
        specialization: specialization || null,
        qualifications: qualifications || null,
        registration_number: registration_number || null,
        experience_years: validExp,
        languages: parsedLanguages,
        biography: biography || null,
        contact_phone: cleanPhone,
        contact_email: contact_email ? String(contact_email).trim().toLowerCase() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "resource_id" }
    );

    // If shifts array is provided, sync availability rules
    if (Array.isArray(shifts)) {
      const today = new Date().toISOString().slice(0, 10);

      // Fetch all locations for organization to resolve location_id
      const { data: orgLocations } = await supabase
        .from("business_locations")
        .select("id, name")
        .eq("organization_id", organization.id);

      const locMap = new Map<string, string>();
      (orgLocations || []).forEach((loc) => {
        locMap.set(loc.name.toLowerCase().trim(), loc.id);
        locMap.set(loc.id, loc.id);
      });
      const defaultLocId = orgLocations?.[0]?.id;

      // Delete existing availability rules for this doctor
      await supabase
        .from("availability_rules")
        .delete()
        .eq("organization_id", organization.id)
        .eq("resource_id", id);

      // Insert updated shifts
      const newRules = [];
      for (const shift of shifts) {
        let locId = shift.location_id;
        if (!locId || !locMap.has(locId)) {
          if (shift.chamber && locMap.has(shift.chamber.toLowerCase().trim())) {
            locId = locMap.get(shift.chamber.toLowerCase().trim());
          } else {
            locId = defaultLocId;
          }
        }
        if (!locId) continue;

        let startTime = String(shift.start_time || shift.startTime || "09:00").trim();
        if (/^\d:\d\d$/.test(startTime)) startTime = "0" + startTime;
        let endTime = String(shift.end_time || shift.endTime || "17:00").trim();
        if (/^\d:\d\d$/.test(endTime)) endTime = "0" + endTime;

        const weekday = Number(shift.weekday);
        if (isNaN(weekday) || weekday < 0 || weekday > 6) continue;

        const slotMinutes = Math.max(5, Math.min(240, Number(shift.slot_interval_minutes || shift.slotMinutes) || 20));

        // Ensure location assignment exists
        const { data: existingAssignment } = await supabase
          .from("provider_location_assignments")
          .select("id")
          .eq("organization_id", organization.id)
          .eq("resource_id", id)
          .eq("location_id", locId)
          .maybeSingle();

        if (!existingAssignment) {
          await supabase.from("provider_location_assignments").insert({
            organization_id: organization.id,
            resource_id: id,
            location_id: locId,
            active: true,
            effective_from: today,
            booking_window_days: 60,
          });
        }

        newRules.push({
          organization_id: organization.id,
          resource_id: id,
          location_id: locId,
          weekday,
          start_time: startTime,
          end_time: endTime,
          slot_interval_minutes: slotMinutes,
          active: true,
          effective_from: today,
        });
      }

      if (newRules.length > 0) {
        await supabase.from("availability_rules").insert(newRules);
      }
    }

    return NextResponse.json({
      success: true,
      message: `${name || doctor.name} details and shift schedules updated successfully.`,
    });
  } catch (error: any) {
    console.error("Update doctor error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update doctor." },
      { status: 500 }
    );
  }
}
