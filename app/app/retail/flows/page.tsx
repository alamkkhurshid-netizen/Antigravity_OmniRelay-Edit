import Link from "next/link";
import { ArrowLeft, Workflow, Save } from "lucide-react";
import { getWorkspace } from "@/lib/workspace";
import { FlowCanvas } from "./flow-canvas";

export default async function FlowsPage() {
  const { supabase, organization } = await getWorkspace();

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between shrink-0">
        <div>
          <Link href="/app/retail" className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors">
            <ArrowLeft className="size-4" /> Back to Dashboard
          </Link>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
              <Workflow className="size-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Automation Builder</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Visually design your WhatsApp routing and automated responses.
          </p>
        </div>
      </header>

      <div className="relative flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm">
        <FlowCanvas organizationId={organization.id} />
      </div>
    </div>
  );
}
