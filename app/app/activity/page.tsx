import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/workspace";
import { WorkspaceHero } from "@/components/workspace-hero";

export default async function ActivityPage() {
  const { supabase, organization } = await getWorkspace();
  if (!organization) redirect("/onboarding");
  const [{ data: locations }, { data: services }] = await Promise.all([
    supabase.from("business_locations").select("id,name,created_at").eq("organization_id", organization.id),
    supabase.from("organization_services").select("id,name,created_at").eq("organization_id", organization.id),
  ]);
  const events = [
    { name: "Workspace created", detail: organization.name, date: organization.created_at },
    ...(locations ?? []).map((item) => ({ name: "Location prepared", detail: item.name, date: item.created_at })),
    ...(services ?? []).map((item) => ({ name: "Service prepared", detail: item.name, date: item.created_at })),
  ].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return (
    <section className="mx-auto grid max-w-7xl gap-5 pb-12">
      <WorkspaceHero
        tag="AUDIT TRAIL"
        title="Workspace activity"
        subtitle="Configuration events are visible now. Channel, automation and appointment events will join this timeline as those modules go live."
      />
      <section className="data-panel">
        {events.map((event, index) => (
          <div className="data-row" key={`${event.name}-${index}`}>
            <b>{event.name}<small>{event.detail}</small></b>
            <span>{new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(event.date))}</span>
          </div>
        ))}
      </section>
    </section>
  );
}
