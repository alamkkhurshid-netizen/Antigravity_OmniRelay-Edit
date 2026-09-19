import Link from "next/link";
import { ArrowLeft, Megaphone, CheckCircle2, Clock } from "lucide-react";
import { getWorkspace } from "@/lib/workspace";
import { BroadcastForm } from "./broadcast-form";

export default async function BroadcastsPage() {
  const { supabase, organization } = await getWorkspace();
  
  // Fetch existing broadcasts
  const { data: broadcasts } = await supabase
    .from("retail_broadcasts")
    .select("*")
    .order("created_at", { ascending: false });

  const safeBroadcasts = broadcasts || [];

  return (
    <div className="flex flex-col gap-6 pb-12">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/app/retail" className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors">
            <ArrowLeft className="size-4" /> Back to Dashboard
          </Link>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-rose-100 text-rose-600">
              <Megaphone className="size-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Broadcast Manager</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Send WhatsApp marketing campaigns to your past customers to drive repeat sales.
          </p>
        </div>
        
        <BroadcastForm organizationId={organization.id} />
      </header>

      <div className="mt-6 flex flex-col gap-4">
        <h2 className="text-sm font-bold text-slate-700">Recent Campaigns</h2>
        {safeBroadcasts.length === 0 ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white text-slate-500">
            <Megaphone className="mb-3 size-8 opacity-20" />
            <p className="text-sm font-medium">No broadcasts yet</p>
            <p className="text-xs">Create a campaign to re-engage your customers.</p>
          </div>
        ) : (
          safeBroadcasts.map((broadcast) => (
            <div key={broadcast.id} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-bold text-slate-900">{broadcast.name}</h3>
                <p className="mt-1 text-xs text-slate-500 line-clamp-1 max-w-xl">
                  "{broadcast.template_text}"
                </p>
                <div className="mt-3 flex items-center gap-4 text-xs font-medium text-slate-500">
                  <span className="flex items-center gap-1">
                    <Clock className="size-3.5" /> 
                    {new Intl.DateTimeFormat("en-IN", {
                      day: 'numeric', month: 'short', hour: 'numeric', minute: 'numeric'
                    }).format(new Date(broadcast.created_at))}
                  </span>
                  <span className="flex items-center gap-1">
                    <UsersIcon className="size-3.5" /> 
                    {broadcast.audience_type === 'all_customers' ? 'All Customers' : 'Custom List'}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                  broadcast.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 
                  broadcast.status === 'sending' ? 'bg-blue-100 text-blue-700' :
                  'bg-slate-100 text-slate-600'
                }`}>
                  {broadcast.status === 'completed' && <CheckCircle2 className="size-3.5" />}
                  {broadcast.status === 'sending' && <Clock className="size-3.5" />}
                  {broadcast.status.charAt(0).toUpperCase() + broadcast.status.slice(1)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Temporary icon to avoid importing too many things
function UsersIcon(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
