import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/workspace";

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
      <section className="relative flex flex-col gap-6 overflow-hidden rounded-2xl bg-slate-950 px-6 py-8 text-white shadow-xl sm:flex-row sm:items-center sm:justify-between sm:px-8 isolate mb-6">
        {/* Ambient Orbs & Grain */}
        <div className="absolute -top-32 -right-32 h-[30rem] w-[30rem] rounded-full bg-teal-500/20 blur-[120px] -z-10 pointer-events-none" />
        <div className="absolute -bottom-32 -left-32 h-[30rem] w-[30rem] rounded-full bg-blue-600/20 blur-[120px] -z-10 pointer-events-none" />
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03] mix-blend-overlay pointer-events-none -z-10" />
        
        <div className="z-10 max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-teal-500/10 px-2.5 py-1 text-[10px] font-bold tracking-widest text-teal-400 ring-1 ring-inset ring-teal-500/20 uppercase">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-teal-500"></span>
            </span>
            AUDIT TRAIL
          </span>
          <h2 className="mt-4 text-2xl sm:text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white via-slate-100 to-slate-400 leading-[1.15]">
            Workspace activity
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-400 font-medium tracking-wide">
            Configuration events are visible now. Channel, automation and appointment events will join this timeline as those modules go live.
          </p>
        </div>
      </section>
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
