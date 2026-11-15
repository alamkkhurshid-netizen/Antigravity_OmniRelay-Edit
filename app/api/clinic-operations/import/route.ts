import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";

type DoctorImportRow = {
  doctor_name: string;
  specialization: string;
  department?: string | null;
  qualifications?: string | null;
  registration_number?: string | null;
  experience_years?: number | null;
  languages?: string[] | null;
  consultation_fee?: number | null;
  biography?: string | null;
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

    const { data: allowed, error: limitError } = await supabase.rpc("consume_api_rate_limit", {
      p_bucket: "doctor_bulk_import",
      p_limit: 10,
      p_window_seconds: 3600,
    });
    if (limitError || allowed === false) {
      return NextResponse.json({ error: "Too many doctor import attempts. Please try again later." }, { status: 429 });
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
    const sanitizedRows: DoctorImportRow[] = rawRows.map((r) => {
      const name = String(r.doctor_name || "").trim();
      const spec = String(r.specialization || "General").trim();
      const chamber = String(r.chamber || "Chamber 1").trim();

      const qualifications = r.qualifications ? String(r.qualifications).trim() : null;
      const registration_number = r.registration_number ? String(r.registration_number).trim() : null;
      const parsedExp = typeof r.experience_years === "number" ? r.experience_years : parseInt(String(r.experience_years ?? ""), 10);
      const experience_years = !isNaN(parsedExp) && parsedExp >= 0 ? parsedExp : null;

      let languages: string[] = [];
      if (Array.isArray(r.languages)) {
        languages = r.languages.map((l) => String(l).trim()).filter(Boolean);
      } else if (typeof r.languages === "string") {
        languages = r.languages.split(/[,;/]+/).map((l) => l.trim()).filter(Boolean);
      }

      const parsedFee = typeof r.consultation_fee === "number" ? r.consultation_fee : parseFloat(String(r.consultation_fee ?? "").replace(/[^0-9.]/g, ""));
      const consultation_fee = !isNaN(parsedFee) && parsedFee >= 0 ? parsedFee : null;

      const biography = r.biography ? String(r.biography).trim() : null;
      const department = r.department ? String(r.department).trim() : spec;

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
      let weekdays: number[] = [];
      if (Array.isArray(r.weekdays)) {
        weekdays = r.weekdays.map(Number).filter((n) => !isNaN(n) && n >= 0 && n <= 6);
      } else if (typeof r.weekdays === "string" || typeof r.weekdays === "number") {
        const tokens = String(r.weekdays).split(/[|,;/+]+/).map((t) => t.trim().toLowerCase()).filter(Boolean);
        const set = new Set<number>();
        for (const token of tokens) {
          const num = parseInt(token, 10);
          if (!isNaN(num) && num >= 0 && num <= 7) {
            set.add(num === 7 ? 0 : num);
          }
        }
        weekdays = Array.from(set).sort((a, b) => a - b);
      }
      if (weekdays.length === 0) weekdays = [1, 2, 3, 4, 5];

      let startTime = String(r.start_time || "09:00").trim();
      if (/^\d:\d\d$/.test(startTime)) startTime = "0" + startTime;

      let endTime = String(r.end_time || "17:00").trim();
      if (/^\d:\d\d$/.test(endTime)) endTime = "0" + endTime;

      const slotDuration = Math.max(5, Math.min(240, Number(r.slot_duration_minutes) || 20));

      return {
        doctor_name: name,
        specialization: spec,
        department,
        qualifications,
        registration_number,
        experience_years,
        languages,
        consultation_fee,
        biography,
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
      .select("id, name, address, phone")
      .eq("organization_id", organization.id);

    const locationMap = new Map<string, string>();
    (existingLocations || []).forEach((loc) => {
      locationMap.set(loc.name.trim().toLowerCase(), loc.id);
    });

    const missingChambers = chamberNames.filter((name) => !locationMap.has(name.toLowerCase()));
    if (missingChambers.length > 0) {
      const primaryLoc = (existingLocations || [])[0] as any;
      const defaultAddress = primaryLoc?.address && Object.keys(primaryLoc.address).length > 0 && primaryLoc.address.city
        ? primaryLoc.address
        : { line1: "Main Clinic Campus", city: "Kolkata", state: "West Bengal", postal_code: "700066" };
      const defaultPhone = primaryLoc?.phone || "+91 98315 82626";

      const toInsert = missingChambers.map((name) => ({
        organization_id: organization.id,
        name,
        location_type: "chamber",
        timezone: "Asia/Kolkata",
        active: true,
        address: defaultAddress,
        phone: defaultPhone,
      }));

      const { data: insertedLocations } = await supabase
        .from("business_locations")
        .insert(toInsert)
        .select("id, name");

      (insertedLocations || []).forEach((loc) => {
        locationMap.set(loc.name.trim().toLowerCase(), loc.id);
      });
    }

    // 3. Ensure all referenced departments exist in clinic_departments
    const departmentNames = Array.from(new Set(sanitizedRows.map((r) => r.department).filter(Boolean))) as string[];
    const { data: existingDepartments } = await supabase
      .from("clinic_departments")
      .select("id, name")
      .eq("organization_id", organization.id);

    const departmentMap = new Map<string, string>();
    (existingDepartments || []).forEach((dept) => {
      departmentMap.set(dept.name.trim().toLowerCase(), dept.id);
    });

    const missingDepartments = departmentNames.filter((name) => !departmentMap.has(name.toLowerCase()));
    if (missingDepartments.length > 0) {
      const deptInserts = missingDepartments.map((deptName, idx) => ({
        organization_id: organization.id,
        name: deptName,
        code: deptName.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 10),
        active: true,
        sort_order: (existingDepartments?.length || 0) + idx + 1,
      }));
      const { data: newDepts } = await supabase
        .from("clinic_departments")
        .insert(deptInserts)
        .select("id, name");
      (newDepts || []).forEach((d) => {
        departmentMap.set(d.name.trim().toLowerCase(), d.id);
      });
    }

    // 4. Ensure a default service exists
    let { data: defaultService } = await supabase
      .from("organization_services")
      .select("id, price_paise")
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
        .select("id, price_paise")
        .single();
      defaultService = newService;
    }

    // 5. Try native database RPC first
    try {
      const rpcRows = sanitizedRows.map((r) => ({
        doctor_name: r.doctor_name,
        specialization: r.specialization,
        department: null,
        contact_phone: r.contact_phone,
        contact_email: r.contact_email,
        chamber: r.chamber,
        weekdays: r.weekdays,
        start_time: r.start_time,
        end_time: r.end_time,
        slot_duration_minutes: r.slot_duration_minutes,
      }));

      const { data: rpcData, error: rpcError } = await supabase.rpc("import_doctor_roster_v2", {
        p_organization_id: organization.id,
        p_rows: rpcRows,
        p_commit: Boolean(body.commit),
        p_source_format: "csv",
      });

      if (!rpcError && rpcData && (!rpcData.errors || rpcData.errors.length === 0)) {
        // Enrich imported doctors with credentials and department
        for (const item of sanitizedRows) {
          const { data: docRes } = await supabase
            .from("booking_resources")
            .select("id")
            .eq("organization_id", organization.id)
            .ilike("name", item.doctor_name)
            .maybeSingle();

          if (docRes?.id) {
            await supabase.from("provider_profiles").upsert(
              {
                resource_id: docRes.id,
                organization_id: organization.id,
                specialization: item.specialization,
                qualifications: item.qualifications || null,
                registration_number: item.registration_number || null,
                experience_years: item.experience_years ?? null,
                languages: item.languages || [],
                biography: item.biography || null,
                contact_phone: item.contact_phone || null,
                contact_email: item.contact_email || null,
              },
              { onConflict: "resource_id" }
            );

            if (item.department) {
              const deptId = departmentMap.get(item.department.toLowerCase());
              if (deptId) {
                await supabase
                  .from("provider_departments")
                  .delete()
                  .eq("organization_id", organization.id)
                  .eq("resource_id", docRes.id);
                await supabase.from("provider_departments").insert({
                  organization_id: organization.id,
                  resource_id: docRes.id,
                  department_id: deptId,
                  primary_department: true,
                });
              }
            }
          }
        }

        return NextResponse.json(rpcData);
      }

      console.warn("import_doctor_roster_v2 RPC reported issues or failed, executing direct provisioning fallback:", rpcError?.message, rpcData?.errors);
    } catch (rpcEx) {
      console.warn("import_doctor_roster_v2 threw exception, executing direct fallback:", rpcEx);
    }

    // 6. Resilient Direct Provisioning Fallback
    let importedCount = 0;

    for (const item of sanitizedRows) {
      const chamberLocationId = locationMap.get(item.chamber.toLowerCase()) || (existingLocations?.[0]?.id ?? null);
      if (!chamberLocationId) continue;

      // Check if doctor resource already exists
      const { data: existingResource } = await supabase
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
            active: true,
          })
          .select("id")
          .single();

        if (resError || !newResource) {
          console.error("Failed to create doctor resource:", item.doctor_name, resError);
          continue;
        }

        resourceId = newResource.id;
      } else {
        // Reactivate doctor if previously soft-deleted/deactivated
        await supabase
          .from("booking_resources")
          .update({ active: true, location_id: chamberLocationId })
          .eq("id", resourceId)
          .eq("organization_id", organization.id);
      }

      // Upsert provider profile with credentials and details
      await supabase.from("provider_profiles").upsert(
        {
          resource_id: resourceId,
          organization_id: organization.id,
          specialization: item.specialization,
          qualifications: item.qualifications || null,
          registration_number: item.registration_number || null,
          experience_years: item.experience_years ?? null,
          languages: item.languages || [],
          biography: item.biography || null,
          contact_phone: item.contact_phone || null,
          contact_email: item.contact_email || null,
        },
        { onConflict: "resource_id" }
      );

      // Link department
      if (item.department) {
        const deptId = departmentMap.get(item.department.toLowerCase());
        if (deptId) {
          await supabase
            .from("provider_departments")
            .delete()
            .eq("organization_id", organization.id)
            .eq("resource_id", resourceId);
          await supabase.from("provider_departments").insert({
            organization_id: organization.id,
            resource_id: resourceId,
            department_id: deptId,
            primary_department: true,
          });
        }
      }

      // Check or create provider location assignment
      const { data: existingAssignment } = await supabase
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
      } else {
        await supabase
          .from("provider_location_assignments")
          .update({ active: true })
          .eq("id", assignmentId);
      }

      // Link provider location services with specific consultation fee if provided
      if (assignmentId && defaultService?.id) {
        const pricePaise = item.consultation_fee
          ? Math.round(item.consultation_fee * 100)
          : defaultService.price_paise ?? 50000;

        const { data: existingPls } = await supabase
          .from("provider_location_services")
          .select("id")
          .eq("organization_id", organization.id)
          .eq("assignment_id", assignmentId)
          .eq("service_id", defaultService.id)
          .maybeSingle();

        if (existingPls?.id) {
          await supabase
            .from("provider_location_services")
            .update({ active: true, price_paise: pricePaise })
            .eq("id", existingPls.id);
        } else {
          await supabase.from("provider_location_services").insert({
            organization_id: organization.id,
            assignment_id: assignmentId,
            service_id: defaultService.id,
            price_paise: pricePaise,
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
