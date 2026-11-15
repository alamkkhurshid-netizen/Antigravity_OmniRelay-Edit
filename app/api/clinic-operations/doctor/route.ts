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
