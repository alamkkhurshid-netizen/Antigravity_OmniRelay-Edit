import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/workspace";
import { WorkspaceForm } from "./workspace-form";

export default async function BusinessSetupPage() {
  const { supabase, organization } = await getWorkspace();
  if (!organization) redirect("/onboarding");

  const [{ data: profile }, { data: locations }, { data: services }, { data: resources }, { data: providerProfiles }, { data: assignments }, { data: assignmentServices }, { data: chamberRules }, { data: paymentGateway }, {data:departments}, {data:providerDepartments}, {data:calendarConnections}] = await Promise.all([
    supabase.from("onboarding_profiles").select("*").eq("organization_id", organization.id).maybeSingle(),
    supabase.from("business_locations").select("*").eq("organization_id", organization.id).order("created_at"),
    supabase.from("organization_services").select("*").eq("organization_id", organization.id).order("created_at"),
    supabase.from("booking_resources").select("*").eq("organization_id", organization.id).eq("active", true).order("created_at"),
    supabase.from("provider_profiles").select("*").eq("organization_id", organization.id),
    supabase.from("provider_location_assignments").select("*").eq("organization_id", organization.id).order("created_at"),
    supabase.from("provider_location_services").select("*").eq("organization_id", organization.id),
    supabase.from("availability_rules").select("*").eq("organization_id", organization.id).not("location_id", "is", null).order("weekday").order("start_time"),
    supabase.from("payment_gateway_connections").select("provider,status,account_label,last_verified_at").eq("organization_id", organization.id).eq("provider", "razorpay").maybeSingle(),
    supabase.from("clinic_departments").select("id,name,code,description,active,sort_order").eq("organization_id",organization.id).order("sort_order").order("name"),
    supabase.from("provider_departments").select("department_id,resource_id,primary_department").eq("organization_id",organization.id),
    supabase.from("google_calendar_connections").select("resource_id,expires_at").eq("organization_id",organization.id)
  ]);

  return <WorkspaceForm organization={organization} profile={profile} locations={locations ?? []} services={services ?? []} resources={resources ?? []} providerProfiles={providerProfiles ?? []} assignments={assignments ?? []} assignmentServices={assignmentServices ?? []} chamberRules={chamberRules ?? []} paymentGateway={paymentGateway} departments={departments??[]} providerDepartments={providerDepartments??[]} calendarConnections={calendarConnections??[]} />;
}
