import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/workspace";
import { BillingWorkspace } from "./billing-workspace";
import { OperationalWallet } from "./operational-wallet";
import { BillingControls } from "./billing-controls";
import { ActiveWallet } from "./active-wallet";

export default async function BillingPage() {
  const { supabase, organization } = await getWorkspace();
  if (!organization) redirect("/onboarding");
  const [
    { data: entitlement }, 
    { data: plans }, 
    { data: orders }, 
    { data: notices }, 
    { data: invoices }, 
    { data: usage }, 
    { data: rates },
    { data: wallet },
    { data: tier }
  ] = await Promise.all([
    supabase.from("entitlements").select("plan_id,status,trial_started_at,trial_ends_at,current_period_end,conversations_quota").eq("organization_id", organization.id).maybeSingle(),
    supabase.from("saas_plans").select("id,name,monthly_price_paise,max_locations,max_seats,conversations_quota,features").eq("active",true).order("display_order"),
    supabase.from("saas_billing_orders").select("id,plan_id,amount_paise,status,paid_at,created_at,period_end").eq("organization_id",organization.id).order("created_at",{ascending:false}).limit(8),
    supabase.from("billing_notice_events").select("id,notice_type,status,scheduled_for").eq("organization_id",organization.id).lte("scheduled_for",new Date().toISOString()).order("scheduled_for",{ascending:false}).limit(5),
    supabase.from("saas_invoices").select("id,invoice_number,plan_id,total_paise,status,issued_at,period_start,period_end").eq("organization_id",organization.id).order("issued_at",{ascending:false}).limit(8),
    supabase.from("operational_usage_events").select("id,source_type,message_category,delivery_status,estimated_total_paise,occurred_at,metadata").eq("organization_id",organization.id).order("occurred_at",{ascending:false}).limit(30),
    supabase.from("whatsapp_rate_cards").select("message_category,base_rate_paise,platform_fee_paise,source_version,verification_status").eq("channel","whatsapp").eq("country_code","IN").in("verification_status",["draft","verified"]),
    supabase.schema("billing").from("tenant_wallets").select("balance_paise,warning_threshold_paise").eq("organization_id",organization.id).maybeSingle(),
    supabase.schema("billing").from("tenant_pricing_tiers").select("tier_name,markup_percentage").eq("organization_id",organization.id).maybeSingle()
  ]);
  const accessEnd=entitlement?.status==="active"?entitlement.current_period_end:entitlement?.trial_ends_at;
  const endLabel=accessEnd?new Intl.DateTimeFormat("en-IN",{day:"numeric",month:"long",year:"numeric"}).format(new Date(accessEnd)):"not scheduled";
  return <section className="mx-auto grid max-w-7xl gap-5 pb-12">
    <div className="relative flex flex-col gap-6 overflow-hidden rounded-2xl bg-slate-950 px-6 py-8 text-white shadow-xl sm:flex-row sm:items-center sm:justify-between sm:px-8 isolate mb-6">
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
          CURRENT ACCESS
        </span>
        <h2 className="mt-4 text-2xl sm:text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white via-slate-100 to-slate-400 leading-[1.15]">
          {entitlement?.status === "active" ? "Paid access" : "Trial access"} until {endLabel}
        </h2>
        <p className="mt-4 text-sm sm:text-base text-slate-400 font-medium tracking-wide">
          {entitlement?.plan_id ?? "launch"} plan · clinic access remains available while payment recovery is validated.
        </p>
      </div>
      
      <div className="flex flex-wrap items-center gap-3 z-10">
        <div className={`inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-[13px] font-bold text-white shadow-sm backdrop-blur-md`}>
          <div className="flex flex-col text-right">
            <span>Status</span>
            <span className={entitlement?.status === "active" ? "text-teal-400" : "text-amber-400 uppercase"}>{entitlement?.status ?? "pending"}</span>
          </div>
        </div>
      </div>
    </div>
    <BillingWorkspace plans={plans??[]} currentPlan={entitlement?.plan_id??null} status={entitlement?.status??"pending"} isTest={(process.env.RAZORPAY_KEY_ID??"").startsWith("rzp_test_")} business={organization.name}/>
    
    <div className="my-8">
      <ActiveWallet wallet={wallet ?? null} tier={tier ?? null} organizationId={organization.id} />
    </div>

    <OperationalWallet business={organization.name} usage={usage??[]} rates={rates??[]}/>
    <BillingControls usage={usage??[]} rates={rates??[]}/>
    <div className="billing-ledger"><article><span>INVOICES & PAYMENTS</span><h3>{invoices?.length??0} paid invoices</h3>{invoices?.length?invoices.map(invoice=><div className="billing-row flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-3 bg-slate-50 sm:bg-transparent rounded-xl sm:rounded-none" key={invoice.id}><div className="min-w-0"><b className="text-sm text-slate-800">{invoice.invoice_number}</b><small className="block text-xs text-slate-500">{invoice.plan_id} · {new Intl.DateTimeFormat("en-IN",{day:"numeric",month:"short",year:"numeric"}).format(new Date(invoice.issued_at))}</small></div><div className="flex items-center gap-3 self-end sm:self-auto"><span className="font-bold text-slate-900">₹{invoice.total_paise/100}</span><i className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase ${invoice.status}`}>{invoice.status}</i></div></div>):orders?.length?orders.map(order=><div className="billing-row flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-3 bg-slate-50 sm:bg-transparent rounded-xl sm:rounded-none" key={order.id}><div className="min-w-0"><b className="text-sm text-slate-800">{order.plan_id}</b><small className="block text-xs text-slate-500">{new Intl.DateTimeFormat("en-IN",{day:"numeric",month:"short",year:"numeric"}).format(new Date(order.created_at))}</small></div><div className="flex items-center gap-3 self-end sm:self-auto"><span className="font-bold text-slate-900">₹{order.amount_paise/100}</span><i className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase ${order.status}`}>{order.status}</i></div></div>):<p>No subscription payments yet.</p>}</article><article><span>REMINDER CENTRE</span><h3>{notices?.length??0} current notices</h3>{notices?.length?notices.map(notice=><div className="billing-row flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-3 bg-slate-50 sm:bg-transparent rounded-xl sm:rounded-none" key={notice.id}><div className="min-w-0"><b className="text-sm text-slate-800">{notice.notice_type.replaceAll("_"," ")}</b><small className="block text-xs text-slate-500">{new Intl.DateTimeFormat("en-IN",{day:"numeric",month:"short"}).format(new Date(notice.scheduled_for))}</small></div><i className={`self-end sm:self-auto rounded-full px-2.5 py-1 text-xs font-bold uppercase ${notice.status}`}>{notice.status}</i></div>):<p>Nothing needs your attention.</p>}</article></div>
  </section>;
}
