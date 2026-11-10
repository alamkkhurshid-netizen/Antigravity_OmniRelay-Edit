import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/workspace";
import { WhatsAppConnect } from "./whatsapp-connect";
import { TemplateReadiness } from "./template-readiness";
import { WorkspaceHero } from "@/components/workspace-hero";
import { CheckCircle2, Clock3, FileCheck2, PlugZap } from "lucide-react";

export default async function IntegrationsPage() {
  const {supabase,organization}=await getWorkspace();
  if(!organization)redirect("/onboarding");
  const [{data:connection},{data:templates},{data:reminders},{data:doctorDispatches},{count:queued},{count:sent},{count:failed}]=await Promise.all([
    supabase.from("channel_connections").select("status,provider,display_name,display_address,external_account_id,external_phone_number_id,capabilities,last_verified_at,last_error").eq("organization_id",organization.id).eq("channel","whatsapp").eq("provider","meta_cloud").maybeSingle(),
    supabase.from("channel_message_templates").select("id,event_type,provider_template_name,language_code,status,variable_map").eq("organization_id",organization.id).eq("channel","whatsapp").order("event_type"),
    supabase.from("reminder_events").select("event_type,status").eq("organization_id",organization.id).eq("channel","whatsapp").limit(500),
    supabase.from("doctor_queue_dispatches").select("status").eq("organization_id",organization.id).order("created_at",{ascending:false}).limit(100),
    supabase.from("reminder_events").select("id",{count:"exact",head:true}).eq("organization_id",organization.id).eq("channel","whatsapp").eq("status","scheduled"),
    supabase.from("reminder_events").select("id",{count:"exact",head:true}).eq("organization_id",organization.id).eq("channel","whatsapp").eq("status","sent"),
    supabase.from("reminder_events").select("id",{count:"exact",head:true}).eq("organization_id",organization.id).eq("channel","whatsapp").eq("status","failed"),
  ]);
  const isLive = connection?.status === "live";
  const isConnected = connection?.status === "connected" || connection?.status === "acceptance_testing";
  const connected = isLive || isConnected || connection?.status === "test";
  const approved = templates?.filter((item) => item.status === "approved").length ?? 0;
  const metaAppId = process.env.META_APP_ID;
  const embeddedSignupConfigurationId = process.env.META_EMBEDDED_SIGNUP_CONFIG_ID;
  const metaConfigMissing = !metaAppId || !embeddedSignupConfigurationId;

  const stagingProjectRef = "sqcprlkhsnfbydgzpsml";
  const targetEnv = (process.env.TARGET_ENV || process.env.VERCEL_ENV || "").toLowerCase();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  let isStaging = targetEnv === "staging" || targetEnv === "preview";
  try {
    if (new URL(supabaseUrl).hostname.toLowerCase() === `${stagingProjectRef}.supabase.co`) {
      isStaging = true;
    }
  } catch {
    // preserve targetEnv fallback
  }
  const callbackUrl = isStaging
    ? `https://${stagingProjectRef}.supabase.co/functions/v1/whatsapp-webhook`
    : `${supabaseUrl || "https://bywsjwpaezdlicsbujbk.supabase.co"}/functions/v1/whatsapp-webhook`;

  return (
    <section className="mx-auto grid max-w-7xl gap-3.5 pb-12 pt-1">
      {/* 1. GLOWING BLACK AI HERO BANNER (Brand Continuity) */}
      <WorkspaceHero
        tag="WHATSAPP INTEGRATION & CLOUD API"
        title="Turn every booking event into a reliable patient message."
        subtitle="OmniRelay owns the appointment state, reminder schedule and retry history. Meta Cloud API delivers approved templates without exposing privileged credentials to the browser."
        action={
          <aside className="flex min-w-52 flex-col justify-center rounded-xl border border-white/10 bg-white/5 p-3.5 shadow-sm backdrop-blur-md z-10">
            <span className="text-[11px] font-medium text-slate-300">
              {isLive ? "Active Live Connection" : isConnected ? "Connected (Acceptance Testing)" : connection?.status === "pending_registration" ? "Action Required: Registration" : "Test Mode / Pending"}
            </span>
            <div className="mt-1 flex items-center gap-2">
              <span className={`size-2 rounded-full ${isLive ? "bg-teal-400" : isConnected ? "bg-emerald-400" : "bg-amber-400"}`} />
              <b className={`text-sm font-bold tracking-tight ${isLive ? "text-teal-400" : isConnected ? "text-emerald-400" : "text-amber-400"}`}>
                {connection?.status ? connection.status.toUpperCase() : "READY TO CONNECT"}
              </b>
            </div>
          </aside>
        }
      />

      {/* 2. HIGH-DENSITY 4-METRIC STRIP WITH SIGNATURE TRADEMARK HIGHLIGHT */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Metric 1: Connection */}
        <article className="or-trademark-card flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-900 leading-snug">Connection</span>
            <div className={`grid size-7 place-items-center rounded-md ${isLive ? "bg-teal-50 text-teal-700" : isConnected ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
              <PlugZap size={14} />
            </div>
          </div>
          <div className="mt-2.5">
            <span className="text-2xl font-bold tracking-tight text-slate-900">
              {isLive ? "Live" : isConnected ? "Connected" : connection?.status === "pending_registration" ? "Pending Reg" : "Pending"}
            </span>
            <p className="mt-0.5 text-[11px] font-medium text-slate-600 truncate">
              {connection?.display_address || "Meta credentials required"}
            </p>
          </div>
        </article>

        {/* Metric 2: Approved Templates */}
        <article className="or-trademark-card flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-900 leading-snug">Approved Templates</span>
            <div className="grid size-7 place-items-center rounded-md bg-teal-50 text-teal-700">
              <FileCheck2 size={14} />
            </div>
          </div>
          <div className="mt-2.5">
            <span className="text-2xl font-bold tracking-tight text-slate-900">
              {approved}/{templates?.length ?? 0}
            </span>
            <p className="mt-0.5 text-[11px] font-medium text-slate-600">
              Meta-approved utility messages
            </p>
          </div>
        </article>

        {/* Metric 3: Queued */}
        <article className="or-trademark-card flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-900 leading-snug">Queued Delivery</span>
            <div className="grid size-7 place-items-center rounded-md bg-slate-100 text-slate-700">
              <Clock3 size={14} />
            </div>
          </div>
          <div className="mt-2.5">
            <span className="text-2xl font-bold tracking-tight text-slate-900">
              {queued ?? 0}
            </span>
            <p className="mt-0.5 text-[11px] font-medium text-slate-600">
              Waiting for delivery
            </p>
          </div>
        </article>

        {/* Metric 4: Delivered to Provider */}
        <article className="or-trademark-card flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-900 leading-snug">Delivered Messages</span>
            <div className="grid size-7 place-items-center rounded-md bg-emerald-50 text-emerald-700">
              <CheckCircle2 size={14} />
            </div>
          </div>
          <div className="mt-2.5">
            <span className="text-2xl font-bold tracking-tight text-slate-900">
              {sent ?? 0}
            </span>
            <p className="mt-0.5 text-[11px] font-medium text-slate-600">
              {failed ?? 0} failed attempts
            </p>
          </div>
        </article>
      </section>

      {/* Meta Config Error (if any) */}
      {metaConfigMissing && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800" role="alert">
          <h4 className="font-semibold text-sm">Meta Embedded Signup Configuration Missing</h4>
          <p className="mt-1 text-xs">
            {!metaAppId && !embeddedSignupConfigurationId
              ? "Neither META_APP_ID nor META_EMBEDDED_SIGNUP_CONFIG_ID is configured in the server environment."
              : !metaAppId
              ? "META_APP_ID environment variable is missing on the server."
              : "META_EMBEDDED_SIGNUP_CONFIG_ID environment variable is missing on the server."}
            {" "}Self-service WhatsApp connection cannot start until these variables are configured.
          </p>
        </div>
      )}

      {/* 3. WHATSAPP CONNECTION & PIN REGISTRATION CARD */}
      <WhatsAppConnect
        appId={metaAppId ?? ""}
        configurationId={embeddedSignupConfigurationId}
        connected={connected}
        connectionStatus={connection?.status}
        displayAddress={connection?.display_address}
        phoneNumberId={connection?.external_phone_number_id}
        lastError={connection?.last_error}
        onboardingMode={(connection?.capabilities as {onboarding_mode?:string}|null)?.onboarding_mode}
      />

      {/* 4. GUIDED META ONBOARDING PATH */}
      <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700">SMOOTH CLINIC ONBOARDING</span>
            <h3 className="text-sm font-bold text-slate-900 leading-snug">One guided Meta connection</h3>
          </div>
          <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800 border border-teal-200/60">
            Recommended: Coexistence
          </span>
        </header>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 py-3">
          <article className="flex items-start gap-2.5 rounded-lg border border-slate-100 bg-slate-50/50 p-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-md bg-teal-600 text-xs font-bold text-white shadow-2xs">1</span>
            <div>
              <b className="block text-xs font-bold text-slate-900">Continue with Meta</b>
              <small className="mt-0.5 block text-[11px] font-medium text-slate-600 leading-snug">Clinic owner signs in directly; OmniRelay never receives the Meta password.</small>
            </div>
          </article>
          <article className="flex items-start gap-2.5 rounded-lg border border-slate-100 bg-slate-50/50 p-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-md bg-teal-600 text-xs font-bold text-white shadow-2xs">2</span>
            <div>
              <b className="block text-xs font-bold text-slate-900">Select the business</b>
              <small className="mt-0.5 block text-[11px] font-medium text-slate-600 leading-snug">Choose the verified business portfolio and WhatsApp Business Account.</small>
            </div>
          </article>
          <article className="flex items-start gap-2.5 rounded-lg border border-slate-100 bg-slate-50/50 p-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-md bg-teal-600 text-xs font-bold text-white shadow-2xs">3</span>
            <div>
              <b className="block text-xs font-bold text-slate-900">Keep the existing number</b>
              <small className="mt-0.5 block text-[11px] font-medium text-slate-600 leading-snug">Where Meta marks it eligible, connect through Coexistence and retain the Business app.</small>
            </div>
          </article>
          <article className="flex items-start gap-2.5 rounded-lg border border-slate-100 bg-slate-50/50 p-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-md bg-teal-600 text-xs font-bold text-white shadow-2xs">4</span>
            <div>
              <b className="block text-xs font-bold text-slate-900">Automatic verification</b>
              <small className="mt-0.5 block text-[11px] font-medium text-slate-600 leading-snug">OmniRelay maps the tenant, subscribes webhooks and verifies the number before activation.</small>
            </div>
          </article>
        </div>

        <p className="border-t border-slate-100 pt-3 text-xs font-medium text-slate-700 leading-relaxed">
          <strong className="font-bold text-slate-900">Existing WhatsApp Business app number:</strong> choose Coexistence only when Meta offers it. If it is not offered, exit without changes and review eligibility; OmniRelay will never silently migrate or replace that number. <strong className="font-bold text-slate-900">New spare SIM:</strong> choose Meta&apos;s new-phone-number path instead—Coexistence is not required.
        </p>
      </section>

      {/* 5. TEMPLATE READINESS COMPONENT */}
      <TemplateReadiness templates={templates??[]} reminders={reminders??[]} doctorDispatches={doctorDispatches??[]}/>

      {/* 6. CONNECTION FOUNDATION & WEBHOOK */}
      <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700">CONNECTION FOUNDATION</span>
            <h3 className="text-sm font-bold text-slate-900 leading-snug">Meta Cloud API readiness</h3>
          </div>
          <span className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold border ${
            connected ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-slate-50 text-slate-700 border-slate-200"
          }`}>
            {connected ? "Verified" : "Embedded Signup pending"}
          </span>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 py-3">
          <article className="flex items-start gap-2.5 rounded-lg border border-slate-100 bg-slate-50/50 p-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-md bg-emerald-50 text-xs font-bold text-emerald-700 border border-emerald-200">✓</span>
            <div>
              <b className="block text-xs font-bold text-slate-900">Secure server adapter</b>
              <small className="mt-0.5 block text-[11px] font-medium text-slate-600 leading-snug">Access tokens and app secrets stay server-side.</small>
            </div>
          </article>
          <article className="flex items-start gap-2.5 rounded-lg border border-slate-100 bg-slate-50/50 p-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-md bg-emerald-50 text-xs font-bold text-emerald-700 border border-emerald-200">✓</span>
            <div>
              <b className="block text-xs font-bold text-slate-900">Webhook verification</b>
              <small className="mt-0.5 block text-[11px] font-medium text-slate-600 leading-snug">Signature checking and delivery receipts are ready.</small>
            </div>
          </article>
          <article className="flex items-start gap-2.5 rounded-lg border border-slate-100 bg-slate-50/50 p-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-md bg-emerald-50 text-xs font-bold text-emerald-700 border border-emerald-200">✓</span>
            <div>
              <b className="block text-xs font-bold text-slate-900">Durable message queue</b>
              <small className="mt-0.5 block text-[11px] font-medium text-slate-600 leading-snug">Booking, reminder, cancellation and follow-up events are tracked.</small>
            </div>
          </article>
          <article className="flex items-start gap-2.5 rounded-lg border border-slate-100 bg-slate-50/50 p-3">
            <span className={`grid size-6 shrink-0 place-items-center rounded-md text-xs font-bold ${
              connected ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-200 text-slate-700"
            }`}>
              {connected ? "✓" : "4"}
            </span>
            <div>
              <b className="block text-xs font-bold text-slate-900">Meta credentials</b>
              <small className="mt-0.5 block text-[11px] font-medium text-slate-600 leading-snug">
                {connected ? "Business account and phone number verified." : "CTO will configure the required production secrets."}
              </small>
            </div>
          </article>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-slate-200/80 bg-slate-50/80 px-3.5 py-2.5">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700">CALLBACK URL</span>
            <code className="mt-0.5 text-xs font-semibold text-slate-900 font-mono select-all">{callbackUrl}</code>
          </div>
          <small className="text-[11px] font-medium text-slate-600 sm:max-w-md">
            Customer accounts are subscribed automatically during Embedded Signup; no 24×7 OmniRelay operator action is needed.
          </small>
        </div>
      </section>

      {/* 7. MESSAGE GOVERNANCE / TEMPLATE REGISTRY */}
      <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700">MESSAGE GOVERNANCE</span>
            <h3 className="text-sm font-bold text-slate-900 leading-snug">Required WhatsApp templates</h3>
          </div>
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
            Utility category
          </span>
        </header>

        <div className="divide-y divide-slate-100 py-1">
          {templates?.map((item) => (
            <article className="flex items-center justify-between gap-3 py-2.5" key={item.id}>
              <div>
                <b className="block text-xs font-bold text-slate-900 capitalize">{item.event_type.replaceAll("_", " ")}</b>
                <small className="text-[11px] font-medium text-slate-600">{item.provider_template_name} · {item.language_code}</small>
              </div>
              <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                item.status === "approved" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-slate-100 text-slate-700 border border-slate-200"
              }`}>
                {item.status}
              </span>
            </article>
          ))}
        </div>

        <p className="border-t border-slate-100 pt-3 text-xs font-medium text-slate-600">
          Templates stay in draft until their exact wording is reviewed and submitted in WhatsApp Manager. OmniRelay will dispatch only templates marked approved.
        </p>
      </section>

      {/* 8. ACTIVATION SEQUENCE */}
      <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700">ACTIVATION SEQUENCE</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
          <article className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
            <b className="grid size-6 place-items-center rounded-md bg-teal-50 text-xs font-bold text-teal-700 border border-teal-200">1</b>
            <span className="text-xs font-semibold text-slate-800">Meta app & WABA</span>
          </article>
          <article className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
            <b className="grid size-6 place-items-center rounded-md bg-teal-50 text-xs font-bold text-teal-700 border border-teal-200">2</b>
            <span className="text-xs font-semibold text-slate-800">Test phone & webhook</span>
          </article>
          <article className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
            <b className="grid size-6 place-items-center rounded-md bg-teal-50 text-xs font-bold text-teal-700 border border-teal-200">3</b>
            <span className="text-xs font-semibold text-slate-800">Template approval</span>
          </article>
          <article className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
            <b className="grid size-6 place-items-center rounded-md bg-teal-50 text-xs font-bold text-teal-700 border border-teal-200">4</b>
            <span className="text-xs font-semibold text-slate-800">Live monitoring</span>
          </article>
        </div>
      </section>
    </section>
  );
}
